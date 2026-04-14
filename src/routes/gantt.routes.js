const express = require('express');
const router = express.Router();
const ganttController = require('../controllers/gantt.controller');
const { authenticate } = require('../middleware/auth');

// All routes require authentication
router.use(authenticate);

// Gantt routes
router.get('/:projectId', ganttController.getGanttData);

module.exports = router;




