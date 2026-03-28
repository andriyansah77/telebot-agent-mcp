const rag = require('./rag');
const { chat } = require('./ai');
const db = require('./database');
const { executeToolCalls, executeNativeToolCalls, listTools, getToolDefinitions } = require('./tools');
const config = require('./config');
const fs = require('fs');
const path = require('path');

/**
 * Core agent logic — v5
 * - Persistent task execution (never gives up)
 * - sendProgress callback for live status updates
 * - Native function calling loop (up to 10 iterations)
 * - Tool failure → AI tries alternative
 * - Detailed execution log: every file write/command/edit is reported
 */
async function processMessage({ userId, channel, name, text, imageUrl, sendProgress }) {
  let user = db.getUser(userId, channel);
  if (!user) user = db.upsertUser(userId, channel, name);

  const isOwner = isOwnerUser(userId, channel);
  if (!isOwner && config.requireApproval && !user.approved) {
    return {
      reply: `👋 Halo ${name || 'kamu'}! Kamu perlu disetujui owner dulu sebelum bisa pakai bot ini.\n\nTunggu atau hubungi owner.`,
      pending: true,
    };
  }

  if (user.blocked) return { reply: null };

  db.addLog(userId, channel, 'message', (text || '').slice(0, 500));

  // RAG context
  let ragContext = '';
  if (text && text.length > 5) {
    try {
      const ragResults = await rag.search(text, 3);
      if (ragResults.length > 0) {
        ragContext = '\n\n## Relevant Knowledge\n' + ragResults.map(r => r.content).join('\n\n');
      }
    } catch {}
  }

  const history = db.getHistory(userId, channel, config.agent.maxHistory);

  const soulPath = path.join(__dirname, '..', 'SOUL.md');
  const soul = fs.existsSync(soulPath) ? fs.readFileSync(soulPath, 'utf8') : '';

  const systemPrompt = buildSystemPrompt(soul, ragContext);

  const messages = [
    { role: 'system', content: systemPrompt },
    ...history,
    {
      role: 'user',
      content: imageUrl
        ? [
            { type: 'image_url', image_url: { url: imageUrl } },
            { type: 'text', text: text || 'Apa yang ada di gambar ini? Deskripsikan secara detail.' },
          ]
        : (text || ''),
    },
  ];

  const toolDefs = getToolDefinitions();
  const useNativeCalling = ['blink', 'openai', 'openrouter', 'groq', 'anthropic', 'akashml'].includes(config.ai.provider);

  let finalReply;
  let toolsExecuted = [];

  if (useNativeCalling && toolDefs.length > 0) {
    finalReply = await runAgentLoop(messages, toolDefs, toolsExecuted, sendProgress);
  } else {
    let aiReply;
    try {
      aiReply = await chat(messages);
    } catch (e) {
      db.addLog(userId, channel, 'error', e.message);
      return { reply: `❌ AI error: ${e.message}` };
    }

    const { result, executed } = await executeToolCalls(aiReply);
    toolsExecuted = executed;

    if (executed.length > 0) {
      const toolResults = executed.map(e => `Tool ${e.tool} result:\n${e.output}`).join('\n\n');
      const followUp = [
        ...messages,
        { role: 'assistant', content: aiReply },
        { role: 'user', content: `Tool results:\n${toolResults}\n\nBerikan jawaban final yang detail.` },
      ];
      try { finalReply = await chat(followUp); }
      catch { finalReply = result; }
    } else {
      finalReply = result;
    }
  }

  db.addHistory(userId, channel, 'user', text || '[image]');
  db.addHistory(userId, channel, 'assistant', typeof finalReply === 'string' ? finalReply : JSON.stringify(finalReply));

  // Media detection
  if (typeof finalReply === 'string') {
    const mediaMatch = finalReply.match(/^(IMAGE|AUDIO|VIDEO):(https?:\/\/\S+)/m);
    if (mediaMatch) {
      return {
        reply: finalReply.replace(mediaMatch[0], '').trim() || null,
        media: { type: mediaMatch[1].toLowerCase(), url: mediaMatch[2] },
        toolsExecuted,
      };
    }
  }

  const imgTool = toolsExecuted.find(t => t.tool === 'generateImage' && t.output?.startsWith('IMAGE_URL:'));
  if (imgTool) {
    const imgUrl = imgTool.output.replace('IMAGE_URL:', '').trim();
    return {
      reply: typeof finalReply === 'string' ? finalReply : null,
      media: { type: 'image', url: imgUrl },
      toolsExecuted,
    };
  }

  return { reply: finalReply, toolsExecuted };
}

