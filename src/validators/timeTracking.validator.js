const { body, validationResult } = require('express-validator');

const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, error: 'Validation failed', details: errors.array() });
  }
  next();
};

const validateCreateTimeLog = [
  body('taskId')
    .notEmpty().withMessage('taskId is required')
    .isUUID().withMessage('taskId must be a valid UUID'),
  body('hours')
    .optional().isFloat({ min: 0 }).withMessage('hours must be a non-negative number'),
  body('minutes')
    .optional().isInt({ min: 0 }).withMessage('minutes must be a non-negative integer'),
  body('description')
    .optional().trim().isLength({ max: 500 }).withMessage('description must be under 500 characters'),
  body('date')
    .optional().isISO8601().withMessage('date must be a valid ISO 8601 date'),
  body('isBillable')
    .optional().isBoolean().withMessage('isBillable must be a boolean'),
  handleValidationErrors
];

const validateUpdateTimeLog = [
  body('hours')
    .optional().isFloat({ min: 0 }).withMessage('hours must be a non-negative number'),
  body('minutes')
    .optional().isInt({ min: 0 }).withMessage('minutes must be a non-negative integer'),
  body('description')
    .optional().trim().isLength({ max: 500 }).withMessage('description must be under 500 characters'),
  body('date')
    .optional().isISO8601().withMessage('date must be a valid ISO 8601 date'),
  body('isBillable')
    .optional().isBoolean().withMessage('isBillable must be a boolean'),
  handleValidationErrors
];

module.exports = {
  validateCreateTimeLog,
  validateUpdateTimeLog
};
