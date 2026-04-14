const inviteCore = require('./invite-core.controller');
const inviteEmail = require('./invite-email.controller');
const invitePermissions = require('./invite-permissions.controller');

module.exports = {
  ...inviteCore,
  ...inviteEmail,
  ...invitePermissions,
};
