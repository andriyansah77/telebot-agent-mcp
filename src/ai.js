const axios = require('axios');
const config = require('./config');

/**
 * Unified AI client — supports OpenAI, OpenRouter, Gemini, Anthropic, Groq, AkashML, Custom
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
    default:
      // openai-compatible: openai, openrouter, groq, custom
      return chatOpenAICompat(provider, messages, overrides);
  }
}

// ---- OpenAI-compatible (OpenAI, OpenRouter, Groq, Custom) ----
async function chatOpenAICompat(provider, messages, overrides) {
  const cfg = config.ai[provider] || config.ai.custom;
  const apiKey = overrides.apiKey || cfg.apiKey;
  const baseUrl = overrides.baseUrl || cfg.baseUrl;
  const model = overrides.model || cfg.model;

  if (!apiKey) throw new Error(`No API key configured for provider: ${provider}`);
  if (!baseUrl) throw new Error(`No base URL configured for provider: ${provider}`);

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
    top_p: overrides.topP || config.agent.topP || 0.9,
  };

  const res = await axios.post(`${baseUrl}/chat/completions`, body, { headers });
  return res.data.choices[0].message.content;
}

// ---- AkashML (OpenAI-compatible with extra params) ----
async function chatAkashML(messages, overrides) {
  const cfg = config.ai.akashml;
  const apiKey = overrides.apiKey || cfg.apiKey;
  const model = overrides.model || cfg.model;

  if (!apiKey) throw new Error('No AkashML API key configured');

  const body = {
    model,
    messages,
    temperature: overrides.temperature ?? config.agent.temperature,
    max_tokens: overrides.maxTokens || config.agent.maxTokens,
    top_p: overrides.topP || 0.9,
  };

  const res = await axios.post('https://api.akashml.com/v1/chat/completions', body, {
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
  });

  return res.data.choices[0].message.content;
}

// ---- Gemini ----
async function chatGemini(messages, overrides) {
  const cfg = config.ai.gemini;
  const apiKey = overrides.apiKey || cfg.apiKey;
  const model = overrides.model || cfg.model;

  if (!apiKey) throw new Error('No Gemini API key configured');

  const systemMsg = messages.find(m => m.role === 'system');
  const userMessages = messages.filter(m => m.role !== 'system');

  const contents = userMessages.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));

  const body = {
    contents,
    generationConfig: {
      maxOutputTokens: overrides.maxTokens || config.agent.maxTokens,
      temperature: overrides.temperature ?? config.agent.temperature,
      topP: overrides.topP || 0.9,
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

  if (!apiKey) throw new Error('No Anthropic API key configured');

  const systemMsg = messages.find(m => m.role === 'system');
  const filteredMessages = messages.filter(m => m.role !== 'system');

  const body = {
    model,
    max_tokens: overrides.maxTokens || config.agent.maxTokens,
    messages: filteredMessages,
  };

  if (systemMsg) body.system = systemMsg.content;

  const res = await axios.post('https://api.anthropic.com/v1/messages', body, {
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
  });

  return res.data.content[0].text;
}

module.exports = { chat };
