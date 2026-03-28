require('dotenv').config();
const axios = require('axios');
const config = require('./config');

/**
 * Unified AI client — supports OpenAI, OpenRouter, Gemini, Anthropic, Groq, AkashML, Blink
 * v3 — native function calling support
 */
async function chat(messages, overrides = {}) {
  const provider = overrides.provider || config.ai.provider;

  switch (provider) {
    case 'gemini':
      return chatGemini(messages, overrides);
    case 'anthropic':
      return chatAnthropic(messages, overrides);
    case 'akashml':
      return chatAkashML(messages, overrides);
    case 'blink':
      return chatBlink(messages, overrides);
    default:
      return chatOpenAICompat(provider, messages, overrides);
  }
}

// ---- OpenAI-compatible ----
async function chatOpenAICompat(provider, messages, overrides) {
  const cfg = config.ai[provider] || config.ai.custom;
  const apiKey = overrides.apiKey || cfg.apiKey;
  const baseUrl = overrides.baseUrl || cfg.baseUrl;
  const model = overrides.model || cfg.model;

  if (!apiKey) throw new Error(`No API key for provider: ${provider}`);
  if (!baseUrl) throw new Error(`No base URL for provider: ${provider}`);

  const headers = {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  };

  if (provider === 'openrouter') {
    headers['HTTP-Referer'] = 'https://github.com/andriyansah77/telebot-agent-mcp';
    headers['X-Title'] = 'GweiAgents';
  }

  const body = {
    model,
    messages,
    max_tokens: overrides.maxTokens || config.agent.maxTokens,
    temperature: overrides.temperature ?? config.agent.temperature,
    top_p: overrides.topP || 0.9,
  };

  if (overrides.tools) body.tools = overrides.tools;
  if (overrides.tool_choice) body.tool_choice = overrides.tool_choice;

  const res = await axios.post(`${baseUrl}/chat/completions`, body, { headers });
  const choice = res.data.choices[0];

  // Native function calling
  if (choice.finish_reason === 'tool_calls' && choice.message.tool_calls) {
    return { type: 'tool_calls', tool_calls: choice.message.tool_calls, message: choice.message };
  }

  return choice.message.content;
}

// ---- AkashML ----
async function chatAkashML(messages, overrides) {
  const cfg = config.ai.akashml;
  const apiKey = overrides.apiKey || cfg.apiKey;
  const model = overrides.model || cfg.model;

  if (!apiKey) throw new Error('No AkashML API key');

  const body = {
    model,
    messages,
    temperature: overrides.temperature ?? config.agent.temperature,
    max_tokens: overrides.maxTokens || config.agent.maxTokens,
    top_p: 0.9,
  };

  if (overrides.tools) body.tools = overrides.tools;

  const res = await axios.post('https://api.akashml.com/v1/chat/completions', body, {
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
  });

  const choice = res.data.choices[0];
  if (choice.finish_reason === 'tool_calls' && choice.message.tool_calls) {
    return { type: 'tool_calls', tool_calls: choice.message.tool_calls, message: choice.message };
  }

  return choice.message.content;
}

// ---- Gemini ----
async function chatGemini(messages, overrides) {
  const cfg = config.ai.gemini;
  const apiKey = overrides.apiKey || cfg.apiKey;
  const model = overrides.model || cfg.model;

  if (!apiKey) throw new Error('No Gemini API key');

  const systemMsg = messages.find(m => m.role === 'system');
  const userMessages = messages.filter(m => m.role !== 'system');

  const contents = userMessages.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: Array.isArray(m.content) ? m.content.map(c => {
      if (c.type === 'text') return { text: c.text };
      if (c.type === 'image_url') return { inlineData: { mimeType: 'image/jpeg', data: c.image_url.url } };
      return { text: JSON.stringify(c) };
    }) : [{ text: m.content }],
  }));

  const body = {
    contents,
    generationConfig: {
      maxOutputTokens: overrides.maxTokens || config.agent.maxTokens,
      temperature: overrides.temperature ?? config.agent.temperature,
      topP: 0.9,
    },
  };

  if (systemMsg) {
    body.systemInstruction = { parts: [{ text: systemMsg.content }] };
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const res = await axios.post(url, body);
  return res.data.candidates[0].content.parts[0].text;
}

// ---- Anthropic ----
async function chatAnthropic(messages, overrides) {
  const cfg = config.ai.anthropic;
  const apiKey = overrides.apiKey || cfg.apiKey;
  const model = overrides.model || cfg.model;

  if (!apiKey) throw new Error('No Anthropic API key');

  const systemMsg = messages.find(m => m.role === 'system');
  const filteredMessages = messages.filter(m => m.role !== 'system');

  const body = {
    model,
    max_tokens: overrides.maxTokens || config.agent.maxTokens,
    messages: filteredMessages,
  };

  if (systemMsg) body.system = systemMsg.content;
  if (overrides.tools) body.tools = overrides.tools;

  const res = await axios.post('https://api.anthropic.com/v1/messages', body, {
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
  });

  const content = res.data.content;
  const toolUse = content.find(c => c.type === 'tool_use');
  if (toolUse) {
    return { type: 'tool_calls', tool_calls: [toolUse], message: { role: 'assistant', content } };
  }

  return content.find(c => c.type === 'text')?.text || '';
}

// ---- Blink AI Gateway ----
async function chatBlink(messages, overrides) {
  const cfg = config.ai.blink;
  const apiKey = overrides.apiKey || cfg.apiKey;
  const model = overrides.model || cfg.model;

  if (!apiKey) throw new Error('No Blink API key');

  const body = {
    model,
    messages,
    max_tokens: overrides.maxTokens || config.agent.maxTokens,
    temperature: overrides.temperature ?? config.agent.temperature,
  };

  if (overrides.tools) body.tools = overrides.tools;
  if (overrides.tool_choice) body.tool_choice = overrides.tool_choice;

  const res = await axios.post(`${cfg.baseUrl}/chat/completions`, body, {
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
  });

  const choice = res.data.choices[0];
  if (choice.finish_reason === 'tool_calls' && choice.message.tool_calls) {
    return { type: 'tool_calls', tool_calls: choice.message.tool_calls, message: choice.message };
  }

  return choice.message.content;
}

module.exports = { chat };
