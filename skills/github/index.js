
const fetch = require("node-fetch");
const BASE = "https://api.github.com";

async function gh(path, method="GET", body=null) {
  const token = process.env.GITHUB_TOKEN;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      "Authorization": token ? `token ${token}` : "",
      "Accept": "application/vnd.github.v3+json",
      "Content-Type": "application/json"
    },
    body: body ? JSON.stringify(body) : undefined
  });
  return res.json();
}

module.exports = {
  run: async ({ action, owner, repo, title, body, number, query }) => {
    switch(action) {
      case "list-repos": {
        const data = await gh("/user/repos?sort=updated&per_page=10");
        return data.map(r => `• ${r.full_name} — ${r.description || "no desc"}`).join("\n");
      }
      case "list-issues": {
        const data = await gh(`/repos/${owner}/${repo}/issues?state=open&per_page=10`);
        return data.map(i => `#${i.number} ${i.title}`).join("\n");
      }
      case "create-issue": {
        const data = await gh(`/repos/${owner}/${repo}/issues`, "POST", { title, body });
        return `Created issue #${data.number}: ${data.html_url}`;
      }
      case "search": {
        const data = await gh(`/search/repositories?q=${encodeURIComponent(query)}&per_page=5`);
        return data.items?.map(r => `• ${r.full_name} ⭐${r.stargazers_count}`).join("\n") || "No results";
      }
      case "get-file": {
        const data = await gh(`/repos/${owner}/${repo}/contents/${body}`);
        return data.content ? Buffer.from(data.content, "base64").toString("utf8").slice(0, 3000) : JSON.stringify(data).slice(0,200);
      }
      default:
        return "Actions: list-repos, list-issues, create-issue, search, get-file";
    }
  }
};
