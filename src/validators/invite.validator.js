const { body, validationResult } = require('express-validator');

const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, error: 'Validation failed', details: errors.array() });
  }
  next();
};

const INVITE_ROLES = ['admin', 'pm', 'member', 'viewer'];

const validateSendInvite = [
  body('email')
    .isEmail().withMessage('Valid email address is required')
    .normalizeEmail(),
  body('workspaceId')
    .optional().isUUID().withMessage('workspaceId must be a valid UUID'),
  body('projectId')
    .optional().isUUID().withMessage('projectId must be a valid UUID'),
  body('role')
    .optional().isIn(INVITE_ROLES).withMessage(`role must be one of: ${INVITE_ROLES.join(', ')}`),
  handleValidationErrors
];

module.exports = {
  validateSendInvite
};
