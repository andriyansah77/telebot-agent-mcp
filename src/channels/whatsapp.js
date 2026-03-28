const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const path = require('path');
const config = require('../config');
const db = require('../database');
const { processMessage, isOwnerUser } = require('../agent');

let sock;

async function start() {
  if (!config.channels.whatsapp) {
    console.warn('[WhatsApp] Disabled, skipping.');
    return;
  }

  const authPath = path.resolve('./data/wa_auth');
  const { state, saveCreds } = await useMultiFileAuthState(authPath);
  const { version } = await fetchLatestBaileysVersion();

  sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false,
    logger: require('pino')({ level: 'silent' }),
    browser: ['Agent', 'Chrome', '120.0.0'],
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log('\n[WhatsApp] Scan QR code below:\n');
      qrcode.generate(qr, { small: true });
    }

    if (connection === 'close') {
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      console.log('[WhatsApp] Connection closed, reconnecting:', shouldReconnect);
      if (shouldReconnect) setTimeout(start, 3000);
    }

    if (connection === 'open') {
      console.log('[WhatsApp] Connected!');
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;

    for (const msg of messages) {
      if (msg.key.fromMe) continue;
      if (!msg.message) continue;

      const jid = msg.key.remoteJid;
      if (!jid) continue;

      // Extract text
      const text =
        msg.message.conversation ||
        msg.message.extendedTextMessage?.text ||
        msg.message.ephemeralMessage?.message?.extendedTextMessage?.text;

      if (!text) continue;

      // Extract user info
      const userId = jid.replace('@s.whatsapp.net', '').replace('@g.us', '');
      const isGroup = jid.endsWith('@g.us');

      // Skip groups unless mentioned (optional: handle group later)
      if (isGroup) continue;

      const name = msg.pushName || userId;

      // Auto-approve owner
      if (isOwnerUser(userId, 'whatsapp')) {
        db.approveUser(userId, 'whatsapp');
      }

      // Handle commands
      if (text.startsWith('/')) {
        await handleCommand(text, userId, jid);
        continue;
      }

      // Process with agent
      const { reply, pending } = await processMessage({
        userId,
        channel: 'whatsapp',
        name,
        text,
      });

      if (!reply) continue;

      if (pending && config.whatsapp.ownerNumber) {
        const ownerJid = `${config.whatsapp.ownerNumber}@s.whatsapp.net`;
        await send(ownerJid, `🔔 User baru minta akses:\nNomor: ${userId}\n\nBalas dengan /approve ${userId} untuk menyetujui.`);
      }

      await send(jid, reply);
    }
  });
}

async function handleCommand(text, userId, jid) {
  const [cmd, ...args] = text.split(' ');
  const isOwner = isOwnerUser(userId, 'whatsapp');

  switch (cmd) {
    case '/start':
      await send(jid, `👋 Halo! Saya ${config.agent.name}. Ketik apa saja untuk mulai chat dengan AI!`);
      break;

    case '/reset':
      db.clearHistory(userId, 'whatsapp');
      await send(jid, '✅ Percakapan direset!');
      break;

    case '/help':
      await send(jid,
        `📖 Perintah:\n/start — Mulai\n/reset — Reset percakapan\n/help — Bantuan\n\n` +
        (isOwner ? `*Owner:*\n/approve <nomor> — Setujui user\n/block <nomor> — Blokir user\n/users — Daftar users` : '')
      );
      break;

    case '/approve':
      if (!isOwner) return send(jid, '❌ Hanya owner!');
      if (!args[0]) return send(jid, 'Usage: /approve <nomor>');
      db.approveUser(args[0], 'whatsapp');
      await send(jid, `✅ User ${args[0]} disetujui!`);
      break;

    case '/block':
      if (!isOwner) return send(jid, '❌ Hanya owner!');
      if (!args[0]) return send(jid, 'Usage: /block <nomor>');
      db.blockUser(args[0], 'whatsapp');
      await send(jid, `🚫 User ${args[0]} diblokir!`);
      break;

    case '/users':
      if (!isOwner) return send(jid, '❌ Hanya owner!');
      const users = db.listUsers().filter(u => u.channel === 'whatsapp');
      await send(jid, users.length ? users.map(u => `${u.approved ? '✅' : '⏳'} ${u.name} (${u.id})`).join('\n') : 'Belum ada users.');
      break;

    default:
      await send(jid, `Perintah tidak dikenal: ${cmd}`);
  }
}

async function send(jid, text) {
  if (!sock) return;
  // Split long messages
  const maxLen = 3000;
  const chunks = [];
  let t = text;
  while (t.length > 0) {
    chunks.push(t.slice(0, maxLen));
    t = t.slice(maxLen);
  }
  for (const chunk of chunks) {
    await sock.sendMessage(jid, { text: chunk }).catch(console.error);
  }
}

module.exports = { start };
