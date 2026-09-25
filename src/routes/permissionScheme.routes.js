const express = require('express');
const router = express.Router();
const { getScheme, putScheme } = require('../controllers/permissionScheme.controller');
const { authenticate } = require('../middleware/auth');
const { checkPermission, checkWorkspacePerm } = require('../middleware/permissions');

// Project scheme: project leads, workspace admins and owners
const manageProject = checkPermission({ resource: 'project', action: 'manage_settings' });
// Workspace scheme (applies to every project unless a project overrides it): workspace admins and owners
const manageWorkspace = checkWorkspacePerm({ action: 'update' });

router.get('/projects/:projectId/permission-scheme', authenticate, manageProject, getScheme);
router.put('/projects/:projectId/permission-scheme', authenticate, manageProject, putScheme);
router.get('/workspaces/:workspaceId/permission-scheme', authenticate, manageWorkspace, getScheme);
router.put('/workspaces/:workspaceId/permission-scheme', authenticate, manageWorkspace, putScheme);

module.exports = router;
