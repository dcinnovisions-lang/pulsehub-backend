const express = require('express');
const router = express.Router();
const { globalSearch } = require('../controllers/search.controller');
const { authenticate } = require('../middleware/auth');
const cache = require('../middleware/cache');
const { searchLimiter } = require('../middleware/rateLimiter');

router.get('/', authenticate, searchLimiter, cache(30), globalSearch);

module.exports = router;
