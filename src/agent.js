const rag = require('./rag');
const { chat } = require('./ai');
const db = require('./database');
const { executeToolCalls, executeNativeToolCalls, listTools, getToolDefinitions } = require('./tools');
const config = require('./config');
const fs = require('fs');
const path = require('path');

/**
 * Core agent logic — v4
 * - Persistent task execution (never gives up)
 * - sendProgress callback for long tasks
 * - Native function calling loop (up to 10 iterations)
 * - Tool failure → AI tries alternative approach automatically
 */
async function processMessage({ userId, channel, name, text, imageUrl, sendProgress }) {
  // Ensure user exists
  let user = db.getUser(userId, channel);
  if (!user) user = db.upsertUser(userId, channel, name);

  // Check approval
  const isOwner = isOwnerUser(userId, channel);
  if (!isOwner && config.requireApproval && !user.approved) {
    return {
      reply: `👋 Halo ${name || 'kamu'}! Kamu perlu disetujui owner dulu sebelum bisa pakai bot ini.\n\nTunggu atau hubungi owner.`,
      pending: true,
    };
  }

  if (user.blocked) return { reply: null };

  // Log message
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

  // Get history
  const history = db.getHistory(userId, channel, config.agent.maxHistory);

  // Load SOUL.md
  const soulPath = path.join(__dirname, '..', 'SOUL.md');
  const soul = fs.existsSync(soulPath) ? fs.readFileSync(soulPath, 'utf8') : '';

  // Build system prompt
  const systemPrompt = buildSystemPrompt(soul, ragContext);

  // Build messages
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
    // Legacy [CALL:] mode
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
        { role: 'user', content: `Tool results:\n${toolResults}\n\nBerikan jawaban final.` },
      ];
      try { finalReply = await chat(followUp); }
      catch { finalReply = result; }
    } else {
      finalReply = result;
    }
  }

  // Save to history
  db.addHistory(userId, channel, 'user', text || '[image]');
  db.addHistory(userId, channel, 'assistant', typeof finalReply === 'string' ? finalReply : JSON.stringify(finalReply));

  // Media detection: legacy prefix
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

  // Media detection: tool result IMAGE_URL
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

// ---- Persistent Agent Loop ----
// Rules:
// 1. Max 10 tool-call iterations
// 2. On tool error → inject error into context, let AI decide next step
// 3. Never tell user "can't do it" — always try alternative
// 4. If task is long, call sendProgress() between iterations
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
      // AI call failed — retry once with stripped history
      console.error(`[Agent] AI call failed (iter ${iteration}):`, e.message);
      try {
        // Retry with last 4 messages only
        const stripped = [
          currentMessages[0], // system
          ...currentMessages.slice(-3),
        ];
        aiResponse = await chat(stripped, { tools: toolDefs, tool_choice: 'auto' });
      } catch (e2) {
        return `❌ AI tidak bisa diakses saat ini: ${e2.message}`;
      }
    }

    // Final text answer — done
    if (typeof aiResponse === 'string') {
      return aiResponse;
    }

    // Tool call(s)
    if (aiResponse.type === 'tool_calls' && aiResponse.tool_calls?.length > 0) {
      // Send progress update if task is taking long (>8s since last update)
      const now = Date.now();
      if (sendProgress && now - lastProgressAt > 8000 && iteration > 1) {
        const toolNames = aiResponse.tool_calls.map(tc => tc.name || tc.function?.name).join(', ');
        await sendProgress(`Menjalankan: \`${toolNames}\`...`).catch(() => {});
        lastProgressAt = now;
      }

      const toolResults = await executeNativeToolCalls(aiResponse.tool_calls);

      // Collect executed tools
      for (const r of toolResults) {
        toolsExecuted.push({ tool: r.name, output: r.output });
      }

      // Add assistant turn
      currentMessages.push(aiResponse.message);

      // Add tool results — if a tool errored, inject retry instruction
      for (const result of toolResults) {
        const isError = result.output.startsWith('Error:') || result.output.startsWith('IMAGE_ERROR:');

        currentMessages.push({
          role: 'tool',
          tool_call_id: result.id || result.name,
          content: isError
            ? `${result.output}\n\n[SYSTEM: Tool failed. Cari cara lain untuk menyelesaikan task ini. Jangan menyerah, coba pendekatan alternatif.]`
            : result.output,
        });
      }

      continue; // next iteration
    }

    // Unexpected response shape — treat as final
    return typeof aiResponse === 'string'
      ? aiResponse
      : (aiResponse.message?.content || JSON.stringify(aiResponse));
  }

  // Hit max iterations — get final summary from AI
  try {
    currentMessages.push({
      role: 'user',
      content: 'Berikan laporan final dari semua yang sudah kamu kerjakan. Apa yang berhasil, apa hasilnya, dan apa langkah selanjutnya jika ada.',
    });
    const final = await chat(currentMessages);
    return typeof final === 'string' ? final : JSON.stringify(final);
  } catch {
    return '✅ Selesai mengeksekusi semua steps. Ketik lanjut jika ada yang perlu dilanjutkan.';
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
1. **Jangan pernah berhenti di tengah task** — kalau satu cara gagal, coba cara lain
2. **Jangan bilang "tidak bisa"** tanpa benar-benar mencoba semua opsi
3. **Chain tools** untuk task kompleks — search → fetch → execute → verify
4. **Kalau tool error** → analisis errornya, cari workaround, eksekusi ulang
5. **Selesaikan sampai tuntas** — task dianggap selesai hanya kalau ada hasil nyata
6. Eksekusi dulu, jelaskan setelah

## Format Output (PENTING)
- Bold untuk judul/highlight: **teks**
- Italic untuk emphasis: _teks_
- Code block untuk kode/command: triple backtick
- Inline code untuk nama file/variabel: single backtick
- Bullet list dengan tanda hubung atau bullet
- JANGAN campur format seperti bold-italic bersamaan
- JANGAN pakai heading (#) kecuali memang perlu section besar
- Jawaban singkat: plain text saja, tidak perlu format berlebihan
- Jawaban panjang/terstruktur: pakai heading dan list yang konsisten dan rapi
${ragContext}`;
}

function isOwnerUser(userId, channel) {
  if (channel === 'telegram') return parseInt(userId) === config.telegram.ownerId;
  if (channel === 'whatsapp') return userId === config.whatsapp.ownerNumber;
  return false;
}

module.exports = { processMessage, isOwnerUser };
