const express = require('express');
const router = express.Router();
const apiKeyController = require('../controllers/apiKey.controller');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

router.get('/', apiKeyController.listApiKeys);
router.post('/', apiKeyController.createApiKey);
router.delete('/:id', apiKeyController.revokeApiKey);

module.exports = router;
