/**
 * HTTP server for health checks (Pterodactyl panel compatibility)
 */
const express = require('express');
const config = require('./config');
const db = require('./database');

function start() {
  if (!config.http.enabled) return;

  const app = express();
  app.use(express.json());

  // Health check
  app.get('/', (req, res) => {
    res.json({
      status: 'ok',
      name: config.agent.name,
      provider: config.ai.provider,
      channels: config.channels,
      uptime: process.uptime(),
    });
  });

  app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  app.get('/stats', (req, res) => {
    const users = db.listUsers();
    res.json({
      users: users.length,
      approved: users.filter(u => u.approved).length,
      provider: config.ai.provider,
    });
  });

  app.listen(config.http.port, '0.0.0.0', () => {
    console.log(`[HTTP] Health server on port ${config.http.port}`);
  });
}

module.exports = { start };
