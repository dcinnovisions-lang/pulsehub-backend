const { body, validationResult } = require('express-validator');

const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, error: 'Validation failed', details: errors.array() });
  }
  next();
};

const RESOURCE_TYPES = ['project', 'workspace', 'document'];

const validateCreateGuestAccess = [
  body('email')
    .isEmail().withMessage('Valid email address is required')
    .normalizeEmail(),
  body('resourceType')
    .notEmpty().withMessage('resourceType is required')
    .isIn(RESOURCE_TYPES).withMessage(`resourceType must be one of: ${RESOURCE_TYPES.join(', ')}`),
  body('resourceId')
    .notEmpty().withMessage('resourceId is required')
    .isUUID().withMessage('resourceId must be a valid UUID'),
  handleValidationErrors
];

module.exports = {
  validateCreateGuestAccess
};
