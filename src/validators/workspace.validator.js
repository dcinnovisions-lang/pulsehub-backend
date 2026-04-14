const { body, validationResult } = require('express-validator');

const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, error: 'Validation failed', details: errors.array() });
  }
  next();
};

const WORKSPACE_ROLES = ['owner', 'admin', 'billing_admin', 'pm', 'member', 'commenter', 'viewer', 'guest'];

const validateCreateWorkspace = [
  body('name')
    .trim().notEmpty().withMessage('Workspace name is required')
    .isLength({ min: 2, max: 100 }).withMessage('Workspace name must be between 2 and 100 characters'),
  body('description')
    .optional().trim().isLength({ max: 500 }).withMessage('Description must be under 500 characters'),
  handleValidationErrors
];

const validateUpdateWorkspace = [
  body('name')
    .optional().trim().notEmpty().withMessage('Workspace name cannot be empty')
    .isLength({ min: 2, max: 100 }).withMessage('Workspace name must be between 2 and 100 characters'),
  body('description')
    .optional().trim().isLength({ max: 500 }).withMessage('Description must be under 500 characters'),
  handleValidationErrors
];

const validateAddMember = [
  body('email')
    .notEmpty().withMessage('email is required')
    .isEmail().withMessage('email must be a valid email address')
    .normalizeEmail(),
  body('role')
    .optional()
    .isIn(WORKSPACE_ROLES).withMessage(`role must be one of: ${WORKSPACE_ROLES.join(', ')}`),
  handleValidationErrors
];

const validateUpdateMemberRole = [
  body('role')
    .notEmpty().withMessage('role is required')
    .isIn(WORKSPACE_ROLES).withMessage(`role must be one of: ${WORKSPACE_ROLES.join(', ')}`),
  handleValidationErrors
];

const validateTransferOwnership = [
  body('newOwnerId')
    .notEmpty().withMessage('newOwnerId is required')
    .isUUID().withMessage('newOwnerId must be a valid UUID'),
  handleValidationErrors
];

const validateHardDelete = [
  body('confirmName')
    .notEmpty().withMessage('confirmName is required'),
  body('reason')
    .trim().notEmpty().withMessage('Deletion reason is required')
    .isLength({ min: 5 }).withMessage('Deletion reason must be at least 5 characters'),
  handleValidationErrors
];

const validateRestoreWorkspace = [
  body('reason')
    .optional().trim().isLength({ min: 3 }).withMessage('Restore reason must be at least 3 characters'),
  handleValidationErrors
];

module.exports = {
  validateCreateWorkspace,
  validateUpdateWorkspace,
  validateAddMember,
  validateUpdateMemberRole,
  validateTransferOwnership,
  validateHardDelete,
  validateRestoreWorkspace
};
