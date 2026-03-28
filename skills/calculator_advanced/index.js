const axios = require('axios');

const UNITS = {
  length: { m:1, km:1000, cm:0.01, mm:0.001, mile:1609.34, yard:0.9144, foot:0.3048, inch:0.0254 },
  weight: { kg:1, g:0.001, mg:0.000001, lb:0.453592, oz:0.0283495, ton:1000 },
  speed:  { 'km/h':1, 'mph':1.60934, 'knot':1.852, 'm/s':3.6 },
  data:   { bit:1, byte:8, kb:8192, mb:8388608, gb:8589934592, tb:8796093022208 },
};

function safeCalc(expr) {
  const safe = expr
    .replace(/[^0-9+\-*/().%^ eEpiPIsqrtlognfloorceilabs ,]/g, '')
    .replace(/\^/g, '**')
    .replace(/sqrt\(/g, 'Math.sqrt(')
    .replace(/log\(/g, 'Math.log10(')
    .replace(/ln\(/g, 'Math.log(')
    .replace(/\bsin\(/g, 'Math.sin(')
    .replace(/\bcos\(/g, 'Math.cos(')
    .replace(/\btan\(/g, 'Math.tan(')
    .replace(/\bfloor\(/g, 'Math.floor(')
    .replace(/\bceil\(/g, 'Math.ceil(')
    .replace(/\babs\(/g, 'Math.abs(')
    .replace(/\bpi\b/gi, 'Math.PI')
    .replace(/\be\b/g, 'Math.E');
  return Function(`"use strict"; return (${safe})`)();
}

async function run({ action, expression, value, from, to, amount }) {
  try {
    if (action === 'calc') {
      if (!expression) return 'Provide an expression';
      const result = safeCalc(expression);
      if (typeof result !== 'number' || isNaN(result)) return `Invalid expression: ${expression}`;
      return `🔢 ${expression} = ${result}`;
    }

    if (action === 'convert') {
      if (value === undefined || !from || !to) return 'Provide value, from, and to units';
      from = from.toLowerCase(); to = to.toLowerCase();
      const v = parseFloat(value);

      // Temperature special case
      if (['c', 'celsius', 'f', 'fahrenheit', 'k', 'kelvin'].includes(from)) {
        let celsius = from.startsWith('c') ? v : from.startsWith('f') ? (v - 32) * 5/9 : v - 273.15;
        let result = to.startsWith('c') ? celsius : to.startsWith('f') ? celsius * 9/5 + 32 : celsius + 273.15;
        const toName = to.startsWith('c') ? '°C' : to.startsWith('f') ? '°F' : 'K';
        return `🌡️ ${v}${from.startsWith('c') ? '°C' : from.startsWith('f') ? '°F' : 'K'} = ${result.toFixed(4)}${toName}`;
      }

      for (const [cat, table] of Object.entries(UNITS)) {
        if (table[from] && table[to]) {
          const result = (v * table[from]) / table[to];
          return `📐 ${v} ${from} = ${result.toFixed(6).replace(/\.?0+$/, '')} ${to} (${cat})`;
        }
      }
      return `Unknown unit conversion: ${from} → ${to}`;
    }

    if (action === 'currency') {
      if (!amount || !from || !to) return 'Provide amount, from, and to (currency codes e.g. USD, EUR, IDR)';
      const f = from.toUpperCase(), t = to.toUpperCase();
      const { data } = await axios.get(`https://api.frankfurter.app/latest?from=${f}&to=${t}`, { timeout: 8000 });
      if (!data.rates?.[t]) return `Currency ${t} not found. Available: EUR, USD, GBP, JPY, IDR, etc.`;
      const result = parseFloat(amount) * data.rates[t];
      return `💱 ${amount} ${f} = ${result.toFixed(2)} ${t}\n(Rate: 1 ${f} = ${data.rates[t]} ${t})`;
    }

    return `Unknown action "${action}". Available: calc, convert, currency`;
  } catch (err) {
    return `Calculator error: ${err.message}`;
  }
}

module.exports = { run };
