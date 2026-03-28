
const fetch = require('node-fetch');
const { getDb } = require('./database');

function initRagTables() {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS knowledge_base (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source TEXT,
      chunk TEXT NOT NULL,
      embedding TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS knowledge_meta (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source TEXT UNIQUE,
      type TEXT,
      added_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

// Call init lazily
let initialized = false;
function ensureInit() {
  if (!initialized) { initRagTables(); initialized = true; }
}

const BLINK_KEY = process.env.BLINK_API_KEY;
const EMBED_URL = 'https://core.blink.new/api/v1/ai/embeddings';

async function getEmbedding(text) {
  if (!BLINK_KEY) return null;
  try {
    const res = await fetch(EMBED_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${BLINK_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ model: 'text-embedding-3-small', input: text.slice(0, 8000) })
    });
    const data = await res.json();
    return data.data?.[0]?.embedding || null;
  } catch(e) {
    console.error('[RAG] Embedding error:', e.message);
    return null;
  }
}

function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function chunkText(text, size = 500, overlap = 100) {
  const words = text.split(/\s+/);
  const chunks = [];
  for (let i = 0; i < words.length; i += size - overlap) {
    chunks.push(words.slice(i, i + size).join(' '));
    if (i + size >= words.length) break;
  }
  return chunks;
}

async function addDocument(source, text, type = 'text') {
  ensureInit();
  const db = getDb();
  const chunks = chunkText(text);
  let added = 0;
  for (const chunk of chunks) {
    const embedding = await getEmbedding(chunk);
    db.prepare('INSERT INTO knowledge_base (source, chunk, embedding) VALUES (?, ?, ?)').run(
      source, chunk, embedding ? JSON.stringify(embedding) : null
    );
    added++;
  }
  db.prepare('INSERT OR REPLACE INTO knowledge_meta (source, type) VALUES (?, ?)').run(source, type);
  return added;
}

async function search(query, topK = 3) {
  ensureInit();
  const db = getDb();
  const queryEmbedding = await getEmbedding(query);
  const rows = db.prepare('SELECT id, source, chunk, embedding FROM knowledge_base').all();
  if (!rows.length) return [];

  const scored = rows
    .map(row => {
      let emb = null;
      try { emb = row.embedding ? JSON.parse(row.embedding) : null; } catch {}
      const score = queryEmbedding && emb ? cosineSimilarity(queryEmbedding, emb) : 0;
      return { ...row, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .filter(r => r.score > 0.3);

  return scored;
}

async function searchAndFormat(query) {
  try {
    const results = await search(query);
    if (!results.length) return null;
    return results.map(r => `[${r.source}]: ${r.chunk}`).join('\n\n---\n\n');
  } catch(e) {
    return null;
  }
}

function listSources() {
  ensureInit();
  return getDb().prepare('SELECT source, type, added_at FROM knowledge_meta ORDER BY added_at DESC').all();
}

function deleteSource(source) {
  ensureInit();
  const db = getDb();
  db.prepare('DELETE FROM knowledge_base WHERE source = ?').run(source);
  db.prepare('DELETE FROM knowledge_meta WHERE source = ?').run(source);
}

function getStats() {
  ensureInit();
  const db = getDb();
  const chunks = db.prepare('SELECT COUNT(*) as n FROM knowledge_base').get().n;
  const sources = db.prepare('SELECT COUNT(*) as n FROM knowledge_meta').get().n;
  return { chunks, sources };
}

module.exports = { addDocument, search, searchAndFormat, listSources, deleteSource, getStats, chunkText };
