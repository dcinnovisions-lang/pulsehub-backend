const { body, validationResult } = require('express-validator');

const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, error: 'Validation failed', details: errors.array() });
  }
  next();
};

const validateCreateRoom = [
  body('name')
    .trim().notEmpty().withMessage('Room name is required')
    .isLength({ min: 1, max: 100 }).withMessage('Room name must be between 1 and 100 characters'),
  body('workspaceId')
    .notEmpty().withMessage('workspaceId is required')
    .isUUID().withMessage('workspaceId must be a valid UUID'),
  handleValidationErrors
];

const validatePostMessage = [
  body('content')
    .trim().notEmpty().withMessage('Message content is required')
    .isLength({ min: 1, max: 10000 }).withMessage('Message must be between 1 and 10000 characters'),
  handleValidationErrors
];

const validateEditMessage = [
  body('content')
    .trim().notEmpty().withMessage('Message content is required')
    .isLength({ min: 1, max: 10000 }).withMessage('Message must be between 1 and 10000 characters'),
  handleValidationErrors
];

const validateChatReaction = [
  body('emoji')
    .notEmpty().withMessage('emoji is required')
    .isLength({ min: 1, max: 10 }).withMessage('emoji must be under 10 characters'),
  handleValidationErrors
];

module.exports = {
  validateCreateRoom,
  validatePostMessage,
  validateEditMessage,
  validateChatReaction
};
