const { body, validationResult } = require('express-validator');

const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, error: 'Validation failed', details: errors.array() });
  }
  next();
};

const PROJECT_ROLES = ['project_lead', 'developer', 'designer', 'qa', 'viewer'];

const validateCreateProject = [
  body('name')
    .trim().notEmpty().withMessage('Project name is required')
    .isLength({ min: 1, max: 200 }).withMessage('Project name must be between 1 and 200 characters'),
  body('workspaceId')
    .notEmpty().withMessage('workspaceId is required')
    .isUUID().withMessage('workspaceId must be a valid UUID'),
  body('description')
    .optional().trim().isLength({ max: 1000 }).withMessage('Description must be under 1000 characters'),
  body('color')
    .optional()
    .matches(/^#[0-9A-Fa-f]{6}$/).withMessage('color must be a valid hex color (e.g. #3B82F6)'),
  handleValidationErrors
];

const validateUpdateProject = [
  body('name')
    .optional().trim().notEmpty().withMessage('Project name cannot be empty')
    .isLength({ min: 1, max: 200 }).withMessage('Project name must be between 1 and 200 characters'),
  body('description')
    .optional().trim().isLength({ max: 1000 }).withMessage('Description must be under 1000 characters'),
  body('status')
    .optional().isIn(['active', 'archived', 'on_hold']).withMessage('status must be active, archived, or on_hold'),
  body('color')
    .optional()
    .matches(/^#[0-9A-Fa-f]{6}$/).withMessage('color must be a valid hex color (e.g. #3B82F6)'),
  handleValidationErrors
];

const validateProjectFromTemplate = [
  body('templateId')
    .notEmpty().withMessage('templateId is required')
    .isUUID().withMessage('templateId must be a valid UUID'),
  body('workspaceId')
    .notEmpty().withMessage('workspaceId is required')
    .isUUID().withMessage('workspaceId must be a valid UUID'),
  body('name')
    .trim().notEmpty().withMessage('Project name is required')
    .isLength({ min: 1, max: 200 }).withMessage('Project name must be between 1 and 200 characters'),
  handleValidationErrors
];

const validateAddProjectMember = [
  body('userId')
    .notEmpty().withMessage('userId is required')
    .isUUID().withMessage('userId must be a valid UUID'),
  body('role')
    .optional()
    .isIn(PROJECT_ROLES).withMessage(`role must be one of: ${PROJECT_ROLES.join(', ')}`),
  handleValidationErrors
];

const validateUpdateProjectMemberRole = [
  body('role')
    .notEmpty().withMessage('role is required')
    .isIn(PROJECT_ROLES).withMessage(`role must be one of: ${PROJECT_ROLES.join(', ')}`),
  handleValidationErrors
];

module.exports = {
  validateCreateProject,
  validateUpdateProject,
  validateProjectFromTemplate,
  validateAddProjectMember,
  validateUpdateProjectMemberRole
};
