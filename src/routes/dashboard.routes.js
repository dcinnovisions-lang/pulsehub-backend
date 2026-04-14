const express = require('express');
const router = express.Router();
const projectHealthController = require('../controllers/projectHealth.controller');
const { authenticate } = require('../middleware/auth');
const cache = require('../middleware/cache');

// All routes require authentication
router.use(authenticate);

// Dashboard routes
router.get('/stakeholder', cache(60), projectHealthController.getStakeholderDashboard);

module.exports = router;

