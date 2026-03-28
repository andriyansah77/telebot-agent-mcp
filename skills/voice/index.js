const axios = require('axios');

async function run({ action, text, voice = 'alloy' }) {
  try {
    if (action === 'speak') {
      if (!text) return 'Provide text to speak';
      const key = process.env.BLINK_API_KEY;
      if (!key) return '⚙️ Set BLINK_API_KEY env var';

      const { data } = await axios.post('https://core.blink.new/api/v1/ai/speech', {
        model: 'tts-1',
        input: text.slice(0, 4096),
        voice,
        response_format: 'mp3'
      }, {
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        responseType: 'arraybuffer'
      });

      // Save to temp file and return path
      const fs = require('fs');
      const path = require('path');
      const dir = '/home/container/data/tts';
      fs.mkdirSync(dir, { recursive: true });
      const filename = `tts-${Date.now()}.mp3`;
      const filepath = path.join(dir, filename);
      fs.writeFileSync(filepath, Buffer.from(data));

      return `AUDIO:file://${filepath}`;
    }

    if (action === 'voices') {
      return `🎙️ Available voices:\n• alloy — Balanced, neutral\n• echo — Male, clear\n• fable — Male, British\n• onyx — Male, deep\n• nova — Female, warm\n• shimmer — Female, gentle`;
    }

    return `Unknown action "${action}". Available: speak, voices`;
  } catch (err) {
    return `Voice error: ${err.response?.data?.error?.message || err.message}`;
  }
}

module.exports = { run };
