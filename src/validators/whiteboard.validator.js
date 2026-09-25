const { body, validationResult } = require('express-validator');

const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, error: 'Validation failed', details: errors.array() });
  }
  next();
};

const validateCreateWhiteboard = [
  body('title')
    .trim().notEmpty().withMessage('Whiteboard title is required')
    .isLength({ min: 1, max: 200 }).withMessage('Title must be between 1 and 200 characters'),
  body('workspaceId')
    .optional().isUUID().withMessage('workspaceId must be a valid UUID'),
  body('projectId')
    .optional().isUUID().withMessage('projectId must be a valid UUID'),
  handleValidationErrors
];

const validateUpsertElements = [
  body('elements')
    .isArray().withMessage('elements must be an array')
    .custom((elements) => elements.length <= 500).withMessage('A single save cannot contain more than 500 elements'),
  body('elements.*.type')
    // Matches the enum_whiteboard_elements_type Postgres enum in models/WhiteboardElement.js —
    // an out-of-range value here fails as a raw 500 DB error, not a clean 400, without this check.
    .optional().isIn(['sticky', 'text', 'shape']).withMessage('Element type must be one of: sticky, text, shape'),
  body('elements.*.id')
    .optional().isUUID().withMessage('Element id must be a valid UUID'),
  handleValidationErrors
];

module.exports = {
  validateCreateWhiteboard,
  validateUpsertElements
};
