const axios = require('axios');

const SETUP = '⚙️ Google not configured. Set:\nGOOGLE_CLIENT_ID\nGOOGLE_CLIENT_SECRET\nGOOGLE_REFRESH_TOKEN\n\nGet from: https://console.cloud.google.com → OAuth2 credentials';

let _token = null, _expiry = 0;

async function getToken() {
  const { GOOGLE_CLIENT_ID: cid, GOOGLE_CLIENT_SECRET: csec, GOOGLE_REFRESH_TOKEN: rt } = process.env;
  if (!cid || !csec || !rt) throw new Error('MISSING_ENV');
  if (_token && Date.now() < _expiry - 30000) return _token;
  const { data } = await axios.post('https://oauth2.googleapis.com/token', {
    client_id: cid, client_secret: csec, refresh_token: rt, grant_type: 'refresh_token'
  });
  _token = data.access_token;
  _expiry = Date.now() + data.expires_in * 1000;
  return _token;
}

async function gapi(method, url, params, body) {
  const token = await getToken();
  const res = await axios({ method, url, params, data: body, headers: { Authorization: `Bearer ${token}` } });
  return res.data;
}

async function run({ action, spreadsheetId, range, values, query, days = 7, summary, start, end, calendarId = 'primary' }) {
  try {
    if (action === 'sheets_read') {
      if (!spreadsheetId || !range) return 'Provide spreadsheetId and range (e.g. Sheet1!A1:D10)';
      const data = await gapi('GET', `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}`);
      const rows = (data.values || []).map(r => r.join(' | ')).join('\n');
      return `📊 Spreadsheet [${range}]:\n${rows || '(empty)'}`;
    }

    if (action === 'sheets_write') {
      if (!spreadsheetId || !range || !values) return 'Provide spreadsheetId, range and values (2D array)';
      const parsed = typeof values === 'string' ? JSON.parse(values) : values;
      await gapi('PUT', `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}`,
        { valueInputOption: 'USER_ENTERED' }, { values: parsed });
      return `✅ Written to spreadsheet [${range}]`;
    }

    if (action === 'drive_list') {
      const params = { pageSize: 15, fields: 'files(id,name,mimeType,modifiedTime)' };
      if (query) params.q = query;
      const data = await gapi('GET', 'https://www.googleapis.com/drive/v3/files', params);
      if (!data.files?.length) return 'No files found.';
      const lines = data.files.map(f =>
        `📄 ${f.name}\n   ${f.mimeType.split('/').pop()} · ${new Date(f.modifiedTime).toLocaleDateString()}\n   ID: ${f.id}`
      );
      return `📁 Google Drive:\n\n` + lines.join('\n\n');
    }

    if (action === 'calendar_events') {
      const now = new Date();
      const until = new Date(now.getTime() + parseInt(days) * 86400000);
      const data = await gapi('GET', `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events`, {
        timeMin: now.toISOString(), timeMax: until.toISOString(),
        singleEvents: true, orderBy: 'startTime', maxResults: 15
      });
      if (!data.items?.length) return `No events in the next ${days} days.`;
      const lines = data.items.map(e => {
        const s = e.start.dateTime || e.start.date;
        return `📅 ${new Date(s).toLocaleString('id-ID')}: ${e.summary}${e.location ? '\n   📍 ' + e.location : ''}`;
      });
      return `📆 Upcoming Events (${days} days):\n\n` + lines.join('\n\n');
    }

    if (action === 'calendar_add') {
      if (!summary || !start || !end) return 'Provide summary, start (ISO datetime), end (ISO datetime)';
      const event = { summary, start: { dateTime: start }, end: { dateTime: end } };
      const data = await gapi('POST', `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events`, {}, event);
      return `✅ Event created: ${data.summary}\n📅 ${start}\n🔗 ${data.htmlLink}`;
    }

    return `Unknown action "${action}". Available: sheets_read, sheets_write, drive_list, calendar_events, calendar_add`;
  } catch (err) {
    if (err.message === 'MISSING_ENV') return SETUP;
    return `Google error: ${err.response?.data?.error?.message || err.message}`;
  }
}

module.exports = { run };
