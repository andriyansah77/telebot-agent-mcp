const rag = require('./rag');
const { chat } = require('./ai');
const db = require('./database');
const { executeToolCalls, executeNativeToolCalls, listTools, getToolDefinitions } = require('./tools');
const config = require('./config');
const fs = require('fs');
const path = require('path');

/**
 * Core agent logic — v3
 * Supports native function calling (OpenAI-style) + legacy [CALL:] format
 */
async function processMessage({ userId, channel, name, text, imageUrl }) {
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

  // Get tool definitions for native function calling
  const toolDefs = getToolDefinitions();
  const useNativeCalling = ['blink', 'openai', 'openrouter', 'groq', 'anthropic', 'akashml'].includes(config.ai.provider);

  let finalReply;
  let toolsExecuted = [];

  if (useNativeCalling && toolDefs.length > 0) {
    // ---- Native function calling loop ----
    finalReply = await runAgentLoop(messages, toolDefs, toolsExecuted);
  } else {
    // ---- Legacy [CALL:] parsing ----
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
      const followUpMessages = [
        ...messages,
        { role: 'assistant', content: aiReply },
        { role: 'user', content: `Tool results:\n${toolResults}\n\nNow give your final response.` },
      ];
      try {
        finalReply = await chat(followUpMessages);
      } catch {
        finalReply = result;
      }
    } else {
      finalReply = result;
    }
  }

  // Save to history
  db.addHistory(userId, channel, 'user', text || '[image]');
  db.addHistory(userId, channel, 'assistant', typeof finalReply === 'string' ? finalReply : JSON.stringify(finalReply));

  // Handle media responses
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

  return { reply: finalReply, toolsExecuted };
}

// ---- Native function calling agent loop ----
async function runAgentLoop(messages, toolDefs, toolsExecuted, maxIterations = 5) {
  let currentMessages = [...messages];

  for (let i = 0; i < maxIterations; i++) {
    let aiResponse;
    try {
      aiResponse = await chat(currentMessages, { tools: toolDefs, tool_choice: 'auto' });
    } catch (e) {
      return `❌ AI error: ${e.message}`;
    }

    // String response = final answer
    if (typeof aiResponse === 'string') {
      return aiResponse;
    }

    // Tool calls
    if (aiResponse.type === 'tool_calls' && aiResponse.tool_calls?.length > 0) {
      const toolResults = await executeNativeToolCalls(aiResponse.tool_calls);
      toolsExecuted.push(...toolResults.map(r => ({ tool: r.name, output: r.output })));

      // Add assistant message with tool calls
      currentMessages.push(aiResponse.message);

      // Add tool results
      for (const result of toolResults) {
        currentMessages.push({
          role: 'tool',
          tool_call_id: result.id || result.name,
          content: result.output,
        });
      }
      // Continue loop for follow-up
      continue;
    }

    // Fallback
    return typeof aiResponse === 'string' ? aiResponse : JSON.stringify(aiResponse);
  }

  // Max iterations hit — ask AI for final summary
  try {
    currentMessages.push({ role: 'user', content: 'Berikan jawaban final berdasarkan semua informasi yang sudah dikumpulkan.' });
    const finalResponse = await chat(currentMessages);
    return typeof finalResponse === 'string' ? finalResponse : JSON.stringify(finalResponse);
  } catch {
    return 'Selesai mengeksekusi tools. Ada pertanyaan lain?';
  }
}

function buildSystemPrompt(soul, ragContext) {
  const today = new Date().toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const tools = listTools();

  return `${soul}

---

## Context
Tanggal hari ini: ${today}
Platform: Telegram Bot (multi-channel AI agent)

## Tools Available
Kamu memiliki akses ke tools berikut via native function calling:

${tools}

## Cara Kerja
- Gunakan tools secara proaktif untuk mengumpulkan informasi
- Chain multiple tools untuk task kompleks
- Eksekusi dulu, jelaskan setelah
- Kalau perlu cari informasi di web — pakai webSearch
- Kalau perlu jalankan perintah — pakai executeCommand
- Jawaban harus berdasarkan hasil tools, bukan tebakan

## Format
- Gunakan Markdown untuk formatting (bold, code block, dll)
- Pesan panjang: gunakan struktur yang jelas
- Code: selalu dalam code block
${ragContext}`;
}

function isOwnerUser(userId, channel) {
  if (channel === 'telegram') return parseInt(userId) === config.telegram.ownerId;
  if (channel === 'whatsapp') return userId === config.whatsapp.ownerNumber;
  return false;
}

module.exports = { processMessage, isOwnerUser };
