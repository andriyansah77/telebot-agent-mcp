const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const config = require('./config');

/**
 * MCP-style tools the agent can call via [CALL: toolName(args)]
 */

const TOOLS = {
  // ---- Shell ----
  executeCommand: {
    enabled: () => config.tools.shell,
    description: 'Execute a shell command',
    run: ({ command }) => new Promise((resolve) => {
      exec(command, { timeout: 15000, shell: '/bin/sh' }, (err, stdout, stderr) => {
        resolve(err ? `Error: ${stderr || err.message}` : stdout || '(no output)');
      });
    }),
  },

  // ---- File ----
  readFile: {
    enabled: () => config.tools.file,
    description: 'Read a file',
    run: ({ path: filePath }) => {
      try {
        return fs.readFileSync(filePath, 'utf8');
      } catch (e) {
        return `Error: ${e.message}`;
      }
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
      } catch (e) {
        return `Error: ${e.message}`;
      }
    },
  },

  appendFile: {
    enabled: () => config.tools.file,
    description: 'Append content to a file',
    run: ({ path: filePath, content }) => {
      try {
        fs.appendFileSync(filePath, content, 'utf8');
        return `Appended to ${filePath}`;
      } catch (e) {
        return `Error: ${e.message}`;
      }
    },
  },

  deleteFile: {
    enabled: () => config.tools.file,
    description: 'Delete a file',
    run: ({ path: filePath }) => {
      try {
        fs.unlinkSync(filePath);
        return `Deleted: ${filePath}`;
      } catch (e) {
        return `Error: ${e.message}`;
      }
    },
  },

  listDirectory: {
    enabled: () => config.tools.file,
    description: 'List directory contents',
    run: ({ path: dirPath }) => {
      try {
        const items = fs.readdirSync(dirPath || '.');
        return items.join('\n');
      } catch (e) {
        return `Error: ${e.message}`;
      }
    },
  },

  // ---- HTTP ----
  httpGet: {
    enabled: () => config.tools.http,
    description: 'Make an HTTP GET request',
    run: async ({ url, headers }) => {
      try {
        const res = await fetch(url, { headers: headers || {} });
        const text = await res.text();
        return text.slice(0, 3000);
      } catch (e) {
        return `Error: ${e.message}`;
      }
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
        const text = await res.text();
        return text.slice(0, 3000);
      } catch (e) {
        return `Error: ${e.message}`;
      }
    },
  },

  // ---- Web ----
  webSearch: {
    enabled: () => config.tools.web,
    description: 'Search the web using DuckDuckGo',
    run: async ({ query }) => {
      try {
        const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1`;
        const res = await fetch(url);
        const data = await res.json();
        const results = (data.RelatedTopics || []).slice(0, 5).map(t => t.Text).filter(Boolean);
        return results.length ? results.join('\n\n') : 'No results found.';
      } catch (e) {
        return `Error: ${e.message}`;
      }
    },
  },

  fetchPage: {
    enabled: () => config.tools.web,
    description: 'Fetch and return text content of a web page',
    run: async ({ url }) => {
      try {
        const res = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AgentBot/1.0)' }
        });
        const html = await res.text();
        // Strip HTML tags
        const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        return text.slice(0, 3000);
      } catch (e) {
        return `Error: ${e.message}`;
      }
    },
  },

  // ---- Utility ----
  calculator: {
    enabled: () => true,
    description: 'Evaluate a math expression',
    run: ({ expression }) => {
      try {
        // Safe eval for math only
        const sanitized = expression.replace(/[^0-9+\-*/().% ]/g, '');
        // eslint-disable-next-line no-new-func
        const result = Function(`"use strict"; return (${sanitized})`)();
        return `${expression} = ${result}`;
      } catch (e) {
        return `Error: ${e.message}`;
      }
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
        const fakeConsole = { log: (...a) => logs.push(a.join(' ')), error: (...a) => logs.push('ERR: ' + a.join(' ')) };
        // eslint-disable-next-line no-new-func
        const fn = new Function('console', code);
        const result = fn(fakeConsole);
        return [...logs, result !== undefined ? `=> ${result}` : ''].filter(Boolean).join('\n') || '(no output)';
      } catch (e) {
        return `Error: ${e.message}`;
      }
    },
  },
};

/**
 * Parse and execute tool calls from AI response
 * Format: [CALL: toolName({"key": "value"})]
 */
async function executeToolCalls(text) {
  const pattern = /\[CALL:\s*(\w+)\((\{.*?\}|\{[\s\S]*?\}|[^)]*)\)\]/g;
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
    try {
      args = JSON.parse(argsRaw);
    } catch {
      // Try key=value parsing
      argsRaw.split(',').forEach(part => {
        const [k, ...v] = part.split('=');
        if (k) args[k.trim().replace(/^["']|["']$/g, '')] = v.join('=').trim().replace(/^["']|["']$/g, '');
      });
    }

    const output = await (tool.run(args));
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

module.exports = { TOOLS, executeToolCalls, listTools };
