const { body, validationResult } = require('express-validator');

const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, error: 'Validation failed', details: errors.array() });
  }
  next();
};

const TRIGGER_TYPES = ['task_created', 'task_updated', 'task_completed', 'due_date_reached', 'status_changed', 'assignee_changed'];
const ACTION_TYPES  = ['assign_user', 'change_status', 'set_priority', 'send_notification', 'add_label'];

const validateCreateAutomation = [
  body('name')
    .trim().notEmpty().withMessage('Automation name is required')
    .isLength({ min: 1, max: 200 }).withMessage('Name must be between 1 and 200 characters'),
  body('workspaceId')
    .notEmpty().withMessage('workspaceId is required')
    .isUUID().withMessage('workspaceId must be a valid UUID'),
  body('trigger.type')
    .notEmpty().withMessage('trigger.type is required')
    .isIn(TRIGGER_TYPES).withMessage(`trigger.type must be one of: ${TRIGGER_TYPES.join(', ')}`),
  body('actions')
    .isArray({ min: 1 }).withMessage('At least one action is required'),
  body('actions.*.type')
    .notEmpty().withMessage('Each action must have a type')
    .isIn(ACTION_TYPES).withMessage(`action.type must be one of: ${ACTION_TYPES.join(', ')}`),
  handleValidationErrors
];

const validateUpdateAutomation = [
  body('name')
    .optional().trim().notEmpty().withMessage('Automation name cannot be empty')
    .isLength({ min: 1, max: 200 }).withMessage('Name must be between 1 and 200 characters'),
  body('trigger.type')
    .optional().isIn(TRIGGER_TYPES).withMessage(`trigger.type must be one of: ${TRIGGER_TYPES.join(', ')}`),
  body('actions')
    .optional().isArray({ min: 1 }).withMessage('actions must be a non-empty array'),
  body('actions.*.type')
    .optional().isIn(ACTION_TYPES).withMessage(`action.type must be one of: ${ACTION_TYPES.join(', ')}`),
  handleValidationErrors
];

module.exports = {
  validateCreateAutomation,
  validateUpdateAutomation
};
