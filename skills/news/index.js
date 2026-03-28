const axios = require('axios');

function parseRSS(xml) {
  const items = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const b = match[1];
    const title = (b.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/) || b.match(/<title>([^<]*)<\/title>/) || [])[1] || '';
    const link = (b.match(/<link>([^<]*)<\/link>/) || [])[1] || '';
    const pubDate = (b.match(/<pubDate>([^<]*)<\/pubDate>/) || [])[1] || '';
    const source = (b.match(/<source[^>]*>([\s\S]*?)<\/source>/) || [])[1] || 'Google News';
    if (title.trim()) items.push({ title: title.trim(), link: link.trim(), pubDate: pubDate.trim(), source: source.trim() });
  }
  return items;
}

function timeAgo(dateStr) {
  if (!dateStr) return '';
  try {
    const m = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  } catch { return ''; }
}

async function run({ action, topic, query, limit = 5 }) {
  try {
    const n = Math.min(parseInt(limit) || 5, 20);

    if (action === 'latest') {
      const url = topic
        ? `https://news.google.com/rss/search?q=${encodeURIComponent(topic)}&hl=en-US&gl=US&ceid=US:en`
        : `https://news.google.com/rss?hl=en-US&gl=US&ceid=US:en`;
      const { data } = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 12000 });
      const items = parseRSS(data).slice(0, n);
      if (!items.length) return 'No news found.';
      const lines = items.map((item, i) =>
        `${i + 1}. ${item.title}\n   📰 ${item.source} · ${timeAgo(item.pubDate)}\n   🔗 ${item.link}`
      );
      return `📰 ${topic ? 'News: ' + topic : 'Latest News'}\n\n` + lines.join('\n\n');
    }

    if (action === 'search') {
      if (!query) return 'Provide a search query';
      const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
      const { data } = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 12000 });
      const items = parseRSS(data).slice(0, n);
      if (!items.length) return `No results for "${query}"`;
      const lines = items.map((item, i) =>
        `${i + 1}. ${item.title}\n   📰 ${item.source} · ${timeAgo(item.pubDate)}\n   🔗 ${item.link}`
      );
      return `🔍 News: "${query}"\n\n` + lines.join('\n\n');
    }

    return `Unknown action "${action}". Available: latest, search`;
  } catch (err) {
    return `News error: ${err.message}`;
  }
}

module.exports = { run };
