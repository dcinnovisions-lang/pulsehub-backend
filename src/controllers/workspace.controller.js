const core = require('./workspace-core.controller');
const members = require('./workspace-members.controller');
const deletes = require('./workspace-delete.controller');

module.exports = {
  ...core,
  ...members,
  ...deletes,
};
