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

  // Init database
  db.init();
  console.log('[DB] Database initialized');

  // Start HTTP health server (for Pterodactyl)
  server.start();

  // Start channels
  const starts = [];

  if (config.channels.telegram) {
    console.log('[Telegram] Starting...');
    starts.push(telegramChannel.start().catch(e => {
      console.error('[Telegram] Failed to start:', e.message);
    }));
  }

  if (config.channels.whatsapp) {
    console.log('[WhatsApp] Starting...');
    starts.push(whatsappChannel.start().catch(e => {
      console.error('[WhatsApp] Failed to start:', e.message);
    }));
  }

  await Promise.all(starts);

  if (!config.channels.telegram && !config.channels.whatsapp) {
    console.error('⚠️  No channels enabled! Set ENABLE_TELEGRAM=true or ENABLE_WHATSAPP=true in .env');
    process.exit(1);
  }
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('[Main] Shutting down...');
  process.exit(0);
});
