const axios = require('axios');

const LANG_NAMES = {
  'en':'English','id':'Indonesian','zh':'Chinese','ja':'Japanese','ko':'Korean',
  'ar':'Arabic','fr':'French','de':'German','es':'Spanish','pt':'Portuguese',
  'ru':'Russian','hi':'Hindi','th':'Thai','vi':'Vietnamese','ms':'Malay',
  'it':'Italian','nl':'Dutch','tr':'Turkish','pl':'Polish','uk':'Ukrainian'
};

async function run({ action, text, to, from }) {
  try {
    if (action === 'translate') {
      if (!text || !to) return 'Provide text and target language (e.g. id, en, ja)';
      const langPair = `${from || 'auto'}|${to}`;

      // LibreTranslate if key set
      if (process.env.LIBRETRANSLATE_API_KEY || process.env.LIBRETRANSLATE_URL) {
        const baseUrl = process.env.LIBRETRANSLATE_URL || 'https://libretranslate.com';
        const { data } = await axios.post(`${baseUrl}/translate`, {
          q: text,
          source: from || 'auto',
          target: to,
          ...(process.env.LIBRETRANSLATE_API_KEY ? { api_key: process.env.LIBRETRANSLATE_API_KEY } : {})
        });
        return `🌐 Translation (${from || 'auto'} → ${to}):\n${data.translatedText}`;
      }

      // MyMemory free API (no key, 500 chars/day per IP)
      const { data } = await axios.get('https://api.mymemory.translated.net/get', {
        params: { q: text.slice(0, 500), langpair: langPair }
      });
      if (data.responseStatus !== 200) return `Translation failed: ${data.responseDetails}`;
      const detectedFrom = data.matches?.[0]?.source || from || 'auto';
      return `🌐 ${LANG_NAMES[detectedFrom] || detectedFrom} → ${LANG_NAMES[to] || to}:\n${data.responseData.translatedText}`;
    }

    if (action === 'detect') {
      if (!text) return 'Provide text to detect language';
      const { data } = await axios.get('https://api.mymemory.translated.net/get', {
        params: { q: text.slice(0, 100), langpair: 'auto|en' }
      });
      const detected = data.matches?.[0]?.source || 'unknown';
      return `🔍 Detected language: ${LANG_NAMES[detected] || detected} (${detected})`;
    }

    if (action === 'languages') {
      const langs = Object.entries(LANG_NAMES).map(([code, name]) => `• ${code} — ${name}`).join('\n');
      return `🌐 Available languages:\n\n${langs}`;
    }

    return `Unknown action "${action}". Available: translate, detect, languages`;
  } catch (err) {
    return `Translate error: ${err.message}`;
  }
}

module.exports = { run };
