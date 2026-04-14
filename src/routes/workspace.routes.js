const express = require('express');
const router = express.Router();
const workspaceController = require('../controllers/workspace.controller');

const { authenticate } = require('../middleware/auth');
const { checkWorkspacePerm, requireRole } = require('../middleware/permissions');
const { checkWorkspaceLimit } = require('../middleware/checkPlanLimits');
const { uploadLimiter } = require('../middleware/rateLimiter');
const {
  validateCreateWorkspace, validateUpdateWorkspace,
  validateAddMember, validateUpdateMemberRole,
  validateTransferOwnership, validateHardDelete, validateRestoreWorkspace
} = require('../validators/workspace.validator');

// All routes require authentication
router.use(authenticate);

// Workspace routes
router.get('/', workspaceController.getWorkspaces);
router.post('/', checkWorkspaceLimit, validateCreateWorkspace, workspaceController.createWorkspace);

// Member routes must come before workspace :id routes to avoid conflicts
router.get('/:id/members', checkWorkspacePerm({ action: 'read' }), workspaceController.getWorkspaceMembers);
router.post('/:id/members', checkWorkspacePerm({ action: 'manage_members' }), validateAddMember, workspaceController.addWorkspaceMember);
router.put('/:id/members/:userId', checkWorkspacePerm({ action: 'manage_members' }), validateUpdateMemberRole, workspaceController.updateWorkspaceMemberRole);
router.delete('/:id/members/:userId', checkWorkspacePerm({ action: 'manage_members' }), workspaceController.removeWorkspaceMember);

// Workspace CRUD routes
router.get('/:id', checkWorkspacePerm({ action: 'read' }), workspaceController.getWorkspaceById);
router.put('/:id', checkWorkspacePerm({ action: 'update' }), validateUpdateWorkspace, workspaceController.updateWorkspace);
router.delete('/:id', checkWorkspacePerm({ action: 'delete' }), workspaceController.deleteWorkspace);
// Logo upload
router.post('/:id/logo', checkWorkspacePerm({ action: 'update' }), uploadLimiter, workspaceController.uploadWorkspaceLogo);
// Restore workspace (owner/admin/super_admin — update permission covers this)
router.post('/:id/restore', checkWorkspacePerm({ action: 'update' }), validateRestoreWorkspace, workspaceController.restoreWorkspace);
// Transfer workspace ownership (super_admin or current owner — transfer_ownership action)
router.put('/:id/transfer-ownership', checkWorkspacePerm({ action: 'transfer_ownership' }), validateTransferOwnership, workspaceController.transferWorkspaceOwnership);
// Permanent hard delete (super admin only)
router.post('/:id/hard-delete', requireRole('super_admin'), validateHardDelete, workspaceController.hardDeleteWorkspace);

module.exports = router;


