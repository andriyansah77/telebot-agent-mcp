const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const config = require('./config');

const SKILLS_DIR = path.join(__dirname, '..', 'skills');

// ---- Skill Loader ----
function loadSkills() {
  const skills = {};
  if (!fs.existsSync(SKILLS_DIR)) fs.mkdirSync(SKILLS_DIR, { recursive: true });
  const dirs = fs.readdirSync(SKILLS_DIR);
  for (const dir of dirs) {
    const skillFile = path.join(SKILLS_DIR, dir, 'index.js');
    const metaFile = path.join(SKILLS_DIR, dir, 'skill.json');
    if (fs.existsSync(skillFile) && fs.existsSync(metaFile)) {
      try {
        const meta = JSON.parse(fs.readFileSync(metaFile, 'utf8'));
        const mod = require(skillFile);
        skills[meta.name] = { ...meta, ...mod };
      } catch(e) {
        console.warn(`[Skill] Failed to load ${dir}:`, e.message);
      }
    }
  }
  return skills;
}

// ---- Tool Definitions (OpenAI function calling format) ----
const TOOL_DEFINITIONS = [
  {
    type: 'function',
    function: {
      name: 'executeCommand',
      description: 'Execute a shell command on the server. Use for system operations, running scripts, checking processes.',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'Shell command to execute' },
          timeout: { type: 'number', description: 'Timeout in seconds (default 30)' },
        },
        required: ['command'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'readFile',
      description: 'Read contents of a file',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path to read' },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'writeFile',
      description: 'Write content to a file (creates or overwrites)',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path' },
          content: { type: 'string', description: 'Content to write' },
        },
        required: ['path', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'listDirectory',
      description: 'List files in a directory',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Directory path (default: current dir)' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'httpGet',
      description: 'Make an HTTP GET request to any URL',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'URL to fetch' },
          headers: { type: 'object', description: 'Optional headers' },
        },
        required: ['url'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'httpPost',
      description: 'Make an HTTP POST request',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'URL to post to' },
          body: { type: 'object', description: 'Request body (JSON)' },
          headers: { type: 'object', description: 'Optional headers' },
        },
        required: ['url', 'body'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'webSearch',
      description: 'Search the web for current information, news, prices, etc.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'fetchPage',
      description: 'Fetch and extract text content from a web page URL',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'URL to fetch' },
        },
        required: ['url'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'remember',
      description: 'Save a key-value pair to persistent memory',
      parameters: {
        type: 'object',
        properties: {
          key: { type: 'string', description: 'Memory key' },
          value: { type: 'string', description: 'Value to store' },
        },
        required: ['key', 'value'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'recall',
      description: 'Recall a value from persistent memory',
      parameters: {
        type: 'object',
        properties: {
          key: { type: 'string', description: 'Key to recall (omit to list all)' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'calculator',
      description: 'Evaluate a mathematical expression',
      parameters: {
        type: 'object',
        properties: {
          expression: { type: 'string', description: 'Math expression to evaluate' },
        },
        required: ['expression'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'runJavaScript',
      description: 'Execute JavaScript code and return the result',
      parameters: {
        type: 'object',
        properties: {
          code: { type: 'string', description: 'JavaScript code to run' },
        },
        required: ['code'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'getTime',
      description: 'Get current date and time',
      parameters: {
        type: 'object',
        properties: {
          timezone: { type: 'string', description: 'Timezone (e.g. Asia/Jakarta)' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'listSkills',
      description: 'List all installed skills/plugins',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'callSkill',
      description: 'Call a specific installed skill',
      parameters: {
        type: 'object',
        properties: {
          skill: { type: 'string', description: 'Skill name' },
          action: { type: 'string', description: 'Action to perform' },
          args: { type: 'object', description: 'Arguments for the skill' },
        },
        required: ['skill'],
      },
    },
  },
];

// ---- Tool Implementations ----
const TOOLS = {
  executeCommand: {
    enabled: () => config.tools.shell,
    run: ({ command, timeout }) => new Promise((resolve) => {
      exec(command, { timeout: (timeout || 30) * 1000, shell: '/bin/sh' }, (err, stdout, stderr) => {
        if (err) resolve(`Error: ${stderr || err.message}`);
        else resolve(stdout || '(no output)');
      });
    }),
  },

  readFile: {
    enabled: () => config.tools.file,
    run: ({ path: filePath }) => {
      try { return fs.readFileSync(filePath, 'utf8'); }
      catch (e) { return `Error: ${e.message}`; }
    },
  },

  writeFile: {
    enabled: () => config.tools.file,
    run: ({ path: filePath, content }) => {
      try {
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, content, 'utf8');
        return `Written to ${filePath}`;
      } catch (e) { return `Error: ${e.message}`; }
    },
  },

  appendFile: {
    enabled: () => config.tools.file,
    run: ({ path: filePath, content }) => {
      try { fs.appendFileSync(filePath, content, 'utf8'); return `Appended to ${filePath}`; }
      catch (e) { return `Error: ${e.message}`; }
    },
  },

  deleteFile: {
    enabled: () => config.tools.file,
    run: ({ path: filePath }) => {
      try { fs.unlinkSync(filePath); return `Deleted: ${filePath}`; }
      catch (e) { return `Error: ${e.message}`; }
    },
  },

  listDirectory: {
    enabled: () => config.tools.file,
    run: ({ path: dirPath }) => {
      try { return fs.readdirSync(dirPath || '.').join('\n'); }
      catch (e) { return `Error: ${e.message}`; }
    },
  },

  httpGet: {
    enabled: () => config.tools.http,
    run: async ({ url, headers }) => {
      try {
        const res = await fetch(url, { headers: headers || {}, timeout: 15000 });
        return (await res.text()).slice(0, 5000);
      } catch (e) { return `Error: ${e.message}`; }
    },
  },

  httpPost: {
    enabled: () => config.tools.http,
    run: async ({ url, body, headers }) => {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(headers || {}) },
          body: typeof body === 'string' ? body : JSON.stringify(body),
          timeout: 15000,
        });
        return (await res.text()).slice(0, 5000);
      } catch (e) { return `Error: ${e.message}`; }
    },
  },

  webSearch: {
    enabled: () => config.tools.web,
    run: async ({ query }) => {
      // Try Brave Search API first (if configured)
      if (config.tools.braveApiKey) {
        try {
          const res = await fetch(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=5`, {
            headers: {
              'Accept': 'application/json',
              'Accept-Encoding': 'gzip',
              'X-Subscription-Token': config.tools.braveApiKey,
            },
          });
          const data = await res.json();
          const results = (data.web?.results || []).slice(0, 5).map(r =>
            `**${r.title}**\n${r.url}\n${r.description || ''}`
          );
          return results.length ? results.join('\n\n') : 'No results.';
        } catch(e) {
          console.warn('[Search] Brave failed:', e.message);
        }
      }

      // Fallback: DuckDuckGo HTML scrape
      try {
        const res = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
          headers: { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36' },
        });
        const html = await res.text();
        const results = [];
        const resultRegex = /class="result__title"[^>]*>.*?href="([^"]+)"[^>]*>(.*?)<\/a>[\s\S]*?class="result__snippet"[^>]*>(.*?)<\/a>/g;
        let match;
        while ((match = resultRegex.exec(html)) !== null && results.length < 5) {
          results.push(`${match[2].replace(/<[^>]+>/g, '')}\n${match[1]}\n${match[3].replace(/<[^>]+>/g, '')}`);
        }
        if (results.length) return results.join('\n\n');

        // Last resort: DuckDuckGo API
        const apiRes = await fetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`);
        const data = await apiRes.json();
        const topics = (data.RelatedTopics || []).slice(0, 6).map(t => t.Text || t.Name).filter(Boolean);
        return topics.length ? topics.join('\n\n') : data.AbstractText || 'No results found.';
      } catch (e) { return `Search error: ${e.message}`; }
    },
  },

  fetchPage: {
    enabled: () => config.tools.web,
    run: async ({ url }) => {
      try {
        const res = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36' },
          timeout: 15000,
        });
        const text = (await res.text()).replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
          .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
        return text.slice(0, 6000);
      } catch (e) { return `Error: ${e.message}`; }
    },
  },

  installPackage: {
    enabled: () => config.tools.shell,
    run: ({ package: pkg }) => new Promise((resolve) => {
      exec(`npm install ${pkg} --save 2>&1`, { timeout: 60000 }, (err, stdout, stderr) => {
        resolve(err ? `Error: ${stderr}` : `Installed: ${pkg}`);
      });
    }),
  },

  installSkill: {
    enabled: () => true,
    run: async ({ name, code, description, url }) => {
      try {
        const skillDir = path.join(SKILLS_DIR, name);
        fs.mkdirSync(skillDir, { recursive: true });

        if (url) {
          const res = await fetch(url);
          fs.writeFileSync(path.join(skillDir, 'index.js'), await res.text());
        } else if (code) {
          fs.writeFileSync(path.join(skillDir, 'index.js'), code);
        } else {
          return `Error: provide either code or url`;
        }

        fs.writeFileSync(path.join(skillDir, 'skill.json'), JSON.stringify({
          name, description: description || name, version: '1.0.0'
        }, null, 2));

        return `✅ Skill "${name}" installed`;
      } catch (e) { return `Error: ${e.message}`; }
    },
  },

  listSkills: {
    enabled: () => true,
    run: () => {
      const skills = loadSkills();
      const list = Object.values(skills);
      if (!list.length) return 'No skills installed.';
      return list.map(s => `• ${s.name} — ${s.description}`).join('\n');
    },
  },

  callSkill: {
    enabled: () => true,
    run: async ({ skill, action, args }) => {
      const skills = loadSkills();
      const s = skills[skill];
      if (!s) return `Skill "${skill}" not found`;
      if (!s.run) return `Skill "${skill}" has no run() function`;
      try {
        return await s.run({ action, ...args });
      } catch (e) { return `Skill error: ${e.message}`; }
    },
  },

  calculator: {
    enabled: () => true,
    run: ({ expression }) => {
      try {
        const sanitized = expression.replace(/[^0-9+\-*/().% ]/g, '');
        const result = Function(`"use strict"; return (${sanitized})`)();
        return `${expression} = ${result}`;
      } catch (e) { return `Error: ${e.message}`; }
    },
  },

  getTime: {
    enabled: () => true,
    run: ({ timezone }) => {
      const opts = timezone ? { timeZone: timezone } : {};
      return new Date().toLocaleString('id-ID', { ...opts, dateStyle: 'full', timeStyle: 'long' });
    },
  },

  runJavaScript: {
    enabled: () => config.tools.code,
    run: ({ code }) => {
      try {
        const logs = [];
        const fakeConsole = {
          log: (...a) => logs.push(a.join(' ')),
          error: (...a) => logs.push('ERR: ' + a.join(' ')),
        };
        const result = new Function('console', code)(fakeConsole);
        return [...logs, result !== undefined ? `=> ${result}` : ''].filter(Boolean).join('\n') || '(no output)';
      } catch (e) { return `Error: ${e.message}`; }
    },
  },

  remember: {
    enabled: () => true,
    run: ({ key, value }) => {
      try {
        const memFile = path.join(__dirname, '..', 'data', 'memory.json');
        const mem = fs.existsSync(memFile) ? JSON.parse(fs.readFileSync(memFile, 'utf8')) : {};
        mem[key] = value;
        fs.writeFileSync(memFile, JSON.stringify(mem, null, 2));
        return `Remembered: ${key} = ${value}`;
      } catch (e) { return `Error: ${e.message}`; }
    },
  },

  recall: {
    enabled: () => true,
    run: ({ key }) => {
      try {
        const memFile = path.join(__dirname, '..', 'data', 'memory.json');
        if (!fs.existsSync(memFile)) return 'Nothing in memory yet.';
        const mem = JSON.parse(fs.readFileSync(memFile, 'utf8'));
        if (!key) return JSON.stringify(mem, null, 2);
        return mem[key] !== undefined ? String(mem[key]) : `Key "${key}" not found`;
      } catch (e) { return `Error: ${e.message}`; }
    },
  },
};

// ---- Native Function Calling Executor ----
async function executeNativeToolCalls(toolCalls) {
  const results = [];
  for (const tc of toolCalls) {
    const name = tc.name || tc.function?.name;
    const argsRaw = tc.input || tc.function?.arguments;
    let args = {};
    try {
      args = typeof argsRaw === 'string' ? JSON.parse(argsRaw) : (argsRaw || {});
    } catch {}

    const tool = TOOLS[name];
    if (!tool || !tool.enabled()) {
      results.push({ id: tc.id, name, output: `Tool ${name} not available` });
      continue;
    }

    try {
      const output = await tool.run(args);
      results.push({ id: tc.id, name, output: String(output).slice(0, 6000) });
    } catch (e) {
      results.push({ id: tc.id, name, output: `Error: ${e.message}` });
    }
  }
  return results;
}

// ---- Legacy [CALL: ...] parser (backward compat) ----
async function executeToolCalls(text) {
  const pattern = /\[CALL:\s*(\w+)\((\{[\s\S]*?\}|[^)]*)\)\]/g;
  let match;
  let result = text;
  const executed = [];

  while ((match = pattern.exec(text)) !== null) {
    const [fullMatch, toolName, argsRaw] = match;
    const tool = TOOLS[toolName];

    if (!tool || !tool.enabled()) {
      result = result.replace(fullMatch, `[Tool ${toolName} not available]`);
      continue;
    }

    let args = {};
    try { args = JSON.parse(argsRaw); } catch {}

    const output = await tool.run(args);
    executed.push({ tool: toolName, args, output });
    result = result.replace(fullMatch, `\`\`\`\n${output}\n\`\`\``);
  }

  return { result, executed };
}

function listTools() {
  return TOOL_DEFINITIONS
    .filter(t => {
      const impl = TOOLS[t.function.name];
      return impl && impl.enabled();
    })
    .map(t => `• ${t.function.name} — ${t.function.description}`)
    .join('\n');
}

function getToolDefinitions() {
  return TOOL_DEFINITIONS.filter(t => {
    const impl = TOOLS[t.function.name];
    return impl && impl.enabled();
  });
}

module.exports = { TOOLS, executeToolCalls, executeNativeToolCalls, listTools, loadSkills, getToolDefinitions };
