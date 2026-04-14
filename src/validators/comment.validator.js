const { body, validationResult } = require('express-validator');

const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, error: 'Validation failed', details: errors.array() });
  }
  next();
};

const validateCreateComment = [
  body('content')
    .trim().notEmpty().withMessage('Comment content is required')
    .isLength({ min: 1, max: 5000 }).withMessage('Comment must be between 1 and 5000 characters'),
  handleValidationErrors
];

const validateUpdateComment = [
  body('content')
    .trim().notEmpty().withMessage('Comment content is required')
    .isLength({ min: 1, max: 5000 }).withMessage('Comment must be between 1 and 5000 characters'),
  handleValidationErrors
];

const validateReaction = [
  body('emoji')
    .notEmpty().withMessage('emoji is required')
    .isLength({ min: 1, max: 10 }).withMessage('emoji must be under 10 characters'),
  handleValidationErrors
];

module.exports = {
  validateCreateComment,
  validateUpdateComment,
  validateReaction
};
