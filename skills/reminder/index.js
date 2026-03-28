const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

function getDb() {
  const dir = '/home/container/data';
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const db = new Database(path.join(dir, 'reminders.db'));
  db.exec(`CREATE TABLE IF NOT EXISTS reminders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    message TEXT NOT NULL,
    due_at INTEGER NOT NULL,
    recurring TEXT DEFAULT '',
    done INTEGER DEFAULT 0,
    created_at INTEGER DEFAULT (unixepoch())
  )`);
  return db;
}

function parseWhen(when) {
  if (!when) return null;
  const now = Date.now();
  const s = when.toLowerCase().trim();

  // "in X minutes/hours/days"
  const inMatch = s.match(/in (\d+)\s*(minute|min|hour|hr|day|second|sec)s?/);
  if (inMatch) {
    const n = parseInt(inMatch[1]);
    const unit = inMatch[2];
    const ms = unit.startsWith('sec') ? 1000 : unit.startsWith('min') ? 60000 : unit.startsWith('hour') || unit.startsWith('hr') ? 3600000 : 86400000;
    return { ts: now + n * ms, recurring: '' };
  }

  // "tomorrow HH:mm" or "tomorrow"
  if (s.startsWith('tomorrow')) {
    const timeMatch = s.match(/(\d{1,2}):(\d{2})/);
    const d = new Date(); d.setDate(d.getDate() + 1);
    if (timeMatch) { d.setHours(parseInt(timeMatch[1]), parseInt(timeMatch[2]), 0, 0); }
    else { d.setHours(9, 0, 0, 0); }
    return { ts: d.getTime(), recurring: '' };
  }

  // "every day at HH:mm" / "every day HH:mm"
  const everyDay = s.match(/every day\s+(?:at\s+)?(\d{1,2}):(\d{2})/);
  if (everyDay) {
    const d = new Date(); d.setHours(parseInt(everyDay[1]), parseInt(everyDay[2]), 0, 0);
    if (d.getTime() <= now) d.setDate(d.getDate() + 1);
    return { ts: d.getTime(), recurring: `daily:${everyDay[1]}:${everyDay[2]}` };
  }

  // ISO datetime "2024-12-25 10:00" or "2024-12-25T10:00"
  const isoMatch = s.match(/(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/);
  if (isoMatch) {
    return { ts: new Date(`${isoMatch[1]}T${isoMatch[2]}:00`).getTime(), recurring: '' };
  }

  // "HH:mm" today
  const timeOnly = s.match(/^(\d{1,2}):(\d{2})$/);
  if (timeOnly) {
    const d = new Date(); d.setHours(parseInt(timeOnly[1]), parseInt(timeOnly[2]), 0, 0);
    if (d.getTime() <= now) d.setDate(d.getDate() + 1);
    return { ts: d.getTime(), recurring: '' };
  }

  return null;
}

function formatReminder(r) {
  const due = new Date(r.due_at).toLocaleString('id-ID');
  return `⏰ [${r.id}] ${r.message}\n   📅 ${due}${r.recurring ? ' (🔄 recurring)' : ''}${r.done ? ' ✅' : ''}`;
}

async function run({ action, message, when, id }) {
  try {
    const db = getDb();

    if (action === 'set') {
      if (!message || !when) return 'Provide message and when (e.g. "in 30 minutes", "tomorrow 9am", "every day 08:00")';
      const parsed = parseWhen(when);
      if (!parsed) return `Could not parse time: "${when}"\nTry: "in 30 minutes", "tomorrow 9:00", "2024-12-25 10:00", "every day 08:00"`;
      const result = db.prepare('INSERT INTO reminders (message, due_at, recurring) VALUES (?, ?, ?)').run(message, parsed.ts, parsed.recurring);
      const due = new Date(parsed.ts).toLocaleString('id-ID');
      return `✅ Reminder set!\n⏰ [${result.lastInsertRowid}] ${message}\n📅 Due: ${due}${parsed.recurring ? '\n🔄 Recurring' : ''}`;
    }

    if (action === 'list') {
      const reminders = db.prepare('SELECT * FROM reminders WHERE done = 0 ORDER BY due_at').all();
      if (!reminders.length) return 'No pending reminders.';
      return `⏰ Pending Reminders:\n\n` + reminders.map(formatReminder).join('\n\n');
    }

    if (action === 'cancel') {
      if (!id) return 'Provide reminder id';
      const r = db.prepare('SELECT * FROM reminders WHERE id = ?').get(id);
      if (!r) return `Reminder #${id} not found.`;
      db.prepare('UPDATE reminders SET done = 1 WHERE id = ?').run(id);
      return `✅ Reminder #${id} cancelled: ${r.message}`;
    }

    if (action === 'check') {
      const now = Date.now();
      const due = db.prepare('SELECT * FROM reminders WHERE done = 0 AND due_at <= ?').all(now);
      if (!due.length) return 'No due reminders.';

      // Process recurring ones
      for (const r of due) {
        if (r.recurring.startsWith('daily:')) {
          const [, h, m] = r.recurring.split(':');
          const next = new Date(); next.setDate(next.getDate() + 1);
          next.setHours(parseInt(h), parseInt(m), 0, 0);
          db.prepare('UPDATE reminders SET due_at = ? WHERE id = ?').run(next.getTime(), r.id);
        } else {
          db.prepare('UPDATE reminders SET done = 1 WHERE id = ?').run(r.id);
        }
      }

      return `🔔 Due Reminders (${due.length}):\n\n` + due.map(r => `⏰ ${r.message}`).join('\n');
    }

    return `Unknown action "${action}". Available: set, list, cancel, check`;
  } catch (err) {
    return `Reminder error: ${err.message}`;
  }
}

module.exports = { run };
