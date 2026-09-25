const express = require('express');
const router = express.Router();
const sso = require('../controllers/sso.controller');
const { authenticate } = require('../middleware/auth');
const { checkWorkspacePerm } = require('../middleware/permissions');
const { authLimiter } = require('../middleware/rateLimiter');

// Public sign-in flow
router.post('/auth/sso/start', authLimiter, sso.start);
router.get('/auth/sso/callback', sso.callback);

// Workspace admins configure it
const manage = checkWorkspacePerm({ action: 'update' });
router.get('/workspaces/:workspaceId/sso', authenticate, manage, sso.getConfig);
router.put('/workspaces/:workspaceId/sso', authenticate, manage, sso.putConfig);
router.post('/workspaces/:workspaceId/sso/test', authenticate, manage, sso.testConfig);

module.exports = router;