// ---- Human-readable tool step label ----
function describeToolCall(name, args) {
  switch (name) {
    case 'executeCommand':
      return `🖥 Menjalankan command:\n\`${(args.command || '').slice(0, 200)}\``;
    case 'readFile':
      return `📖 Membaca file: \`${args.path}\``;
    case 'writeFile':
      return `✏️ Menulis file: \`${args.path}\`\n_(${(args.content || '').length} karakter)_`;
    case 'appendFile':
      return `➕ Append ke file: \`${args.path}\``;
    case 'deleteFile':
      return `🗑 Menghapus file: \`${args.path}\``;
    case 'listDirectory':
      return `📂 List direktori: \`${args.path || '.'}\``;
    case 'httpGet':
      return `🌐 HTTP GET: \`${args.url}\``;
    case 'httpPost':
      return `📤 HTTP POST: \`${args.url}\``;
    case 'webSearch':
      return `🔍 Mencari: _${args.query}_`;
    case 'fetchPage':
      return `🌐 Fetch halaman: \`${args.url}\``;
    case 'generateImage':
      return `🎨 Generate gambar: _${args.prompt}_`;
    case 'remember':
      return `🧠 Menyimpan memori: \`${args.key}\` = \`${args.value}\``;
    case 'recall':
      return `🧠 Recall memori: \`${args.key || 'semua'}\``;
    case 'runJavaScript':
      return `⚡ Menjalankan JavaScript`;
    case 'calculator':
      return `🔢 Kalkulasi: \`${args.expression}\``;
    case 'installPackage':
      return `📦 Install package: \`${args.package}\``;
    default:
      return `🔧 Tool: \`${name}\``;
  }
}

