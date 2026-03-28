
const fetch = require("node-fetch");
module.exports = {
  run: async ({ prompt, model }) => {
    const apiKey = process.env.BLINK_API_KEY;
    if (!apiKey) return "Error: BLINK_API_KEY not set";
    const res = await fetch("https://core.blink.new/api/v1/ai/images/generate", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, model: model || "fal-ai/flux/schnell", n: 1 })
    });
    const data = await res.json();
    if (data.data?.[0]?.url) return `IMAGE:${data.data[0].url}`;
    return "Error: " + JSON.stringify(data).slice(0, 200);
  }
};
