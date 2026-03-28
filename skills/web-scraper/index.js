
const fetch = require("node-fetch");

module.exports = {
  run: async ({ url, extract }) => {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; GweiAgent/1.0)" }
      });
      const html = await res.text();
      // Extract links
      if (extract === "links") {
        const links = [...html.matchAll(/href=["'](https?[^"']+)["']/g)].map(m => m[1]).slice(0, 20);
        return links.join("\n");
      }
      // Extract text
      const text = html
        .replace(/<script[\s\S]*?<\/script>/gi, "")
        .replace(/<style[\s\S]*?<\/style>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ").trim();
      return text.slice(0, 4000);
    } catch(e) { return "Error: " + e.message; }
  }
};
