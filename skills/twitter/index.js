const axios = require('axios');
const crypto = require('crypto');

const SETUP = '⚙️ Twitter not configured.\nFor reading: set TWITTER_BEARER_TOKEN\nFor tweeting: set TWITTER_API_KEY, TWITTER_API_SECRET, TWITTER_ACCESS_TOKEN, TWITTER_ACCESS_SECRET';

function oauthSign(method, url, params, consumerKey, consumerSecret, accessToken, accessSecret) {
  const nonce = crypto.randomBytes(16).toString('hex');
  const ts = Math.floor(Date.now() / 1000).toString();
  const oauthParams = {
    oauth_consumer_key: consumerKey, oauth_nonce: nonce,
    oauth_signature_method: 'HMAC-SHA1', oauth_timestamp: ts,
    oauth_token: accessToken, oauth_version: '1.0'
  };
  const allParams = { ...params, ...oauthParams };
  const paramStr = Object.keys(allParams).sort()
    .map(k => `${encodeURIComponent(k)}=${encodeURIComponent(allParams[k])}`).join('&');
  const baseStr = `${method.toUpperCase()}&${encodeURIComponent(url)}&${encodeURIComponent(paramStr)}`;
  const signingKey = `${encodeURIComponent(consumerSecret)}&${encodeURIComponent(accessSecret)}`;
  const signature = crypto.createHmac('sha1', signingKey).update(baseStr).digest('base64');
  oauthParams.oauth_signature = signature;
  return 'OAuth ' + Object.keys(oauthParams).sort()
    .map(k => `${encodeURIComponent(k)}="${encodeURIComponent(oauthParams[k])}"`).join(', ');
}

async function run({ action, text, query, limit = 10, username }) {
  try {
    const bearer = process.env.TWITTER_BEARER_TOKEN;
    const apiKey = process.env.TWITTER_API_KEY;
    const apiSecret = process.env.TWITTER_API_SECRET;
    const accessToken = process.env.TWITTER_ACCESS_TOKEN;
    const accessSecret = process.env.TWITTER_ACCESS_SECRET;

    if (action === 'tweet') {
      if (!text) return 'Provide text for the tweet';
      if (!apiKey || !apiSecret || !accessToken || !accessSecret) return SETUP;
      const url = 'https://api.twitter.com/2/tweets';
      const authHeader = oauthSign('POST', url, {}, apiKey, apiSecret, accessToken, accessSecret);
      const { data } = await axios.post(url, { text }, {
        headers: { Authorization: authHeader, 'Content-Type': 'application/json' }
      });
      return `✅ Tweet posted!\nID: ${data.data.id}\nText: ${data.data.text}`;
    }

    if (action === 'search') {
      if (!query) return 'Provide a search query';
      if (!bearer) return SETUP;
      const n = Math.min(parseInt(limit) || 10, 100);
      const { data } = await axios.get('https://api.twitter.com/2/tweets/search/recent', {
        params: { query, max_results: n, 'tweet.fields': 'created_at,author_id,public_metrics' },
        headers: { Authorization: `Bearer ${bearer}` }
      });
      if (!data.data?.length) return `No tweets found for "${query}"`;
      const lines = data.data.map((t, i) =>
        `${i + 1}. ${t.text}\n   ❤️ ${t.public_metrics?.like_count || 0} · 🔁 ${t.public_metrics?.retweet_count || 0}`
      );
      return `🐦 Twitter: "${query}"\n\n` + lines.join('\n\n');
    }

    if (action === 'timeline') {
      if (!bearer || !accessToken) return SETUP;
      // Get own user id first
      const me = await axios.get('https://api.twitter.com/2/users/me', {
        headers: { Authorization: `Bearer ${bearer}` }
      });
      const userId = me.data.data.id;
      const n = Math.min(parseInt(limit) || 10, 100);
      const { data } = await axios.get(`https://api.twitter.com/2/users/${userId}/tweets`, {
        params: { max_results: n, 'tweet.fields': 'created_at,public_metrics' },
        headers: { Authorization: `Bearer ${bearer}` }
      });
      if (!data.data?.length) return 'No tweets found.';
      const lines = data.data.map((t, i) =>
        `${i + 1}. ${t.text}\n   ❤️ ${t.public_metrics?.like_count} · 🔁 ${t.public_metrics?.retweet_count}`
      );
      return `🐦 Your Timeline:\n\n` + lines.join('\n\n');
    }

    return `Unknown action "${action}". Available: tweet, search, timeline`;
  } catch (err) {
    if (err.message === 'MISSING_ENV') return SETUP;
    return `Twitter error: ${err.response?.data?.detail || err.response?.data?.errors?.[0]?.message || err.message}`;
  }
}

module.exports = { run };
