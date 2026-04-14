const { body, validationResult } = require('express-validator');

const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, error: 'Validation failed', details: errors.array() });
  }
  next();
};

const PRIORITIES = ['low', 'medium', 'high', 'urgent'];

const validateCreateTask = [
  body('title')
    .trim().notEmpty().withMessage('Task title is required')
    .isLength({ min: 1, max: 500 }).withMessage('Task title must be between 1 and 500 characters'),
  body('projectId')
    .notEmpty().withMessage('projectId is required')
    .isUUID().withMessage('projectId must be a valid UUID'),
  body('description')
    .optional().trim().isLength({ max: 10000 }).withMessage('Description must be under 10000 characters'),
  body('priority')
    .optional().isIn(PRIORITIES).withMessage(`priority must be one of: ${PRIORITIES.join(', ')}`),
  body('dueDate')
    .optional().isISO8601().withMessage('dueDate must be a valid ISO 8601 date'),
  body('assigneeId')
    .optional().isUUID().withMessage('assigneeId must be a valid UUID'),
  body('listId')
    .optional().isUUID().withMessage('listId must be a valid UUID'),
  body('statusId')
    .optional().isUUID().withMessage('statusId must be a valid UUID'),
  handleValidationErrors
];

const validateUpdateTask = [
  body('title')
    .optional().trim().notEmpty().withMessage('Task title cannot be empty')
    .isLength({ min: 1, max: 500 }).withMessage('Task title must be between 1 and 500 characters'),
  body('description')
    .optional().trim().isLength({ max: 10000 }).withMessage('Description must be under 10000 characters'),
  body('priority')
    .optional().isIn(PRIORITIES).withMessage(`priority must be one of: ${PRIORITIES.join(', ')}`),
  body('dueDate')
    .optional({ nullable: true }).isISO8601().withMessage('dueDate must be a valid ISO 8601 date'),
  body('assigneeId')
    .optional({ nullable: true }).isUUID().withMessage('assigneeId must be a valid UUID'),
  body('statusId')
    .optional().isUUID().withMessage('statusId must be a valid UUID'),
  handleValidationErrors
];

const validateMoveTask = [
  body('statusId')
    .notEmpty().withMessage('statusId is required')
    .isUUID().withMessage('statusId must be a valid UUID'),
  handleValidationErrors
];

const validateBulkCreate = [
  body('tasks')
    .isArray({ min: 1 }).withMessage('tasks must be a non-empty array'),
  body('tasks.*.title')
    .trim().notEmpty().withMessage('Each task must have a title')
    .isLength({ max: 500 }).withMessage('Task title must be under 500 characters'),
  body('tasks.*.projectId')
    .notEmpty().withMessage('Each task must have a projectId')
    .isUUID().withMessage('Each task projectId must be a valid UUID'),
  handleValidationErrors
];

const validateBulkUpdate = [
  body('taskIds')
    .isArray({ min: 1 }).withMessage('taskIds must be a non-empty array'),
  body('taskIds.*')
    .isUUID().withMessage('Each taskId must be a valid UUID'),
  handleValidationErrors
];

const validateBulkDelete = [
  body('taskIds')
    .isArray({ min: 1 }).withMessage('taskIds must be a non-empty array'),
  body('taskIds.*')
    .isUUID().withMessage('Each taskId must be a valid UUID'),
  handleValidationErrors
];

const validateCreateSubtask = [
  body('title')
    .trim().notEmpty().withMessage('Subtask title is required')
    .isLength({ min: 1, max: 500 }).withMessage('Subtask title must be between 1 and 500 characters'),
  handleValidationErrors
];

const validateUpdateSubtask = [
  body('title')
    .optional().trim().notEmpty().withMessage('Subtask title cannot be empty')
    .isLength({ min: 1, max: 500 }).withMessage('Subtask title must be between 1 and 500 characters'),
  handleValidationErrors
];

module.exports = {
  validateCreateTask,
  validateUpdateTask,
  validateMoveTask,
  validateBulkCreate,
  validateBulkUpdate,
  validateBulkDelete,
  validateCreateSubtask,
  validateUpdateSubtask
};
