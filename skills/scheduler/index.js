
const cron = require("node-cron");
const fs = require("fs");
const path = require("path");
const JOBS_FILE = path.join(__dirname, "..", "..", "data", "cron-jobs.json");

const activeJobs = {};

function loadJobs() {
  return fs.existsSync(JOBS_FILE) ? JSON.parse(fs.readFileSync(JOBS_FILE, "utf8")) : [];
}

function saveJobs(jobs) {
  fs.mkdirSync(path.dirname(JOBS_FILE), { recursive: true });
  fs.writeFileSync(JOBS_FILE, JSON.stringify(jobs, null, 2));
}

module.exports = {
  run: async ({ action, name, expression, task, chatId }) => {
    switch(action) {
      case "add": {
        if (!cron.validate(expression)) return `Invalid cron: ${expression}`;
        const jobs = loadJobs();
        jobs.push({ name, expression, task, chatId, created: new Date().toISOString() });
        saveJobs(jobs);
        return `✅ Job "${name}" scheduled: ${expression}\nTask: ${task}`;
      }
      case "list": {
        const jobs = loadJobs();
        if (!jobs.length) return "No scheduled jobs.";
        return jobs.map(j => `• *${j.name}*: \`${j.expression}\`\n  ${j.task}`).join("\n\n");
      }
      case "remove": {
        const jobs = loadJobs().filter(j => j.name !== name);
        saveJobs(jobs);
        if (activeJobs[name]) { activeJobs[name].stop(); delete activeJobs[name]; }
        return `🗑 Job "${name}" removed`;
      }
      default:
        return "Actions: add, list, remove";
    }
  }
};
