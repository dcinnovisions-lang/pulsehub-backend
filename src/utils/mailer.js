const nodemailer = require('nodemailer');
const logger = require('./logger');

let transporter = null;

const isConfigured = () => !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);

const getTransporter = () => {
  if (!isConfigured()) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587', 10),
      secure: process.env.SMTP_SECURE === 'true',
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      pool: true,
      maxConnections: 2
    });
  }
  return transporter;
};

const escapeHtml = (s) =>
  String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Sends one email. Never throws: returns true when the mail server accepted the message.
const sendMail = async ({ to, subject, html, text }) => {
  if (process.env.NODE_ENV === 'test') return false;
  const t = getTransporter();
  if (!t || !to) return false;
  try {
    await t.sendMail({
      from: process.env.SMTP_FROM || 'Projva <noreply@projva.dev>',
      to,
      subject,
      html,
      text
    });
    return true;
  } catch (err) {
    logger.warn(`Email to ${to} failed: ${err.message}`);
    return false;
  }
};

// Email body for an in-app notification
const notificationEmail = ({ firstName, title, body, url, actorName }) => {
  const base = (process.env.FRONTEND_URL || '').replace(/\/$/, '');
  const link = url ? `${base}${url.startsWith('/') ? '' : '/'}${url}` : `${base}/app/dashboard`;
  const settings = `${base}/app/settings?tab=notifications`;
  const html = `<!DOCTYPE html>
<html><body style="margin:0;padding:24px;background:#f1f5f9;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0f172a;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center">
    <table role="presentation" width="560" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;">
      <tr><td style="padding:28px 32px 8px;font-size:13px;font-weight:700;letter-spacing:.04em;color:#6366f1;">PROJVA</td></tr>
      <tr><td style="padding:0 32px;">
        <p style="margin:12px 0 4px;font-size:14px;color:#64748b;">Hi ${escapeHtml(firstName || 'there')},</p>
        <h2 style="margin:0 0 12px;font-size:18px;line-height:1.4;">${escapeHtml(title)}</h2>
        ${body ? `<p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#334155;white-space:pre-wrap;">${escapeHtml(body)}</p>` : ''}
        ${actorName ? `<p style="margin:0 0 20px;font-size:12.5px;color:#94a3b8;">From ${escapeHtml(actorName)}</p>` : ''}
        <a href="${escapeHtml(link)}" style="display:inline-block;padding:10px 20px;background:#6366f1;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;border-radius:8px;">Open in Projva</a>
      </td></tr>
      <tr><td style="padding:24px 32px 28px;font-size:12px;color:#94a3b8;">
        You receive this because of your notification settings. <a href="${escapeHtml(settings)}" style="color:#6366f1;">Change preferences</a>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;
  const text = `${title}\n\n${body ? body + '\n\n' : ''}Open: ${link}\n\nChange notification preferences: ${settings}`;
  return { html, text };
};

module.exports = { sendMail, notificationEmail, isConfigured, escapeHtml };
