const nodemailer = require('nodemailer');
const logger = require('../utils/logger');
const { getEmailTransporter, buildInviteEmailHtml } = require('./invite-core.controller');

/**
 * Re-export buildInviteEmailHtml from invite-core so the facade can spread it.
 * The function lives in invite-core.controller.js (used by sendInvite) to avoid
 * a circular require if it were defined here.
 */
module.exports = {
  buildInviteEmailHtml,
};
