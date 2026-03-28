const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const config = require('./config');

let db;

function init() {
  const dbDir = path.dirname(config.dbPath);
  if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

  db = new Database(config.dbPath);
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      channel TEXT NOT NULL,
      name TEXT,
      approved INTEGER DEFAULT 0,
      blocked INTEGER DEFAULT 0,
      created_at INTEGER DEFAULT (strftime('%s','now'))
    );

    CREATE TABLE IF NOT EXISTS history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at INTEGER DEFAULT (strftime('%s','now'))
    );

    CREATE TABLE IF NOT EXISTS logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT,
      channel TEXT,
      type TEXT,
      data TEXT,
      created_at INTEGER DEFAULT (strftime('%s','now'))
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);

  return db;
}

function getDb() {
  if (!db) init();
  return db;
}

// ---- Users ----
function getUser(userId, channel) {
  return getDb().prepare('SELECT * FROM users WHERE id = ?').get(`${channel}:${userId}`);
}

function upsertUser(userId, channel, name) {
  const id = `${channel}:${userId}`;
  getDb().prepare(`
    INSERT INTO users (id, channel, name, approved)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET name = excluded.name
  `).run(id, channel, name || 'Unknown', 0);
  return getUser(userId, channel);
}

function approveUser(userId, channel) {
  getDb().prepare('UPDATE users SET approved = 1 WHERE id = ?').run(`${channel}:${userId}`);
}

function blockUser(userId, channel) {
  getDb().prepare('UPDATE users SET blocked = 1 WHERE id = ?').run(`${channel}:${userId}`);
}

function listUsers() {
  return getDb().prepare('SELECT * FROM users ORDER BY created_at DESC').all();
}

// ---- History ----
function getHistory(userId, channel, limit) {
  const id = `${channel}:${userId}`;
  return getDb().prepare(
    'SELECT role, content FROM history WHERE user_id = ? ORDER BY id DESC LIMIT ?'
  ).all(id, limit || 20).reverse();
}

function addHistory(userId, channel, role, content) {
  const id = `${channel}:${userId}`;
  getDb().prepare('INSERT INTO history (user_id, role, content) VALUES (?, ?, ?)').run(id, role, content);
}

function clearHistory(userId, channel) {
  getDb().prepare('DELETE FROM history WHERE user_id = ?').run(`${channel}:${userId}`);
}

// ---- Logs ----
function addLog(userId, channel, type, data) {
  getDb().prepare('INSERT INTO logs (user_id, channel, type, data) VALUES (?, ?, ?, ?)').run(
    userId, channel, type, typeof data === 'string' ? data : JSON.stringify(data)
  );
}

function getLogs(limit) {
  return getDb().prepare('SELECT * FROM logs ORDER BY id DESC LIMIT ?').all(limit || 50);
}

// ---- Settings ----
function getSetting(key, defaultVal) {
  const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : defaultVal;
}

function setSetting(key, value) {
  getDb().prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value);
}

module.exports = {
  init, getDb, getUser, upsertUser, approveUser, blockUser, listUsers,
  getHistory, addHistory, clearHistory, addLog, getLogs, getSetting, setSetting,
};
