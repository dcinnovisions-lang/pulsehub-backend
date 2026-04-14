const { body, validationResult } = require('express-validator');

const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, error: 'Validation failed', details: errors.array() });
  }
  next();
};

const validateCreateSavedView = [
  body('name')
    .trim().notEmpty().withMessage('View name is required')
    .isLength({ min: 1, max: 100 }).withMessage('View name must be between 1 and 100 characters'),
  body('projectId')
    .optional().isUUID().withMessage('projectId must be a valid UUID'),
  handleValidationErrors
];

const validateUpdateSavedView = [
  body('name')
    .optional().trim().notEmpty().withMessage('View name cannot be empty')
    .isLength({ min: 1, max: 100 }).withMessage('View name must be between 1 and 100 characters'),
  handleValidationErrors
];

module.exports = {
  validateCreateSavedView,
  validateUpdateSavedView
};
