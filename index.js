require('dotenv').config();

const db = require('./src/database');
const server = require('./src/server');
const telegramChannel = require('./src/channels/telegram');
const whatsappChannel = require('./src/channels/whatsapp');
const config = require('./src/config');

async function main() {
  console.log(`
╔════════════════════════════════════╗
║   TeleBot Agent MCP v2             ║
║   Multi-channel AI Agent           ║
╚════════════════════════════════════╝
`);

  db.init();
  console.log('[DB] Database initialized');

  // HTTP server — keeps process alive (Pterodactyl health check)
  server.start();

  // Start channels non-blocking
  if (config.channels.telegram) {
    console.log('[Telegram] Starting...');
    telegramChannel.start().catch(e => {
      console.error('[Telegram] Fatal:', e.message);
    });
  }

  if (config.channels.whatsapp) {
    console.log('[WhatsApp] Starting...');
    whatsappChannel.start().catch(e => {
      console.error('[WhatsApp] Fatal:', e.message);
    });
  }

  if (!config.channels.telegram && !config.channels.whatsapp) {
    console.error('No channels enabled!');
    process.exit(1);
  }
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});

process.on('SIGTERM', () => {
  console.log('[Main] Shutting down...');
  process.exit(0);
});

process.on('SIGINT', () => {
  // Ignore SIGINT from tini
});
