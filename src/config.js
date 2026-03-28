require('dotenv').config();

module.exports = {
  // Channels
  channels: {
    telegram: process.env.ENABLE_TELEGRAM !== 'false',
    whatsapp: process.env.ENABLE_WHATSAPP === 'true',
  },

  // Telegram
  telegram: {
    token: process.env.TELEGRAM_BOT_TOKEN || '',
    ownerId: parseInt(process.env.TELEGRAM_OWNER_ID || '0'),
  },

  // WhatsApp
  whatsapp: {
    ownerNumber: process.env.WHATSAPP_OWNER_NUMBER || '',
  },

  // AI Provider
  ai: {
    provider: process.env.AI_PROVIDER || 'openrouter',

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
      model: process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-20241022',
    },

    groq: {
      apiKey: process.env.GROQ_API_KEY || '',
      model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
      baseUrl: 'https://api.groq.com/openai/v1',
    },

    custom: {
      apiKey: process.env.CUSTOM_API_KEY || '',
      baseUrl: process.env.CUSTOM_BASE_URL || '',
      model: process.env.CUSTOM_MODEL || '',
    },
  },

  // Agent
  agent: {
    name: process.env.AGENT_NAME || 'Agent',
    systemPrompt: process.env.AGENT_SYSTEM_PROMPT ||
      'You are a powerful AI agent. You can execute commands, read/write files, search the web, and help with any task.',
    maxTokens: parseInt(process.env.MAX_TOKENS || '4096'),
    temperature: parseFloat(process.env.TEMPERATURE || '0.7'),
    maxHistory: parseInt(process.env.MAX_HISTORY || '20'),
  },

  // Approval
  requireApproval: process.env.REQUIRE_APPROVAL !== 'false',

  // Tools
  tools: {
    shell: process.env.TOOL_SHELL !== 'false',
    file: process.env.TOOL_FILE !== 'false',
    web: process.env.TOOL_WEB !== 'false',
    http: process.env.TOOL_HTTP !== 'false',
    code: process.env.TOOL_CODE !== 'false',
  },

  // Database
  dbPath: process.env.DB_PATH || './data/agent.db',

  // HTTP Server
  http: {
    port: parseInt(process.env.HTTP_PORT || '3000'),
    enabled: process.env.HTTP_ENABLED !== 'false',
  },

  // Logging
  logLevel: process.env.LOG_LEVEL || 'info',
};
