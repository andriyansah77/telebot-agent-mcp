const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

function getDb() {
  const dir = '/home/container/data';
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const db = new Database(path.join(dir, 'calendar.db'));
  db.exec(`CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    date TEXT NOT NULL,
    time TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    created_at INTEGER DEFAULT (unixepoch())
  )`);
  return db;
}

function formatEvent(e) {
  return `📅 [${e.id}] ${e.title}\n   📆 ${e.date}${e.time ? ' ' + e.time : ''}${e.notes ? '\n   📝 ' + e.notes : ''}`;
}

async function run({ action, title, date, time, notes, id, days = 7 }) {
  try {
    const db = getDb();

    if (action === 'add') {
      if (!title || !date) return 'Provide title and date (YYYY-MM-DD)';
      const result = db.prepare('INSERT INTO events (title, date, time, notes) VALUES (?, ?, ?, ?)').run(title, date, time || '', notes || '');
      return `✅ Event added!\n${formatEvent({ id: result.lastInsertRowid, title, date, time: time || '', notes: notes || '' })}`;
    }

    if (action === 'today') {
      const today = new Date().toISOString().split('T')[0];
      const events = db.prepare('SELECT * FROM events WHERE date = ? ORDER BY time').all(today);
      if (!events.length) return `📅 No events today (${today}).`;
      return `📅 Today (${today}):\n\n` + events.map(formatEvent).join('\n\n');
    }

    if (action === 'week') {
      const dates = Array.from({ length: 7 }, (_, i) => {
        const d = new Date(); d.setDate(d.getDate() + i);
        return d.toISOString().split('T')[0];
      });
      const events = db.prepare(`SELECT * FROM events WHERE date IN (${dates.map(() => '?').join(',')}) ORDER BY date, time`).all(...dates);
      if (!events.length) return 'No events this week.';
      return `📅 This Week:\n\n` + events.map(formatEvent).join('\n\n');
    }

    if (action === 'list') {
      const n = parseInt(days) || 7;
      const today = new Date().toISOString().split('T')[0];
      const until = new Date(); until.setDate(until.getDate() + n);
      const untilStr = until.toISOString().split('T')[0];
      const events = db.prepare('SELECT * FROM events WHERE date BETWEEN ? AND ? ORDER BY date, time').all(today, untilStr);
      if (!events.length) return `No events in the next ${n} days.`;
      return `📅 Next ${n} days:\n\n` + events.map(formatEvent).join('\n\n');
    }

    if (action === 'delete') {
      if (!id) return 'Provide event id';
      const event = db.prepare('SELECT * FROM events WHERE id = ?').get(id);
      if (!event) return `Event #${id} not found.`;
      db.prepare('DELETE FROM events WHERE id = ?').run(id);
      return `🗑️ Deleted: ${event.title} (${event.date})`;
    }

    return `Unknown action "${action}". Available: add, today, week, list, delete`;
  } catch (err) {
    return `Calendar error: ${err.message}`;
  }
}

module.exports = { run };
