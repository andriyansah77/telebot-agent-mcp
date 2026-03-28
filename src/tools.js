
const { exec, execSync } = require('child_process');
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

const TOOLS = {
  // ---- Shell ----
  executeCommand: {
    enabled: () => config.tools.shell,
    description: 'Execute a shell command',
    run: ({ command, timeout }) => new Promise((resolve) => {
      exec(command, { timeout: (timeout || 30) * 1000, shell: '/bin/sh' }, (err, stdout, stderr) => {
        resolve(err ? `Error: ${stderr || err.message}` : stdout || '(no output)');
      });
    }),
  },

  // ---- File ----
  readFile: {
    enabled: () => config.tools.file,
    description: 'Read a file',
    run: ({ path: filePath }) => {
      try { return fs.readFileSync(filePath, 'utf8'); }
      catch (e) { return `Error: ${e.message}`; }
    },
  },

  writeFile: {
    enabled: () => config.tools.file,
    description: 'Write content to a file',
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
    description: 'Append content to a file',
    run: ({ path: filePath, content }) => {
      try { fs.appendFileSync(filePath, content, 'utf8'); return `Appended to ${filePath}`; }
      catch (e) { return `Error: ${e.message}`; }
    },
  },

  deleteFile: {
    enabled: () => config.tools.file,
    description: 'Delete a file',
    run: ({ path: filePath }) => {
      try { fs.unlinkSync(filePath); return `Deleted: ${filePath}`; }
      catch (e) { return `Error: ${e.message}`; }
    },
  },

  listDirectory: {
    enabled: () => config.tools.file,
    description: 'List directory contents',
    run: ({ path: dirPath }) => {
      try { return fs.readdirSync(dirPath || '.').join('\n'); }
      catch (e) { return `Error: ${e.message}`; }
    },
  },

  // ---- HTTP ----
  httpGet: {
    enabled: () => config.tools.http,
    description: 'Make an HTTP GET request',
    run: async ({ url, headers }) => {
      try {
        const res = await fetch(url, { headers: headers || {} });
        return (await res.text()).slice(0, 4000);
      } catch (e) { return `Error: ${e.message}`; }
    },
  },

  httpPost: {
    enabled: () => config.tools.http,
    description: 'Make an HTTP POST request',
    run: async ({ url, body, headers }) => {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(headers || {}) },
          body: typeof body === 'string' ? body : JSON.stringify(body),
        });
        return (await res.text()).slice(0, 4000);
      } catch (e) { return `Error: ${e.message}`; }
    },
  },

  // ---- Web ----
  webSearch: {
    enabled: () => config.tools.web,
    description: 'Search the web using DuckDuckGo',
    run: async ({ query }) => {
      try {
        const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1`;
        const data = await (await fetch(url)).json();
        const results = (data.RelatedTopics || []).slice(0, 6).map(t => t.Text).filter(Boolean);
        return results.length ? results.join('\n\n') : 'No results found.';
      } catch (e) { return `Error: ${e.message}`; }
    },
  },

  fetchPage: {
    enabled: () => config.tools.web,
    description: 'Fetch and return text content of a web page',
    run: async ({ url }) => {
      try {
        const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        const text = (await res.text()).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        return text.slice(0, 4000);
      } catch (e) { return `Error: ${e.message}`; }
    },
  },

  // ---- Package Manager ----
  installPackage: {
    enabled: () => config.tools.shell,
    description: 'Install an npm package',
    run: ({ package: pkg }) => new Promise((resolve) => {
      exec(`npm install ${pkg} --save 2>&1`, { timeout: 60000 }, (err, stdout, stderr) => {
        resolve(err ? `Error: ${stderr}` : `Installed: ${pkg}\n${stdout.slice(0, 500)}`);
      });
    }),
  },

  // ---- Skill Manager ----
  installSkill: {
    enabled: () => true,
    description: 'Install a skill from URL or create from code',
    run: async ({ name, code, description, url }) => {
      try {
        const skillDir = path.join(SKILLS_DIR, name);
        fs.mkdirSync(skillDir, { recursive: true });

        if (url) {
          // Download skill from URL
          const res = await fetch(url);
          const skillCode = await res.text();
          fs.writeFileSync(path.join(skillDir, 'index.js'), skillCode);
        } else if (code) {
          fs.writeFileSync(path.join(skillDir, 'index.js'), code);
        } else {
          return `Error: provide either code or url`;
        }

        // Write skill metadata
        fs.writeFileSync(path.join(skillDir, 'skill.json'), JSON.stringify({
          name, description: description || name, version: '1.0.0'
        }, null, 2));

        return `✅ Skill "${name}" installed at ${skillDir}`;
      } catch (e) { return `Error: ${e.message}`; }
    },
  },

  listSkills: {
    enabled: () => true,
    description: 'List installed skills',
    run: () => {
      const skills = loadSkills();
      const list = Object.values(skills);
      if (!list.length) return 'No skills installed yet. Use installSkill to add one.';
      return list.map(s => `• ${s.name} — ${s.description}`).join('\n');
    },
  },

  callSkill: {
    enabled: () => true,
    description: 'Call a specific skill by name',
    run: async ({ skill, action, args }) => {
      const skills = loadSkills();
      const s = skills[skill];
      if (!s) return `Skill "${skill}" not found. Use listSkills to see available skills.`;
      if (!s.run) return `Skill "${skill}" has no run() function`;
      try {
        return await s.run({ action, ...args });
      } catch (e) { return `Skill error: ${e.message}`; }
    },
  },

  // ---- Utility ----
  calculator: {
    enabled: () => true,
    description: 'Evaluate a math expression',
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
    description: 'Get current date and time',
    run: ({ timezone }) => {
      const opts = timezone ? { timeZone: timezone } : {};
      return new Date().toLocaleString('en-US', opts);
    },
  },

  runJavaScript: {
    enabled: () => config.tools.code,
    description: 'Execute JavaScript code',
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

  // ---- Memory/Storage ----
  remember: {
    enabled: () => true,
    description: 'Save a key-value to persistent memory',
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
    description: 'Recall a value from persistent memory',
    run: ({ key }) => {
      try {
        const memFile = path.join(__dirname, '..', 'data', 'memory.json');
        if (!fs.existsSync(memFile)) return `Nothing remembered yet.`;
        const mem = JSON.parse(fs.readFileSync(memFile, 'utf8'));
        return key ? (mem[key] ?? `Key "${key}" not found`) : JSON.stringify(mem, null, 2);
      } catch (e) { return `Error: ${e.message}`; }
    },
  },
};

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
    try { args = JSON.parse(argsRaw); }
    catch {
      argsRaw.split(',').forEach(part => {
        const [k, ...v] = part.split('=');
        if (k) args[k.trim().replace(/^["']|["']$/g, '')] = v.join('=').trim().replace(/^["']|["']$/g, '');
      });
    }

    const output = await tool.run(args);
    executed.push({ tool: toolName, args, output });
    result = result.replace(fullMatch, `\`\`\`\n${output}\n\`\`\``);
  }

  return { result, executed };
}

function listTools() {
  return Object.entries(TOOLS)
    .filter(([, t]) => t.enabled())
    .map(([name, t]) => `• ${name} — ${t.description}`)
    .join('\n');
}

module.exports = { TOOLS, executeToolCalls, listTools, loadSkills };
