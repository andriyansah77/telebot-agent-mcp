const axios = require('axios');

const SETUP = '⚙️ Set DISCORD_BOT_TOKEN env var.\nGet from: https://discord.com/developers/applications';

function dc(path, method = 'GET', body) {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) throw new Error('MISSING_ENV');
  return axios({ method, url: `https://discord.com/api/v10${path}`, data: body,
    headers: { Authorization: `Bot ${token}`, 'Content-Type': 'application/json' }
  }).then(r => r.data);
}

async function run({ action, channelId, message, limit = 10, guildId }) {
  try {
    if (action === 'send') {
      if (!channelId || !message) return 'Provide channelId and message';
      const data = await dc(`/channels/${channelId}/messages`, 'POST', { content: message });
      return `✅ Message sent to channel ${channelId}\nMessage ID: ${data.id}`;
    }

    if (action === 'read') {
      if (!channelId) return 'Provide channelId';
      const data = await dc(`/channels/${channelId}/messages?limit=${Math.min(parseInt(limit) || 10, 50)}`);
      if (!data.length) return 'No messages found.';
      const lines = data.reverse().map(m =>
        `[${new Date(m.timestamp).toLocaleTimeString('id-ID')}] ${m.author.username}: ${m.content || '(attachment)'}`
      );
      return `💬 Messages (${channelId}):\n\n` + lines.join('\n');
    }

    if (action === 'guilds') {
      const data = await dc('/users/@me/guilds');
      const lines = data.slice(0, 15).map(g => `🏠 ${g.name}\n   ID: ${g.id}`);
      return `🏠 Discord Servers:\n\n` + lines.join('\n\n');
    }

    if (action === 'channels') {
      if (!guildId) return 'Provide guildId';
      const data = await dc(`/guilds/${guildId}/channels`);
      const text = data.filter(c => c.type === 0).map(c => `#${c.name} (${c.id})`).join('\n');
      return `📋 Text channels in ${guildId}:\n\n${text}`;
    }

    return `Unknown action "${action}". Available: send, read, guilds, channels`;
  } catch (err) {
    if (err.message === 'MISSING_ENV') return SETUP;
    return `Discord error: ${err.response?.data?.message || err.message}`;
  }
}

module.exports = { run };
