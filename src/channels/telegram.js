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

  bot = new Telegraf(config.telegram.token, { handlerTimeout: 120_000 });


  // Global error handler — prevent single message crash
  bot.catch((err, ctx) => {
    console.error('[Telegram] Handler error:', err.message || err);
  });

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
      `/stats — Statistik bot\n` +
      `/exec <cmd> — Jalankan shell command\n` +
      `/install <pkg> — Install npm package\n` +
      `/skill list — Daftar skills\n` +
      `/skill install <name> <pkg> — Install skill\n` +
      `/memory — Lihat memory agent`,
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
    const blinkModels = `\n\n*Blink models:*\n• anthropic/claude-sonnet-4-5\n• anthropic/claude-opus-4-5\n• openai/gpt-4o\n• google/gemini-2.0-flash`;
    await ctx.reply(
      `🤖 *Provider:* ${provider}\n*Model:* \`${cfg.model || 'N/A'}\`` +
      (provider === 'akashml' ? akashlmlModels : provider === 'blink' ? blinkModels : ''),
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


  // ---- /skill ----
  bot.command('skill', ownerOnly(async (ctx) => {
    const args = ctx.message.text.split(' ').slice(1);
    const sub = args[0];
    const { loadSkills } = require('../tools');

    if (!sub || sub === 'list') {
      const skills = loadSkills();
      const list = Object.values(skills);
      if (!list.length) return ctx.reply('No skills installed.\n\nInstall with:\n/skill install <name> <npm-package>\n/skill add <name> <code>');
      return ctx.reply('📦 *Installed Skills:*\n\n' + list.map(s => `• *${s.name}* — ${s.description}`).join('\n'), { parse_mode: 'Markdown' });
    }

    if (sub === 'install') {
      const [, name, pkg] = args;
      if (!name || !pkg) return ctx.reply('Usage: /skill install <name> <npm-package>');
      await ctx.reply(`📦 Installing skill: ${name} (${pkg})...`);
      const { executeToolCalls } = require('../tools');
      const result = await executeToolCalls(`[CALL: executeCommand({"command": "npm install ${pkg} --save 2>&1"})]`);
      // Create skill wrapper
      const skillDir = require('path').join(__dirname, '..', '..', 'skills', name);
      require('fs').mkdirSync(skillDir, { recursive: true });
      require('fs').writeFileSync(require('path').join(skillDir, 'index.js'),
        `const mod = require('${pkg}'); module.exports = { run: async (args) => JSON.stringify(mod) };`);
      require('fs').writeFileSync(require('path').join(skillDir, 'skill.json'),
        JSON.stringify({ name, description: `npm: ${pkg}`, version: '1.0.0' }, null, 2));
      return ctx.reply(`✅ Skill *${name}* installed!`, { parse_mode: 'Markdown' });
    }

    if (sub === 'remove') {
      const [, name] = args;
      if (!name) return ctx.reply('Usage: /skill remove <name>');
      const skillDir = require('path').join(__dirname, '..', '..', 'skills', name);
      require('fs').rmSync(skillDir, { recursive: true, force: true });
      return ctx.reply(`🗑 Skill *${name}* removed.`, { parse_mode: 'Markdown' });
    }

    return ctx.reply('Usage:\n/skill list\n/skill install <name> <npm-package>\n/skill remove <name>');
  }));

  // ---- /exec (owner only) ----
  bot.command('exec', ownerOnly(async (ctx) => {
    const cmd = ctx.message.text.split(' ').slice(1).join(' ');
    if (!cmd) return ctx.reply('Usage: /exec <command>');
    await ctx.sendChatAction('typing');
    const { exec } = require('child_process');
    const result = await new Promise(resolve => {
      exec(cmd, { timeout: 30000, shell: '/bin/sh' }, (err, stdout, stderr) => {
        resolve(err ? `❌ Error:\n${stderr || err.message}` : `✅ Output:\n${stdout || '(no output)'}`.slice(0, 3800));
      });
    });
    await ctx.reply(`\`\`\`\n${result}\n\`\`\``, { parse_mode: 'Markdown' }).catch(() => ctx.reply(result));
  }));

  // ---- /memory ----
  bot.command('memory', ownerOnly(async (ctx) => {
    const args = ctx.message.text.split(' ').slice(1);
    const memFile = require('path').join(__dirname, '..', '..', 'data', 'memory.json');
    if (!args[0] || args[0] === 'list') {
      const mem = require('fs').existsSync(memFile) ? JSON.parse(require('fs').readFileSync(memFile, 'utf8')) : {};
      const entries = Object.entries(mem);
      if (!entries.length) return ctx.reply('Memory is empty.');
      return ctx.reply('🧠 *Memory:*\n\n' + entries.map(([k,v]) => `• *${k}*: ${v}`).join('\n'), { parse_mode: 'Markdown' });
    }
    if (args[0] === 'clear') {
      require('fs').writeFileSync(memFile, '{}');
      return ctx.reply('🧹 Memory cleared.');
    }
    return ctx.reply('Usage: /memory [list|clear]');
  }));


  // ---- Photo/Image handler ----
  bot.on('photo', async (ctx) => {
    try {
      const userId = ctx.from.id.toString();

      // Auto-approve owner
      if (isOwnerUser(ctx.from.id, 'telegram')) {
        db.approveUser(ctx.from.id, 'telegram');
      }

      // Upsert user so they're always registered
      db.upsertUser(ctx.from.id, 'telegram', ctx.from.first_name);

      // Check if blocked
      const user = db.getUser(userId, 'telegram');
      if (user && user.blocked) return; // silently ignore

      // Check approval (owner bypasses)
      if (!isOwnerUser(ctx.from.id, 'telegram') && config.requireApproval && user && !user.approved) {
        return ctx.reply('⏳ Akun kamu belum disetujui. Tunggu approval dari owner.');
      }

      await ctx.sendChatAction('typing');

      // Get best quality photo
      const photos = ctx.message.photo;
      const photo = photos[photos.length - 1];
      const fileLink = await ctx.telegram.getFileLink(photo.file_id);
      const imageUrl = fileLink.href;

      const caption = ctx.message.caption || 'Apa yang ada di gambar ini? Deskripsikan secara detail.';

      // Route through processMessage so history, RAG, tools all work
      const { processMessage } = require('../agent');
      const result = await processMessage({
        userId: ctx.from.id,
        channel: 'telegram',
        name: ctx.from.first_name,
        text: caption,
        imageUrl,
      });

      const { reply, media } = result;

      if (media) {
        try {
          if (media.type === 'image') {
            await ctx.replyWithPhoto(media.url, reply ? { caption: reply } : {});
          } else {
            await ctx.replyWithDocument(media.url, reply ? { caption: reply } : {});
          }
        } catch {
          if (reply) await ctx.reply(reply).catch(() => {});
        }
        return;
      }

      if (reply) {
        const chunks = splitMessage(reply);
        for (const chunk of chunks) {
          await ctx.reply(chunk, { parse_mode: 'Markdown' }).catch(() => ctx.reply(chunk));
        }
      }

    } catch(e) {
      console.error('[Telegram] Photo error:', e.message);
      ctx.reply('❌ Gagal analisis gambar: ' + e.message);
    }
  });

  // ---- Sticker handler (fun) ----
  bot.on('sticker', async (ctx) => {
    const userId = ctx.from.id.toString();
    if (userId !== process.env.OWNER_ID) return;
    ctx.reply('👀 Stiker keren! Mau aku analisis gambarnya? Kirim foto biasa ya biar bisa dibaca.');
  });


  // ---- /learn ----
  bot.command('learn', ownerOnly(async (ctx) => {
    const args = ctx.message.text.split(' ').slice(1);
    const sub = args[0];
    const rag = require('../rag');

    if (!sub || sub === 'status') {
      const stats = rag.getStats();
      const sources = rag.listSources();
      const list = sources.length ? sources.map(s => `• ${s.source} (${s.type})`).join('\n') : 'Belum ada knowledge.';
      return ctx.reply(
        `🧠 *Knowledge Base Stats*\n\n` +
        `📚 Sources: ${stats.sources}\n` +
        `🔤 Chunks: ${stats.chunks}\n\n` +
        `*Sources:*\n${list}`,
        { parse_mode: 'Markdown' }
      );
    }

    if (sub === 'text') {
      const name = args[1];
      const content = args.slice(2).join(' ');
      if (!name || !content) return ctx.reply('Usage: /learn text <name> <content>');
      await ctx.reply(`📖 Learning: "${name}"...`);
      const chunks = await rag.addDocument(name, content, 'text');
      return ctx.reply(`✅ Learned *${name}* (${chunks} chunks)`, { parse_mode: 'Markdown' });
    }

    if (sub === 'url') {
      const url = args[1];
      if (!url) return ctx.reply('Usage: /learn url <url>');
      await ctx.reply(`🌐 Fetching and learning: ${url}...`);
      try {
        const fetch = require('node-fetch');
        const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        const html = await res.text();
        const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        const domain = new URL(url).hostname;
        const chunks = await rag.addDocument(domain, text.slice(0, 20000), 'url');
        return ctx.reply(`✅ Learned from *${domain}* (${chunks} chunks)`, { parse_mode: 'Markdown' });
      } catch(e) {
        return ctx.reply(`❌ Error: ${e.message}`);
      }
    }

    if (sub === 'forget') {
      const name = args[1];
      if (!name) return ctx.reply('Usage: /learn forget <name>');
      rag.deleteSource(name);
      return ctx.reply(`🗑 Forgotten: ${name}`);
    }

    return ctx.reply(
      '*Learn Commands:*\n\n' +
      '/learn status — lihat knowledge base\n' +
      '/learn text <name> <content> — tambah teks\n' +
      '/learn url <url> — pelajari dari website\n' +
      '/learn forget <name> — hapus knowledge',
      { parse_mode: 'Markdown' }
    );
  }));

  // Handle document upload for learning
  bot.on('document', async (ctx) => {
    if (ctx.from.id.toString() !== process.env.OWNER_ID) return;
    const doc = ctx.message.document;
    const allowedTypes = ['text/plain', 'application/json', 'text/markdown', 'text/csv'];
    if (!allowedTypes.includes(doc.mime_type) && !doc.file_name.match(/\.(txt|md|json|csv|js|py)$/i)) {
      return ctx.reply('⚠️ Upload file teks (.txt, .md, .json, .csv, .js, .py) untuk dipelajari');
    }
    await ctx.reply(`📄 Mempelajari file: ${doc.file_name}...`);
    try {
      const fileLink = await ctx.telegram.getFileLink(doc.file_id);
      const fetch = require('node-fetch');
      const res = await fetch(fileLink.href);
      const text = await res.text();
      const rag = require('../rag');
      const chunks = await rag.addDocument(doc.file_name, text, 'file');
      ctx.reply(`✅ File *${doc.file_name}* berhasil dipelajari (${chunks} chunks)`, { parse_mode: 'Markdown' });
    } catch(e) {
      ctx.reply(`❌ Error: ${e.message}`);
    }
  });


  // ---- /cron ----
  bot.command('cron', ownerOnly(async (ctx) => {
    const args = ctx.message.text.split(' ').slice(1);
    const sub = args[0];
    const { loadSkills } = require('../tools');
    const skills = loadSkills();
    const scheduler = skills['scheduler'];
    if (!scheduler) return ctx.reply('Scheduler skill not found');

    if (!sub || sub === 'list') {
      const list = await scheduler.run({ action: 'list' });
      return ctx.reply('⏰ *Scheduled Jobs:*\n\n' + list, { parse_mode: 'Markdown' });
    }
    if (sub === 'add') {
      // /cron add <name> <expression> <task>
      const [, name, expr, ...taskParts] = args;
      if (!name || !expr || !taskParts.length) return ctx.reply('Usage: /cron add <name> <cron-expr> <task>\nExample: /cron add daily "0 9 * * *" Check crypto prices');
      const result = await scheduler.run({ action: 'add', name, expression: expr, task: taskParts.join(' '), chatId: ctx.chat.id });
      return ctx.reply(result);
    }
    if (sub === 'remove') {
      const result = await scheduler.run({ action: 'remove', name: args[1] });
      return ctx.reply(result);
    }
    return ctx.reply('Usage: /cron [list|add|remove]');
  }));

  // ---- /install (install npm package) ----
  bot.command('install', ownerOnly(async (ctx) => {
    const pkg = ctx.message.text.split(' ').slice(1).join(' ');
    if (!pkg) return ctx.reply('Usage: /install <npm-package>');
    await ctx.reply(`📦 Installing ${pkg}...`);
    const { exec } = require('child_process');
    const result = await new Promise(resolve => {
      exec(`npm install ${pkg} --save 2>&1`, { timeout: 60000 }, (err, stdout, stderr) => {
        resolve(err ? `❌ Failed:\n${stderr}` : `✅ Installed: ${pkg}`);
      });
    });
    return ctx.reply(result);
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

    const result = await processMessage({
      userId: ctx.from.id,
      channel: 'telegram',
      name: ctx.from.first_name,
      text,
    });

    const { reply, pending, media } = result;
    if (!reply && !media) return;

    // If pending approval, also notify owner
    if (pending && config.telegram.ownerId) {
      const user = ctx.from;
      await bot.telegram.sendMessage(
        config.telegram.ownerId,
        `🔔 User baru minta akses:\nNama: ${user.first_name}\nID: ${user.id}\n\nGunakan /approve telegram:${user.id} untuk menyetujui.`
      ).catch(() => {});
    }

    // Handle media responses (image, audio)
    if (result.media) {
      const { type, url } = result.media;
      try {
        if (type === 'image') {
          await ctx.replyWithPhoto(url, reply ? { caption: reply } : {});
        } else if (type === 'audio') {
          await ctx.replyWithVoice(url, reply ? { caption: reply } : {});
        } else {
          await ctx.replyWithDocument(url, reply ? { caption: reply } : {});
        }
      } catch(e) {
        await ctx.reply(`Media: ${url}`);
      }
      if (!reply) return;
    }

    // Split long messages
    if (reply) {
      const chunks = splitMessage(reply);
      for (const chunk of chunks) {
        await ctx.reply(chunk, { parse_mode: 'Markdown' }).catch(() => ctx.reply(chunk));
      }
    }
  });

  // Launch bot — manual polling (bypasses Telegraf launch() hang)
  const TOKEN = config.telegram.token;

  // Delete webhook first to ensure polling mode
  try {
    const axios = require('axios');
    await axios.post(`https://api.telegram.org/bot${TOKEN}/deleteWebhook`, { drop_pending_updates: true });
    console.log('[Telegram] Webhook cleared');
  } catch(e) {
    console.warn('[Telegram] Could not clear webhook:', e.message);
  }

  // Start polling via Telegraf internal method
  bot.telegram.getMe().then(me => {
    console.log(`[Telegram] Bot connected: @${me.username}`);
  }).catch(e => {
    console.warn('[Telegram] getMe:', e.message);
  });

  // Use startPolling directly
  try {
    await bot.telegram.deleteWebhook({ drop_pending_updates: true });
    bot.startPolling();
    console.log('[Telegram] Bot started successfully (polling mode)!');
  } catch(e) {
    console.error('[Telegram] startPolling error:', e.message);
    // Retry after delay
    setTimeout(() => {
      console.log('[Telegram] Retrying startPolling...');
      bot.startPolling();
    }, 15000);
  }

  // Keep alive — never resolves
  await new Promise(() => {});

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

