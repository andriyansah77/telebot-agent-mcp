
const fetch = require("node-fetch");

async function blinkAPI(endpoint, body) {
  const res = await fetch(`https://core.blink.new/api/v1/ai/${endpoint}`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.BLINK_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });
  return res.json();
}

module.exports = {
  run: async ({ action, prompt, model, text, voice }) => {
    switch(action) {
      case "image": {
        const data = await blinkAPI("images/generate", {
          prompt, model: model || "fal-ai/flux/schnell", n: 1
        });
        return data.data?.[0]?.url ? `IMAGE:${data.data[0].url}` : "Error: " + JSON.stringify(data).slice(0,200);
      }
      case "speech": {
        const data = await blinkAPI("audio/speech", {
          model: "tts-1", input: text || prompt,
          voice: voice || "alloy"
        });
        return data.url ? `AUDIO:${data.url}` : "Error: " + JSON.stringify(data).slice(0,200);
      }
      case "chat": {
        const data = await blinkAPI("chat/completions", {
          model: model || "anthropic/claude-sonnet-4-5",
          messages: [{ role: "user", content: prompt }]
        });
        return data.choices?.[0]?.message?.content || "Error: " + JSON.stringify(data).slice(0,200);
      }
      default:
        return "Actions: image, speech, chat";
    }
  }
};
