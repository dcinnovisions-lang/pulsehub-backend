const express = require('express');
const router = express.Router();
const activityLogController = require('../controllers/activityLog.controller');
const { authenticate } = require('../middleware/auth');
const { searchLimiter } = require('../middleware/rateLimiter');

// All routes require authentication
router.use(authenticate);

// Export must be registered before the generic GET '/' to avoid conflict
router.get('/export', searchLimiter, activityLogController.exportActivityLogs);

// Activity log routes
router.get('/', activityLogController.getActivityLogs);

module.exports = router;
