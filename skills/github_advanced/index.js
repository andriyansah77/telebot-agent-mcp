const axios = require('axios');

function gh(path, method = 'GET', body) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error('MISSING_ENV');
  return axios({ method, url: `https://api.github.com${path}`, data: body,
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' }
  }).then(r => r.data);
}

async function run({ action, repo, state = 'open', title, body, head, base, path: filePath, content, message, branch = 'main', inputs, workflow }) {
  try {
    if (action === 'repos') {
      const data = await gh('/user/repos?sort=updated&per_page=15');
      const lines = data.map(r => `📦 ${r.full_name}\n   ⭐ ${r.stargazers_count} · 🍴 ${r.forks_count} · ${r.language || '—'}\n   ${r.description || ''}`);
      return `📦 Your Repositories:\n\n` + lines.join('\n\n');
    }

    if (action === 'issues') {
      if (!repo) return 'Provide repo (owner/repo)';
      const data = await gh(`/repos/${repo}/issues?state=${state}&per_page=10`);
      if (!data.length) return `No ${state} issues in ${repo}.`;
      const lines = data.map(i => `#${i.number} ${i.title}\n   ${i.state} · ${i.user.login} · ${new Date(i.created_at).toLocaleDateString('id-ID')}`);
      return `🐛 Issues (${repo}):\n\n` + lines.join('\n\n');
    }

    if (action === 'create_issue') {
      if (!repo || !title) return 'Provide repo and title';
      const data = await gh(`/repos/${repo}/issues`, 'POST', { title, body: body || '' });
      return `✅ Issue created: #${data.number} ${data.title}\n🔗 ${data.html_url}`;
    }

    if (action === 'prs') {
      if (!repo) return 'Provide repo (owner/repo)';
      const data = await gh(`/repos/${repo}/pulls?state=${state}&per_page=10`);
      if (!data.length) return `No ${state} PRs in ${repo}.`;
      const lines = data.map(p => `#${p.number} ${p.title}\n   ${p.user.login} · ${p.head.ref} → ${p.base.ref}`);
      return `🔀 Pull Requests (${repo}):\n\n` + lines.join('\n\n');
    }

    if (action === 'create_pr') {
      if (!repo || !title || !head || !base) return 'Provide repo, title, head branch, base branch';
      const data = await gh(`/repos/${repo}/pulls`, 'POST', { title, body: body || '', head, base });
      return `✅ PR created: #${data.number} ${data.title}\n🔗 ${data.html_url}`;
    }

    if (action === 'file_read') {
      if (!repo || !filePath) return 'Provide repo and path';
      const data = await gh(`/repos/${repo}/contents/${filePath}${branch ? '?ref=' + branch : ''}`);
      const decoded = Buffer.from(data.content, 'base64').toString('utf8');
      return `📄 ${repo}/${filePath}\n\`\`\`\n${decoded.slice(0, 3000)}\n\`\`\``;
    }

    if (action === 'file_write') {
      if (!repo || !filePath || !content || !message) return 'Provide repo, path, content, and commit message';
      let sha;
      try {
        const existing = await gh(`/repos/${repo}/contents/${filePath}?ref=${branch}`);
        sha = existing.sha;
      } catch {}
      const encoded = Buffer.from(content).toString('base64');
      const body2 = { message, content: encoded, branch };
      if (sha) body2.sha = sha;
      const data = await gh(`/repos/${repo}/contents/${filePath}`, 'PUT', body2);
      return `✅ File ${sha ? 'updated' : 'created'}: ${filePath}\nCommit: ${data.commit.sha.slice(0, 7)} — ${message}`;
    }

    return `Unknown action "${action}". Available: repos, issues, create_issue, prs, create_pr, file_read, file_write`;
  } catch (err) {
    if (err.message === 'MISSING_ENV') return '⚙️ Set GITHUB_TOKEN env var';
    return `GitHub error: ${err.response?.data?.message || err.message}`;
  }
}

module.exports = { run };
