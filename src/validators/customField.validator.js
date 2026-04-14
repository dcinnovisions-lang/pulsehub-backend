const { body, validationResult } = require('express-validator');

const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, error: 'Validation failed', details: errors.array() });
  }
  next();
};

const FIELD_TYPES = ['text', 'number', 'date', 'dropdown', 'checkbox', 'url', 'email'];

const validateCreateCustomField = [
  body('name')
    .trim().notEmpty().withMessage('Custom field name is required')
    .isLength({ min: 1, max: 100 }).withMessage('Name must be between 1 and 100 characters'),
  body('fieldType')
    .notEmpty().withMessage('fieldType is required')
    .isIn(FIELD_TYPES).withMessage(`fieldType must be one of: ${FIELD_TYPES.join(', ')}`),
  handleValidationErrors
];

const validateUpdateCustomField = [
  body('name')
    .optional().trim().notEmpty().withMessage('Custom field name cannot be empty')
    .isLength({ min: 1, max: 100 }).withMessage('Name must be between 1 and 100 characters'),
  handleValidationErrors
];

module.exports = {
  validateCreateCustomField,
  validateUpdateCustomField
};
