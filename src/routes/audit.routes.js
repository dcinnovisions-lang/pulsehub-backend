const express = require('express');
const router = express.Router();
const { listAuditLogs, exportAuditLogs, listActions } = require('../controllers/audit.controller');
const { authenticate } = require('../middleware/auth');
const { searchLimiter } = require('../middleware/rateLimiter');

router.get('/actions', authenticate, listActions);
router.get('/export', authenticate, searchLimiter, exportAuditLogs);
router.get('/', authenticate, listAuditLogs);

module.exports = router;
