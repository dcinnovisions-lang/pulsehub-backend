const express = require('express');
const router = express.Router();
const { searchIssues } = require('../controllers/issueSearch.controller');
const { authenticate } = require('../middleware/auth');
const { searchLimiter } = require('../middleware/rateLimiter');

router.get('/search', authenticate, searchLimiter, searchIssues);

module.exports = router;
