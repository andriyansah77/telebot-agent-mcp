require('dotenv').config();

module.exports = {
  channels: {
    telegram: process.env.ENABLE_TELEGRAM !== 'false',
    whatsapp: process.env.ENABLE_WHATSAPP === 'true',
  },

  telegram: {
    token: process.env.TELEGRAM_BOT_TOKEN || '',
    ownerId: parseInt(process.env.TELEGRAM_OWNER_ID || '0'),
  },

  whatsapp: {
    ownerNumber: process.env.WHATSAPP_OWNER_NUMBER || '',
  },

  ai: {
    provider: process.env.AI_PROVIDER || 'blink',

    openai: {
      apiKey: process.env.OPENAI_API_KEY || '',
      model: process.env.OPENAI_MODEL || 'gpt-4o',
      baseUrl: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
    },

    openrouter: {
      apiKey: process.env.OPENROUTER_API_KEY || '',
      model: process.env.OPENROUTER_MODEL || 'google/gemini-2.0-flash-exp',
      baseUrl: 'https://openrouter.ai/api/v1',
    },

    gemini: {
      apiKey: process.env.GEMINI_API_KEY || '',
      model: process.env.GEMINI_MODEL || 'gemini-2.0-flash-exp',
    },

    anthropic: {
      apiKey: process.env.ANTHROPIC_API_KEY || '',
      model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5-20251001',
    },

    groq: {
      apiKey: process.env.GROQ_API_KEY || '',
      model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
      baseUrl: 'https://api.groq.com/openai/v1',
    },

    akashml: {
      apiKey: process.env.AKASHML_API_KEY || '',
      model: process.env.AKASHML_MODEL || 'Qwen/Qwen3-30B-A3B',
      baseUrl: 'https://api.akashml.com/v1',
    },

    // Blink AI Gateway — primary provider
    blink: {
      apiKey: process.env.BLINK_API_KEY || '',
      model: process.env.BLINK_MODEL || 'anthropic/claude-sonnet-4-5',
      baseUrl: process.env.BLINK_APIS_URL
        ? `${process.env.BLINK_APIS_URL}/api/v1/ai`
        : 'https://core.blink.new/api/v1/ai',
    },

    custom: {
      apiKey: process.env.CUSTOM_API_KEY || '',
      baseUrl: process.env.CUSTOM_BASE_URL || '',
      model: process.env.CUSTOM_MODEL || '',
    },
  },

  agent: {
    name: process.env.AGENT_NAME || 'GweiAgents',
    systemPrompt: process.env.AGENT_SYSTEM_PROMPT || '',
    maxTokens: parseInt(process.env.MAX_TOKENS || '4096'),
    temperature: parseFloat(process.env.TEMPERATURE || '0.7'),
    maxHistory: parseInt(process.env.MAX_HISTORY || '20'),
    topP: parseFloat(process.env.TOP_P || '0.9'),
  },

  requireApproval: process.env.REQUIRE_APPROVAL === 'true',

  tools: {
    shell: process.env.TOOL_SHELL !== 'false',
    file: process.env.TOOL_FILE !== 'false',
    web: process.env.TOOL_WEB !== 'false',
    http: process.env.TOOL_HTTP !== 'false',
    code: process.env.TOOL_CODE !== 'false',
    braveApiKey: process.env.BRAVE_SEARCH_API_KEY || '',
  },

  dbPath: process.env.DB_PATH || './data/agent.db',

  http: {
    port: parseInt(process.env.HTTP_PORT || '3000'),
    enabled: process.env.HTTP_ENABLED !== 'false',
  },

  logLevel: process.env.LOG_LEVEL || 'info',
};
