const nodemailer = require('nodemailer');
const axios = require('axios');

async function run({ action, to, subject, body, html }) {
  try {
    if (action === 'send') {
      if (!to || !subject || !body) return 'Provide to, subject, and body';

      // SendGrid
      if (process.env.SENDGRID_API_KEY) {
        const from = process.env.EMAIL_FROM || 'noreply@gweiagents.com';
        await axios.post('https://api.sendgrid.com/v3/mail/send', {
          personalizations: [{ to: [{ email: to }] }],
          from: { email: from },
          subject,
          content: [
            { type: 'text/plain', value: body },
            ...(html ? [{ type: 'text/html', value: html }] : [])
          ]
        }, {
          headers: { Authorization: `Bearer ${process.env.SENDGRID_API_KEY}` }
        });
        return `✅ Email sent to ${to} via SendGrid\nSubject: ${subject}`;
      }

      // SMTP via nodemailer
      if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
        const transporter = nodemailer.createTransporter({
          host: process.env.SMTP_HOST,
          port: parseInt(process.env.SMTP_PORT || '587'),
          secure: process.env.SMTP_PORT === '465',
          auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        });
        await transporter.sendMail({
          from: process.env.EMAIL_FROM || process.env.SMTP_USER,
          to, subject,
          text: body,
          ...(html ? { html } : {})
        });
        return `✅ Email sent to ${to} via SMTP\nSubject: ${subject}`;
      }

      return '⚙️ Email not configured. Set either:\n• SENDGRID_API_KEY\n• Or SMTP_HOST + SMTP_PORT + SMTP_USER + SMTP_PASS\n\nOptional: EMAIL_FROM';
    }

    return `Unknown action "${action}". Available: send`;
  } catch (err) {
    return `Email error: ${err.response?.data?.errors?.[0]?.message || err.message}`;
  }
}

module.exports = { run };
