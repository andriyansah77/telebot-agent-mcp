# TeleBot Agent MCP v2

Multi-channel AI Agent (Telegram + WhatsApp) dengan MCP tools, custom AI provider, dan support Pterodactyl panel.

## ✨ Fitur

- 🤖 **Multi-channel** — Telegram + WhatsApp (via Baileys)
- 🧠 **Multi-provider AI** — OpenAI, OpenRouter, Gemini, Anthropic, Groq, atau custom provider apapun
- 🔧 **MCP Tools** — Shell, file, web search, HTTP, JavaScript runner
- 🛡️ **Approval system** — User baru butuh persetujuan owner
- 💾 **Database** — SQLite untuk session, history, logs
- 🦅 **Pterodactyl-ready** — Egg tersedia, health check endpoint

## 🚀 Quick Start

### Local

```bash
git clone <repo-url> telebot-agent
cd telebot-agent
npm install
cp .env.example .env
# Edit .env isi token dan API key
npm start
```

### Pterodactyl

1. Import egg dari `pterodactyl/egg-telebot-agent.json` ke panel
2. Buat server baru dengan egg ini
3. Isi variabel di panel (bot token, AI provider, dll)
4. Start server

## ⚙️ Konfigurasi

Edit `.env` atau set di variabel Pterodactyl:

| Variable | Keterangan |
|---|---|
| `ENABLE_TELEGRAM` | Aktifkan channel Telegram (default: true) |
| `ENABLE_WHATSAPP` | Aktifkan channel WhatsApp (default: false) |
| `TELEGRAM_BOT_TOKEN` | Token dari @BotFather |
| `TELEGRAM_OWNER_ID` | ID Telegram kamu (dari @userinfobot) |
| `WHATSAPP_OWNER_NUMBER` | Nomor WA kamu (6281xxx, tanpa +) |
| `AI_PROVIDER` | Provider AI: `openai`, `openrouter`, `gemini`, `anthropic`, `groq`, `custom` |
| `OPENROUTER_API_KEY` | API key OpenRouter |
| `GEMINI_API_KEY` | API key Google Gemini |
| `OPENAI_API_KEY` | API key OpenAI |
| `ANTHROPIC_API_KEY` | API key Anthropic |
| `GROQ_API_KEY` | API key Groq |
| `CUSTOM_API_KEY` | API key provider custom |
| `CUSTOM_BASE_URL` | Base URL provider custom (misal: `https://provider.com/v1`) |
| `CUSTOM_MODEL` | Nama model untuk provider custom |
| `AGENT_NAME` | Nama agent kamu |
| `REQUIRE_APPROVAL` | User baru butuh approval? (true/false) |

## 🔧 MCP Tools

Agent bisa memanggil tools dengan format:
```
[CALL: toolName({"key": "value"})]
```

| Tool | Keterangan |
|---|---|
| `executeCommand` | Jalankan perintah shell |
| `readFile` | Baca file |
| `writeFile` | Tulis file |
| `appendFile` | Tambah konten ke file |
| `deleteFile` | Hapus file |
| `listDirectory` | List isi folder |
| `httpGet` | HTTP GET request |
| `httpPost` | HTTP POST request |
| `webSearch` | Search DuckDuckGo |
| `fetchPage` | Ambil konten web |
| `calculator` | Hitung ekspresi matematika |
| `getTime` | Waktu saat ini |
| `runJavaScript` | Jalankan kode JavaScript |

## 📋 Perintah Bot

### Telegram
```
/start    — Mulai bot
/help     — Bantuan
/reset    — Reset percakapan
/model    — Lihat model AI aktif

# Owner only
/users    — Daftar users
/approve  — Setujui user
/block    — Blokir user
/setprovider — Ganti AI provider
/setmodel — Ganti model AI
/logs     — Activity logs
/stats    — Statistik
```

### WhatsApp
```
/start    — Mulai bot
/reset    — Reset percakapan
/help     — Bantuan

# Owner only
/approve  — Setujui user
/block    — Blokir user
/users    — Daftar users
```

## 🦅 Pterodactyl

Egg di `pterodactyl/egg-telebot-agent.json`. Import ke panel > Nests > Import Egg.

Health check tersedia di `http://server:PORT/health`.

## 📁 Struktur

```
telebot-agent/
├── index.js              # Entry point
├── .env.example          # Template konfigurasi
├── src/
│   ├── config.js         # Konfigurasi terpusat
│   ├── database.js       # SQLite database
│   ├── ai.js             # Multi-provider AI client
│   ├── agent.js          # Core agent logic
│   ├── tools.js          # MCP tools
│   ├── server.js         # HTTP health server
│   └── channels/
│       ├── telegram.js   # Telegram channel
│       └── whatsapp.js   # WhatsApp channel
└── pterodactyl/
    └── egg-telebot-agent.json
```
