const { body, validationResult } = require('express-validator');

const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, error: 'Validation failed', details: errors.array() });
  }
  next();
};

const validateCreateBudget = [
  body('projectId')
    .notEmpty().withMessage('projectId is required')
    .isUUID().withMessage('projectId must be a valid UUID'),
  body('total')
    .notEmpty().withMessage('total budget amount is required')
    .isFloat({ min: 0 }).withMessage('total must be a non-negative number'),
  body('currency')
    .optional().trim().isLength({ min: 3, max: 3 }).withMessage('currency must be a 3-letter code (e.g. USD)'),
  handleValidationErrors
];

const validateAddExpense = [
  body('amount')
    .notEmpty().withMessage('amount is required')
    .isFloat({ min: 0.01 }).withMessage('amount must be greater than 0'),
  body('description')
    .trim().notEmpty().withMessage('Expense description is required')
    .isLength({ min: 1, max: 500 }).withMessage('Description must be under 500 characters'),
  body('date')
    .optional().isISO8601().withMessage('date must be a valid ISO 8601 date'),
  handleValidationErrors
];

const validateUpdateBudget = [
  body('name')
    .optional().trim().notEmpty().withMessage('name cannot be empty')
    .isLength({ max: 200 }).withMessage('name must be under 200 characters'),
  body('budgetAmount')
    .optional()
    .isFloat({ min: 0 }).withMessage('budgetAmount must be a non-negative number'),
  body('currency')
    .optional().trim().isLength({ min: 3, max: 3 }).withMessage('currency must be a 3-letter code (e.g. USD)'),
  body('startDate')
    .optional({ nullable: true }).isISO8601().withMessage('startDate must be a valid ISO 8601 date'),
  body('endDate')
    .optional({ nullable: true }).isISO8601().withMessage('endDate must be a valid ISO 8601 date'),
  body('status')
    .optional().isIn(['active', 'closed']).withMessage('status must be active or closed'),
  handleValidationErrors
];

const validateUpdateExpense = [
  body('amount')
    .optional()
    .isFloat({ min: 0.01 }).withMessage('amount must be greater than 0'),
  body('category')
    .optional().isIn(['labor', 'materials', 'equipment', 'travel', 'other'])
    .withMessage('category must be one of: labor, materials, equipment, travel, other'),
  body('description')
    .optional().trim().isLength({ max: 500 }).withMessage('description must be under 500 characters'),
  body('date')
    .optional().isISO8601().withMessage('date must be a valid ISO 8601 date'),
  handleValidationErrors
];

module.exports = {
  validateCreateBudget,
  validateAddExpense,
  validateUpdateBudget,
  validateUpdateExpense,
};
