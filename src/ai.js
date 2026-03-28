require('dotenv').config();
const axios = require('axios');
const config = require('./config');
const fetch = require('node-fetch');
const FormData = require('form-data');

/**
 * Re-host an image URL to catbox.moe so it's publicly accessible.
 * Used for Telegram photos that may not be reachable by external AI APIs.
 */
async function reHostImage(imageUrl) {
  try {
    // Download image
    const res = await fetch(imageUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      timeout: 15000,
    });
    if (!res.ok) return imageUrl; // fallback to original
    const buffer = await res.buffer();
    const mimeType = res.headers.get('content-type') || 'image/jpeg';

    // Upload to catbox.moe (anonymous, no key needed)
    const form = new FormData();
    form.append('reqtype', 'fileupload');
    form.append('fileToUpload', buffer, { filename: 'image.jpg', contentType: mimeType });

    const upload = await fetch('https://catbox.moe/user/api.php', {
      method: 'POST',
      body: form,
      timeout: 20000,
    });
    const url = (await upload.text()).trim();
    if (url.startsWith('https://')) return url;
    return imageUrl; // fallback
  } catch {
    return imageUrl; // fallback
  }
}

/**
 * Process messages array — fix image_url content to use re-hosted URLs
 * so external AI APIs (Gemini via Blink) can access Telegram photos.
 */
async function fixImageUrls(messages) {
  const fixed = [];
  for (const msg of messages) {
    if (!Array.isArray(msg.content)) {
      fixed.push(msg);
      continue;
    }
    const newContent = [];
    for (const part of msg.content) {
      if (part.type === 'image_url' && part.image_url?.url) {
        const url = part.image_url.url;
        // Re-host if it's a Telegram file URL or non-public URL
        const needsRehost = url.includes('api.telegram.org') || url.includes('telegram.org/file');
        const finalUrl = needsRehost ? await reHostImage(url) : url;
        newContent.push({ type: 'image_url', image_url: { url: finalUrl } });
      } else {
        newContent.push(part);
      }
    }
    fixed.push({ ...msg, content: newContent });
  }
  return fixed;
}

/**
 * Unified AI client — supports OpenAI, OpenRouter, Gemini, Anthropic, Groq, AkashML, Blink
 * v3 — native function calling support
 */
async function chat(messages, overrides = {}) {
  const provider = overrides.provider || config.ai.provider;

  // Check if any message has image content
  const hasImages = messages.some(m =>
    Array.isArray(m.content) && m.content.some(p => p.type === 'image_url')
  );

  // Fix Telegram image URLs (re-host to catbox so external APIs can access them)
  let processedMessages = messages;
  if (hasImages) {
    processedMessages = await fixImageUrls(messages);
    // For vision requests, force gemini-2.0-flash via Blink (confirmed working with public URLs)
    if (!overrides.provider && provider === 'blink') {
      return chatBlink(processedMessages, { ...overrides, model: 'google/gemini-2.0-flash' });
    }
  }

  switch (provider) {
    case 'gemini':
      return chatGemini(processedMessages, overrides);
    case 'anthropic':
      return chatAnthropic(processedMessages, overrides);
    case 'akashml':
      return chatAkashML(processedMessages, overrides);
    case 'blink':
      return chatBlink(processedMessages, overrides);
    default:
      return chatOpenAICompat(provider, processedMessages, overrides);
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
