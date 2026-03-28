const axios = require('axios');

const SETUP = '⚙️ Set AIRTABLE_API_KEY env var.\nGet from: https://airtable.com/create/tokens';

function at(path, method = 'GET', body) {
  const key = process.env.AIRTABLE_API_KEY;
  if (!key) throw new Error('MISSING_ENV');
  return axios({ method, url: `https://api.airtable.com/v0${path}`, data: body,
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }
  }).then(r => r.data);
}

function formatFields(fields) {
  return Object.entries(fields).slice(0, 5).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`).join(' | ');
}

async function run({ action, baseId, tableId, filter, fields, recordId, limit = 10 }) {
  try {
    if (action === 'list_bases') {
      const data = await at('/meta/bases');
      if (!data.bases?.length) return 'No bases found.';
      const lines = data.bases.map(b => `📋 ${b.name}\n   ID: ${b.id}`);
      return `📋 Airtable Bases:\n\n` + lines.join('\n\n');
    }

    if (action === 'list_tables') {
      if (!baseId) return 'Provide baseId';
      const data = await at(`/meta/bases/${baseId}/tables`);
      if (!data.tables?.length) return 'No tables found.';
      const lines = data.tables.map(t => `📊 ${t.name}\n   ID: ${t.id} · Fields: ${t.fields.map(f => f.name).join(', ')}`);
      return `📊 Tables in ${baseId}:\n\n` + lines.join('\n\n');
    }

    if (action === 'query') {
      if (!baseId || !tableId) return 'Provide baseId and tableId';
      const n = Math.min(parseInt(limit) || 10, 100);
      const params = { maxRecords: n };
      if (filter) params.filterByFormula = filter;
      const data = await at(`/${baseId}/${tableId}`, 'GET', undefined);
      const { data: res } = await axios.get(`https://api.airtable.com/v0/${baseId}/${tableId}`, {
        params, headers: { Authorization: `Bearer ${process.env.AIRTABLE_API_KEY}` }
      });
      if (!res.records?.length) return 'No records found.';
      const lines = res.records.map((r, i) => `${i + 1}. ${formatFields(r.fields)}\n   ID: ${r.id}`);
      return `📋 Records (${res.records.length}):\n\n` + lines.join('\n\n');
    }

    if (action === 'create_record') {
      if (!baseId || !tableId || !fields) return 'Provide baseId, tableId, and fields (JSON object)';
      const f = typeof fields === 'string' ? JSON.parse(fields) : fields;
      const data = await at(`/${baseId}/${tableId}`, 'POST', { fields: f });
      return `✅ Record created!\nID: ${data.id}\n${formatFields(data.fields)}`;
    }

    if (action === 'update_record') {
      if (!baseId || !tableId || !recordId || !fields) return 'Provide baseId, tableId, recordId, and fields';
      const f = typeof fields === 'string' ? JSON.parse(fields) : fields;
      const data = await at(`/${baseId}/${tableId}/${recordId}`, 'PATCH', { fields: f });
      return `✅ Record updated!\nID: ${data.id}\n${formatFields(data.fields)}`;
    }

    return `Unknown action "${action}". Available: list_bases, list_tables, query, create_record, update_record`;
  } catch (err) {
    if (err.message === 'MISSING_ENV') return SETUP;
    return `Airtable error: ${err.response?.data?.error?.message || err.message}`;
  }
}

module.exports = { run };
