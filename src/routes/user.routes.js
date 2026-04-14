const express = require('express');
const router = express.Router();
const userController = require('../controllers/user.controller');
const workspaceController = require('../controllers/workspace.controller');
const { authenticate, authorize } = require('../middleware/auth');
const { requireRole } = require('../middleware/permissions');
const { uploadLimiter } = require('../middleware/rateLimiter');
const { validateUpdateUser, validateUpdateRole, validateDeleteAccount } = require('../validators/user.validator');

// All routes require authentication
router.use(authenticate);

// Search users
router.get('/search', workspaceController.searchUsers);

// Current user — avatar upload and account deletion
router.post('/me/avatar', uploadLimiter, userController.uploadAvatar);
router.delete('/me', validateDeleteAccount, userController.deleteAccount);

// Get all users (Super Admin/Admin/PM only)
router.get('/', authorize('super_admin', 'admin', 'pm'), userController.getAllUsers);

// Get user by ID
router.get('/:id', userController.getUserById);

// Update user profile
router.put('/:id', validateUpdateUser, userController.updateUser);

// Update user role (Super Admin only)
router.put('/:id/role', requireRole('super_admin'), validateUpdateRole, userController.updateUserRole);

// Delete user (Super Admin/Admin only)
router.delete('/:id', authorize('super_admin', 'admin'), userController.deleteUser);

module.exports = router;