// ---- Persistent Agent Loop ----
async function runAgentLoop(messages, toolDefs, toolsExecuted, sendProgress, maxIterations = 10) {
  let currentMessages = [...messages];
  let iteration = 0;
  let lastProgressAt = Date.now();

  while (iteration < maxIterations) {
    iteration++;

    let aiResponse;
    try {
      aiResponse = await chat(currentMessages, { tools: toolDefs, tool_choice: 'auto' });
    } catch (e) {
      console.error(`[Agent] AI call failed (iter ${iteration}):`, e.message);
      try {
        const stripped = [currentMessages[0], ...currentMessages.slice(-3)];
        aiResponse = await chat(stripped, { tools: toolDefs, tool_choice: 'auto' });
      } catch (e2) {
        return `❌ AI tidak bisa diakses saat ini: ${e2.message}`;
      }
    }

    // Final text answer
    if (typeof aiResponse === 'string') {
      return aiResponse;
    }

    // Tool calls
    if (aiResponse.type === 'tool_calls' && aiResponse.tool_calls?.length > 0) {
      const now = Date.now();

      // Send live progress: describe each tool call in human language
      if (sendProgress) {
        const stepDescriptions = aiResponse.tool_calls.map(tc => {
          const name = tc.name || tc.function?.name;
          let args = {};
          try { args = typeof tc.input === 'object' ? tc.input : JSON.parse(tc.function?.arguments || '{}'); } catch {}
          return describeToolCall(name, args);
        });

        // Only send if it's been a moment since last update (avoid spam for fast tools)
        if (now - lastProgressAt > 2000 || iteration === 1) {
          const progressMsg = stepDescriptions.join('\n');
          await sendProgress(progressMsg).catch(() => {});
          lastProgressAt = Date.now();
        }
      }

      const toolResults = await executeNativeToolCalls(aiResponse.tool_calls);

      for (const r of toolResults) {
        toolsExecuted.push({ tool: r.name, output: r.output });
      }

      currentMessages.push(aiResponse.message);

      for (const result of toolResults) {
        const isError = result.output.startsWith('Error:') || result.output.startsWith('IMAGE_ERROR:');
        currentMessages.push({
          role: 'tool',
          tool_call_id: result.id || result.name,
          content: isError
            ? `${result.output}\n\n[SYSTEM: Tool gagal. Analisis error ini, cari pendekatan alternatif, dan lanjutkan task. Jangan menyerah.]`
            : result.output,
        });
      }

      continue;
    }

    return typeof aiResponse === 'string'
      ? aiResponse
      : (aiResponse.message?.content || JSON.stringify(aiResponse));
  }

  // Max iterations — request final summary
  try {
    currentMessages.push({
      role: 'user',
      content: 'Buat laporan lengkap dari semua yang sudah dikerjakan: file apa yang dibuat/diedit, command apa yang dijalankan, output apa yang didapat, dan apa hasilnya.',
    });
    const final = await chat(currentMessages);
    return typeof final === 'string' ? final : JSON.stringify(final);
  } catch {
    return '✅ Semua steps selesai dieksekusi.';
  }
}

function buildSystemPrompt(soul, ragContext) {
  const today = new Date().toLocaleDateString('id-ID', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    timeZone: 'Asia/Jakarta',
  });
  const time = new Date().toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta' });
  const tools = listTools();

  return `${soul}

---

## Context
Tanggal: ${today}, ${time} WIB
Platform: Telegram Bot

## Tools
${tools}

## Prinsip Eksekusi (WAJIB DIIKUTI)
1. Jangan pernah berhenti di tengah task — kalau satu cara gagal, coba cara lain
2. Jangan bilang "tidak bisa" tanpa benar-benar mencoba semua opsi
3. Chain tools untuk task kompleks — search → fetch → execute → verify
4. Kalau tool error → analisis errornya, cari workaround, eksekusi ulang
5. Selesaikan sampai tuntas — task dianggap selesai hanya kalau ada hasil nyata

## Pelaporan Tugas (WAJIB)
Setiap kali melakukan operasi file atau command, WAJIB laporan detail:
- Kalau **menulis/edit file**: sebutkan nama file, path lengkap, apa yang diubah, dan tampilkan isi yang ditulis (minimal preview)
- Kalau **menjalankan command**: sebutkan command-nya dan tampilkan output hasilnya
- Kalau **membuat file baru**: sebutkan nama, lokasi, dan isi file
- Kalau **menghapus file**: sebutkan file yang dihapus dan alasannya
- Kalau **search/fetch web**: sebutkan apa yang dicari dan summary hasilnya
- Di akhir task: buat **ringkasan lengkap** — apa yang dikerjakan, file mana yang berubah, hasil akhirnya apa

## Format Output
- Bold untuk judul/highlight: **teks**
- Italic untuk emphasis
- Code block untuk kode/command
- Inline code untuk nama file/path/variabel
- Bullet list untuk daftar
- Jawaban singkat: plain text saja
- Jawaban/tugas panjang: terstruktur dengan section yang jelas
${ragContext}`;
}

function isOwnerUser(userId, channel) {
  if (channel === 'telegram') return parseInt(userId) === config.telegram.ownerId;
  if (channel === 'whatsapp') return userId === config.whatsapp.ownerNumber;
  return false;
}

module.exports = { processMessage, isOwnerUser };
