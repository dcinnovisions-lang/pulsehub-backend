const express = require('express');
const router = express.Router();
const timeTrackingController = require('../controllers/timeTracking.controller');
const { authenticate } = require('../middleware/auth');
const { validateCreateTimeLog, validateUpdateTimeLog } = require('../validators/timeTracking.validator');

// All routes require authentication
router.use(authenticate);

// Time tracking routes
router.get('/statistics', timeTrackingController.getTimeStatistics);
router.get('/', timeTrackingController.getTimeLogs);
router.post('/', validateCreateTimeLog, timeTrackingController.createTimeLog);
router.put('/:id', validateUpdateTimeLog, timeTrackingController.updateTimeLog);
router.delete('/:id', timeTrackingController.deleteTimeLog);

module.exports = router;

