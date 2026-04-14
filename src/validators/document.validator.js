const { body, validationResult } = require('express-validator');

const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, error: 'Validation failed', details: errors.array() });
  }
  next();
};

const validateCreateDocument = [
  body('title')
    .trim().notEmpty().withMessage('Document title is required')
    .isLength({ min: 1, max: 200 }).withMessage('Title must be between 1 and 200 characters'),
  body('contentType')
    .optional().isIn(['html', 'markdown']).withMessage('contentType must be html or markdown'),
  body('workspaceId')
    .optional().isUUID().withMessage('workspaceId must be a valid UUID'),
  body('projectId')
    .optional().isUUID().withMessage('projectId must be a valid UUID'),
  handleValidationErrors
];

const validateUpdateDocument = [
  body('title')
    .optional().trim().notEmpty().withMessage('Document title cannot be empty')
    .isLength({ min: 1, max: 200 }).withMessage('Title must be between 1 and 200 characters'),
  body('contentType')
    .optional().isIn(['html', 'markdown']).withMessage('contentType must be html or markdown'),
  handleValidationErrors
];

module.exports = {
  validateCreateDocument,
  validateUpdateDocument
};
