const axios = require('axios');
const BASE = 'https://api.coingecko.com/api/v3';

async function run({ action, symbol, limit = 10 }) {
  try {
    if (action === 'price') {
      if (!symbol) return 'Provide a symbol (e.g. bitcoin, ethereum, solana)';
      const id = symbol.toLowerCase().trim();
      const { data } = await axios.get(`${BASE}/simple/price`, {
        params: { ids: id, vs_currencies: 'usd', include_24hr_change: true, include_market_cap: true, include_24hr_vol: true }
      });
      if (!data[id]) return `No data for "${id}". Use full coin name (e.g. bitcoin).`;
      const c = data[id];
      const change = c.usd_24h_change ? (c.usd_24h_change > 0 ? '📈' : '📉') + ' ' + c.usd_24h_change.toFixed(2) + '%' : 'N/A';
      return `💰 ${id.toUpperCase()}\nPrice: $${c.usd.toLocaleString()}\n24h: ${change}\nMarket Cap: $${c.usd_market_cap ? (c.usd_market_cap / 1e9).toFixed(2) + 'B' : 'N/A'}\nVolume 24h: $${c.usd_24h_vol ? (c.usd_24h_vol / 1e6).toFixed(2) + 'M' : 'N/A'}`;
    }

    if (action === 'top') {
      const n = Math.min(parseInt(limit) || 10, 50);
      const { data } = await axios.get(`${BASE}/coins/markets`, {
        params: { vs_currency: 'usd', order: 'market_cap_desc', per_page: n, page: 1, sparkline: false }
      });
      const lines = data.map((c, i) => {
        const chg = c.price_change_percentage_24h;
        const arrow = chg > 0 ? '📈' : '📉';
        return `${i + 1}. ${c.name} (${c.symbol.toUpperCase()}) — $${c.current_price.toLocaleString()} ${arrow} ${chg ? chg.toFixed(2) + '%' : '—'}`;
      });
      return `📊 Top ${n} Cryptocurrencies:\n\n` + lines.join('\n');
    }

    if (action === 'global') {
      const { data } = await axios.get(`${BASE}/global`);
      const g = data.data;
      return `🌍 Global Crypto Market\nTotal Market Cap: $${(g.total_market_cap.usd / 1e12).toFixed(2)}T\n24h Volume: $${(g.total_volume.usd / 1e9).toFixed(2)}B\nBTC Dominance: ${g.market_cap_percentage.btc.toFixed(2)}%\nETH Dominance: ${g.market_cap_percentage.eth.toFixed(2)}%\nActive Cryptos: ${g.active_cryptocurrencies.toLocaleString()}\nMarkets: ${g.markets}`;
    }

    if (action === 'trending') {
      const { data } = await axios.get(`${BASE}/search/trending`);
      const coins = data.coins.slice(0, 7).map((c, i) =>
        `${i + 1}. ${c.item.name} (${c.item.symbol}) — Rank #${c.item.market_cap_rank || 'N/A'}`
      );
      return `🔥 Trending Now:\n\n` + coins.join('\n');
    }

    return `Unknown action "${action}". Available: price, top, global, trending`;
  } catch (err) {
    return `Crypto error: ${err.message}`;
  }
}

module.exports = { run };
