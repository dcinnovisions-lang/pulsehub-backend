const core = require('./auth-core.controller');
const twofa = require('./auth-2fa.controller');
const email = require('./auth-email.controller');

module.exports = {
  ...core,
  ...twofa,
  ...email,
};
