const { body, validationResult } = require('express-validator');

const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, error: 'Validation failed', details: errors.array() });
  }
  next();
};

const VALID_ROLES = ['super_admin', 'admin', 'pm', 'member', 'viewer'];

const validateUpdateUser = [
  body('firstName')
    .optional().trim().notEmpty().withMessage('First name cannot be empty')
    .isLength({ min: 1, max: 100 }).withMessage('First name must be under 100 characters'),
  body('lastName')
    .optional().trim().notEmpty().withMessage('Last name cannot be empty')
    .isLength({ min: 1, max: 100 }).withMessage('Last name must be under 100 characters'),
  handleValidationErrors
];

const validateUpdateRole = [
  body('role')
    .notEmpty().withMessage('role is required')
    .isIn(VALID_ROLES).withMessage(`role must be one of: ${VALID_ROLES.join(', ')}`),
  handleValidationErrors
];

const validateDeleteAccount = [
  body('password')
    .notEmpty().withMessage('Password is required to delete account'),
  handleValidationErrors
];

module.exports = {
  validateUpdateUser,
  validateUpdateRole,
  validateDeleteAccount
};
