const { Telegraf } = require('telegraf');
const config = require('../config');
const db = require('../database');
const { processMessage, isOwnerUser } = require('../agent');

let bot;

async function start() {
  if (!config.telegram.token) {
    console.warn('[Telegram] No token configured, skipping.');
    return;
  }

  bot = new Telegraf(config.telegram.token);

  // ---- Middleware: log all updates ----
  bot.use((ctx, next) => {
    if (ctx.from) {
      db.upsertUser(ctx.from.id, 'telegram', ctx.from.first_name);
    }
    return next();
  });

  // ---- /start ----
  bot.command('start', async (ctx) => {
    const isOwner = isOwnerUser(ctx.from.id, 'telegram');
    if (isOwner) db.approveUser(ctx.from.id, 'telegram');

    await ctx.reply(
      `👋 Halo ${ctx.from.first_name}! Saya ${config.agent.name}.\n\n` +
      `Saya adalah AI agent yang bisa:\n` +
      `• 💬 Chat & bantu dengan apa saja\n` +
      `• 🔧 Jalankan perintah shell\n` +
      `• 📁 Baca/tulis file\n` +
      `• 🌐 Search web & fetch URL\n` +
      `• 🔢 Hitung & run JavaScript\n\n` +
      `Ketik apa saja untuk mulai!`
    );
  });

  // ---- /help ----
  bot.command('help', async (ctx) => {
    await ctx.reply(
      `📖 *Perintah yang tersedia:*\n\n` +
      `*User:*\n` +
      `/start — Mulai bot\n` +
      `/help — Bantuan\n` +
      `/reset — Reset percakapan\n` +
      `/model — Lihat model AI aktif\n\n` +
      `*Owner only:*\n` +
      `/users — Daftar users\n` +
      `/approve <id> — Setujui user\n` +
      `/block <id> — Blokir user\n` +
      `/setprovider <provider> — Ganti AI provider\n` +
      `/setmodel <model> — Ganti model AI\n` +
      `/logs — Lihat activity logs\n` +
      `/stats — Statistik bot`,
      { parse_mode: 'Markdown' }
    );
  });

  // ---- /reset ----
  bot.command('reset', async (ctx) => {
    db.clearHistory(ctx.from.id, 'telegram');
    await ctx.reply('✅ Percakapan direset!');
  });

  // ---- /model ----
  bot.command('model', async (ctx) => {
    const provider = config.ai.provider;
    const cfg = config.ai[provider] || config.ai.custom;
    const akashlmlModels = `\n\n*AkashML models:*\n• Qwen/Qwen3-30B-A3B\n• deepseek-ai/DeepSeek-V3.2\n• MiniMaxAI/MiniMax-M2.5`;
    await ctx.reply(
      `🤖 *Provider:* ${provider}\n*Model:* \`${cfg.model || 'N/A'}\`` +
      (provider === 'akashml' ? akashlmlModels : ''),
      { parse_mode: 'Markdown' }
    );
  });

  // ---- /models ----
  bot.command('models', async (ctx) => {
    await ctx.reply(
      `📋 *Available Models per Provider:*\n\n` +
      `*akashml:*\n• \`Qwen/Qwen3-30B-A3B\` — fast & capable\n• \`deepseek-ai/DeepSeek-V3.2\` — strong reasoning\n• \`MiniMaxAI/MiniMax-M2.5\` — long context\n\n` +
      `*openrouter:*\n• \`google/gemini-2.0-flash-exp\`\n• \`meta-llama/llama-3.3-70b-instruct\`\n• (any openrouter model)\n\n` +
      `*openai:*\n• \`gpt-4o\`, \`gpt-4o-mini\`\n\n` +
      `*gemini:*\n• \`gemini-2.0-flash-exp\`\n\n` +
      `*anthropic:*\n• \`claude-3-5-sonnet-20241022\`\n\n` +
      `*groq:*\n• \`llama-3.3-70b-versatile\`\n\n` +
      `Use /setprovider <name> then /setmodel <model>`,
      { parse_mode: 'Markdown' }
    );
  });

  // ---- Owner commands ----
  bot.command('users', ownerOnly(async (ctx) => {
    const users = db.listUsers();
    if (!users.length) return ctx.reply('Belum ada users.');
    const text = users.map(u =>
      `${u.approved ? '✅' : '⏳'} ${u.name} (${u.id}) — ${u.channel}`
    ).join('\n');
    await ctx.reply(`👥 Users:\n\n${text}`);
  }));

  bot.command('approve', ownerOnly(async (ctx) => {
    const args = ctx.message.text.split(' ');
    if (!args[1]) return ctx.reply('Usage: /approve <user_id>');
    const [channel, userId] = args[1].includes(':') ? args[1].split(':') : ['telegram', args[1]];
    db.approveUser(userId, channel);
    await ctx.reply(`✅ User ${args[1]} disetujui!`);
  }));

  bot.command('block', ownerOnly(async (ctx) => {
    const args = ctx.message.text.split(' ');
    if (!args[1]) return ctx.reply('Usage: /block <user_id>');
    const [channel, userId] = args[1].includes(':') ? args[1].split(':') : ['telegram', args[1]];
    db.blockUser(userId, channel);
    await ctx.reply(`🚫 User ${args[1]} diblokir!`);
  }));

  bot.command('setprovider', ownerOnly(async (ctx) => {
    const args = ctx.message.text.split(' ');
    if (!args[1]) return ctx.reply('Usage: /setprovider <openai|openrouter|gemini|anthropic|groq|custom>');
    config.ai.provider = args[1];
    await ctx.reply(`✅ Provider diganti ke: ${args[1]}`);
  }));

  bot.command('setmodel', ownerOnly(async (ctx) => {
    const args = ctx.message.text.split(' ');
    if (!args[1]) return ctx.reply('Usage: /setmodel <model_name>');
    const provider = config.ai.provider;
    if (config.ai[provider]) config.ai[provider].model = args[1];
    await ctx.reply(`✅ Model diganti ke: ${args[1]}`);
  }));

  bot.command('logs', ownerOnly(async (ctx) => {
    const logs = db.getLogs(20);
    if (!logs.length) return ctx.reply('Belum ada logs.');
    const text = logs.map(l =>
      `[${new Date(l.created_at * 1000).toLocaleTimeString()}] ${l.type}: ${(l.data || '').slice(0, 80)}`
    ).join('\n');
    await ctx.reply(`📋 Logs:\n\n${text}`);
  }));

  bot.command('stats', ownerOnly(async (ctx) => {
    const users = db.listUsers();
    const approved = users.filter(u => u.approved).length;
    const logs = db.getLogs(1000).length;
    await ctx.reply(
      `📊 *Stats:*\n` +
      `Total users: ${users.length}\n` +
      `Approved: ${approved}\n` +
      `Total messages: ${logs}\n` +
      `AI provider: ${config.ai.provider}`,
      { parse_mode: 'Markdown' }
    );
  }));

  // ---- Main message handler ----
  bot.on('text', async (ctx) => {
    const text = ctx.message.text;
    if (text.startsWith('/')) return; // ignore unknown commands

    // Auto-approve owner
    if (isOwnerUser(ctx.from.id, 'telegram')) {
      db.approveUser(ctx.from.id, 'telegram');
    }

    // Show typing
    await ctx.sendChatAction('typing');

    const { reply, pending } = await processMessage({
      userId: ctx.from.id,
      channel: 'telegram',
      name: ctx.from.first_name,
      text,
    });

    if (!reply) return;

    // If pending approval, also notify owner
    if (pending && config.telegram.ownerId) {
      const user = ctx.from;
      await bot.telegram.sendMessage(
        config.telegram.ownerId,
        `🔔 User baru minta akses:\nNama: ${user.first_name}\nID: ${user.id}\n\nGunakan /approve telegram:${user.id} untuk menyetujui.`
      ).catch(() => {});
    }

    // Split long messages
    const chunks = splitMessage(reply);
    for (const chunk of chunks) {
      await ctx.reply(chunk, { parse_mode: 'Markdown' }).catch(() => ctx.reply(chunk));
    }
  });

  // Launch bot
  await bot.launch({ dropPendingUpdates: true });
  console.log('[Telegram] Bot started');

  // Graceful shutdown
  process.once('SIGINT', () => bot.stop('SIGINT'));
  process.once('SIGTERM', () => bot.stop('SIGTERM'));
}

function ownerOnly(handler) {
  return async (ctx) => {
    if (!isOwnerUser(ctx.from.id, 'telegram')) {
      return ctx.reply('❌ Hanya owner yang bisa pakai perintah ini.');
    }
    return handler(ctx);
  };
}

function splitMessage(text, maxLen = 4000) {
  if (text.length <= maxLen) return [text];
  const chunks = [];
  while (text.length > 0) {
    chunks.push(text.slice(0, maxLen));
    text = text.slice(maxLen);
  }
  return chunks;
}

module.exports = { start };
