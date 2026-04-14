const { body, validationResult } = require('express-validator');

const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, error: 'Validation failed', details: errors.array() });
  }
  next();
};

const validateCreateStatus = [
  body('name')
    .trim().notEmpty().withMessage('Status name is required')
    .isLength({ min: 1, max: 50 }).withMessage('Status name must be between 1 and 50 characters'),
  body('color')
    .optional()
    .matches(/^#[0-9A-Fa-f]{6}$/).withMessage('color must be a valid hex color (e.g. #3B82F6)'),
  body('position')
    .optional().isInt({ min: 0 }).withMessage('position must be a non-negative integer'),
  handleValidationErrors
];

const validateUpdateStatus = [
  body('name')
    .optional().trim().notEmpty().withMessage('Status name cannot be empty')
    .isLength({ min: 1, max: 50 }).withMessage('Status name must be between 1 and 50 characters'),
  body('color')
    .optional()
    .matches(/^#[0-9A-Fa-f]{6}$/).withMessage('color must be a valid hex color (e.g. #3B82F6)'),
  body('position')
    .optional().isInt({ min: 0 }).withMessage('position must be a non-negative integer'),
  handleValidationErrors
];

module.exports = {
  validateCreateStatus,
  validateUpdateStatus
};
