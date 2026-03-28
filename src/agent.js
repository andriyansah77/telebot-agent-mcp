const rag = require('./rag');
const { chat } = require('./ai');
const db = require('./database');
const { executeToolCalls, listTools } = require('./tools');
const config = require('./config');

/**
 * Core agent logic — channel-agnostic
 * Returns { reply, toolsExecuted }
 */
async function processMessage({ userId, channel, name, text, imageUrl }) {
  // Ensure user exists
  let user = db.getUser(userId, channel);
  if (!user) {
    user = db.upsertUser(userId, channel, name);
  }

  // Check approval
  const isOwner = isOwnerUser(userId, channel);
  if (!isOwner && config.requireApproval && !user.approved) {
    return {
      reply: `👋 Halo ${name || 'kamu'}! Kamu perlu disetujui owner dulu sebelum bisa pakai bot ini.\n\nSilakan tunggu atau hubungi owner.`,
      pending: true,
    };
  }

  if (user.blocked) {
    return { reply: null }; // Silently ignore blocked users
  }

  // Log message
  db.addLog(userId, channel, 'message', text.slice(0, 500));

  // Get history
  const history = db.getHistory(userId, channel, config.agent.maxHistory);

  // Build messages array
  const systemPrompt = buildSystemPrompt();
  const messages = [
    { role: 'system', content: systemPrompt },
    ...history,
    { role: 'user', content: imageUrl
        ? [{ type: 'image_url', image_url: { url: imageUrl } }, { type: 'text', text: text || 'Apa yang ada di gambar ini?' }]
        : text
    },
  ];

  // Call AI
  let aiReply;
  try {
    aiReply = await chat(messages);
  } catch (e) {
    db.addLog(userId, channel, 'error', e.message);
    return { reply: `❌ AI error: ${e.message}` };
  }

  // Execute tool calls in response
  const { result, executed } = await executeToolCalls(aiReply);

  // If tools were executed, send result back to AI for a follow-up
  let finalReply = result;
  if (executed.length > 0) {
    const toolResults = executed.map(e =>
      `Tool ${e.tool} result:\n${e.output}`
    ).join('\n\n');

    const followUpMessages = [
      ...messages,
      { role: 'assistant', content: aiReply },
      { role: 'user', content: `Tool results:\n${toolResults}\n\nNow give your final response based on these results.` },
    ];

    try {
      finalReply = await chat(followUpMessages);
    } catch {
      // Use the tool-replaced text if follow-up fails
      finalReply = result;
    }
  }

  // Save to history
  db.addHistory(userId, channel, 'user', text);
  db.addHistory(userId, channel, 'assistant', finalReply);

  // Handle special reply types from skills
  const mediaMatch = finalReply.match(/^(IMAGE|AUDIO|VIDEO):(https?:\/\/\S+)/m);
  if (mediaMatch) {
    return {
      reply: finalReply.replace(mediaMatch[0], '').trim() || null,
      media: { type: mediaMatch[1].toLowerCase(), url: mediaMatch[2] },
      toolsExecuted: executed
    };
  }

  return { reply: finalReply, toolsExecuted: executed };
}

function buildSystemPrompt() {
  const tools = listTools();
  return `${config.agent.systemPrompt}

You are ${config.agent.name}, a powerful AI agent running on a multi-channel platform (Telegram, WhatsApp).

## Available Tools
You can call tools using this format: [CALL: toolName({"key": "value"})]

${tools}

## Examples
- Run a command: [CALL: executeCommand({"command": "ls -la"})]
- Read a file: [CALL: readFile({"path": "/etc/hostname"})]
- Search web: [CALL: webSearch({"query": "latest AI news"})]
- HTTP GET: [CALL: httpGet({"url": "https://api.example.com/data"})]
- Calculate: [CALL: calculator({"expression": "2 ** 10"})]
- Run JS: [CALL: runJavaScript({"code": "return 2+2"})]

You can call multiple tools in one response. Always analyze tool results before giving your final answer.
Be concise, helpful, and action-oriented. When asked to do something, do it — don't just explain.`;
}

function isOwnerUser(userId, channel) {
  if (channel === 'telegram') return parseInt(userId) === config.telegram.ownerId;
  if (channel === 'whatsapp') return userId === config.whatsapp.ownerNumber;
  return false;
}

module.exports = { processMessage, isOwnerUser };
