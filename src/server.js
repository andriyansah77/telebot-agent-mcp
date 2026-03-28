const express = require('express');
const config = require('./config');
const db = require('./database');

function start() {
  if (!config.http.enabled) return;

  const app = express();
  app.use(express.json());

  app.get('/', (req, res) => res.json({ status: 'ok', uptime: process.uptime() }));
  app.get('/health', (req, res) => res.json({ status: 'ok' }));
  app.get('/stats', (req, res) => {
    const users = db.listUsers();
    res.json({ users: users.length, approved: users.filter(u => u.approved).length });
  });

  const server = app.listen(config.http.port, '0.0.0.0', () => {
    console.log(`[HTTP] Health server on port ${config.http.port}`);
  });

  server.on('error', err => {
    if (err.code === 'EADDRINUSE') {
      console.warn(`[HTTP] Port ${config.http.port} in use, skipping`);
    } else {
      console.error('[HTTP] Error:', err.message);
    }
  });

  // Keep the event loop alive
  server.keepAliveTimeout = 60000 * 60 * 24; // 24h
}

module.exports = { start };
