const express = require('express');
const router = express.Router();
const calendarController = require('../controllers/calendar.controller');
const { authenticate } = require('../middleware/auth');

// All routes require authentication
router.use(authenticate);

// Calendar routes
router.get('/', calendarController.getCalendarData);

module.exports = router;

