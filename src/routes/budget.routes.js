const express = require('express');
const router = express.Router();
const budgetController = require('../controllers/budget.controller');
const { authenticate } = require('../middleware/auth');
const {
  validateCreateBudget, validateAddExpense,
  validateUpdateBudget, validateUpdateExpense,
} = require('../validators/budget.validator');

// All routes require authentication
router.use(authenticate);

// Budget CRUD
router.get('/',                budgetController.getBudgets);
router.post('/',               validateCreateBudget, budgetController.createBudget);
router.put('/:budgetId',       validateUpdateBudget, budgetController.updateBudget);

// Expense CRUD
router.get('/:budgetId/expenses',                    budgetController.getExpenses);
router.post('/:budgetId/expenses',                   validateAddExpense, budgetController.addExpense);
router.put('/:budgetId/expenses/:expenseId',         validateUpdateExpense, budgetController.updateExpense);
router.delete('/:budgetId/expenses/:expenseId',      budgetController.deleteExpense);

module.exports = router;

