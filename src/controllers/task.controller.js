// Facade - re-export all task controller functions from their respective files
const coreController = require('./task-core.controller');
const subtaskController = require('./task-subtask.controller');
const bulkController = require('./task-bulk.controller');
const csvController = require('./task-csv.controller');

module.exports = {
  ...coreController,
  ...subtaskController,
  ...bulkController,
  ...csvController,
};
