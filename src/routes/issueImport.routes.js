const express = require('express');
const router = express.Router();
const { previewImport, runImport } = require('../controllers/issueImport.controller');
const { authenticate } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permissions');
const { uploadLimiter } = require('../middleware/rateLimiter');

// Importing can create sprints, releases and statuses, so it needs the same right as managing them
const canImport = checkPermission({ resource: 'sprint', action: 'create' });

router.post('/projects/:projectId/import/preview', authenticate, uploadLimiter, canImport, previewImport);
router.post('/projects/:projectId/import', authenticate, uploadLimiter, canImport, runImport);

module.exports = router;
