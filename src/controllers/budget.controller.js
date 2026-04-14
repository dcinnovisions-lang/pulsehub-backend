const { Budget, BudgetExpense, Project, Task, User, WorkspaceMembers } = require('../models');
const { Op } = require('sequelize');
const logger = require('../utils/logger');

/**
 * @desc    Get budgets for a project
 * @route   GET /api/v1/budgets
 * @access  Private
 */
const getBudgets = async (req, res, next) => {
  try {
    const { projectId } = req.query;
    const userId = req.user.id;
    const userRole = req.user.role;

    const whereClause = {};

    if (userRole !== 'super_admin') {
      // Scope to workspaces the user is a member of or owns
      const memberships = await WorkspaceMembers.findAll({
        where: { userId },
        attributes: ['workspaceId']
      });
      const { Workspace } = require('../models');
      const ownedWorkspaces = await Workspace.findAll({
        where: { ownerId: userId },
        attributes: ['id']
      });
      const accessibleWorkspaceIds = [
        ...new Set([
          ...memberships.map(m => m.workspaceId),
          ...ownedWorkspaces.map(w => w.id)
        ])
      ];

      if (projectId) {
        // Verify the requested project is in an accessible workspace
        const project = await Project.findByPk(projectId, { attributes: ['id', 'workspaceId'] });
        if (!project || !accessibleWorkspaceIds.includes(project.workspaceId)) {
          return res.status(403).json({ success: false, error: 'Access denied' });
        }
        whereClause.projectId = projectId;
      } else {
        // Limit to accessible projects
        const accessibleProjects = await Project.findAll({
          where: { workspaceId: { [Op.in]: accessibleWorkspaceIds } },
          attributes: ['id']
        });
        whereClause.projectId = { [Op.in]: accessibleProjects.map(p => p.id) };
      }
    } else if (projectId) {
      whereClause.projectId = projectId;
    }

    const budgets = await Budget.findAll({
      where: whereClause,
      include: [
        {
          model: Project,
          as: 'project',
          attributes: ['id', 'name']
        },
        {
          model: BudgetExpense,
          as: 'expenses',
          attributes: ['id', 'amount', 'category', 'date'],
          required: false
        }
      ],
      order: [['createdAt', 'DESC']]
    });

    // Calculate spent amount from expenses
    const budgetsWithSpent = budgets.map(budget => {
      const spent = budget.expenses?.reduce((sum, exp) => sum + parseFloat(exp.amount || 0), 0) || 0;
      const remaining = parseFloat(budget.budgetAmount) - spent;
      const percentage = parseFloat(budget.budgetAmount) > 0 
        ? (spent / parseFloat(budget.budgetAmount)) * 100 
        : 0;

      return {
        ...budget.toJSON(),
        spentAmount: spent,
        remainingAmount: remaining,
        spentPercentage: Math.round(percentage),
        isExceeded: spent > parseFloat(budget.budgetAmount)
      };
    });

    res.status(200).json({
      success: true,
      count: budgetsWithSpent.length,
      data: budgetsWithSpent
    });
  } catch (error) {
    logger.error('Get budgets error:', error);
    next(error);
  }
};

/**
 * @desc    Create budget
 * @route   POST /api/v1/budgets
 * @access  Private (Admin/PM only)
 */
const createBudget = async (req, res, next) => {
  try {
    const { projectId, name, budgetAmount, currency, startDate, endDate } = req.body;
    const userId = req.user.id;
    const userRole = req.user.role;

    if (!projectId || !name || !budgetAmount) {
      return res.status(400).json({
        success: false,
        error: 'projectId, name, and budgetAmount are required'
      });
    }

    // Verify project exists first
    const project = await Project.findByPk(projectId);
    if (!project) {
      return res.status(404).json({
        success: false,
        error: 'Project not found'
      });
    }

    // Check permission: Only super_admin, admin, owner, pm can create budgets
    if (!['super_admin', 'admin', 'owner', 'pm'].includes(userRole)) {
      // Check if user has access to the project's workspace
      const { Workspace, WorkspaceMembers } = require('../models');
      const workspace = await Workspace.findByPk(project.workspaceId);
      
      if (!workspace) {
        return res.status(404).json({
          success: false,
          error: 'Workspace not found'
        });
      }
      
      if (workspace.ownerId !== userId) {
        const member = await WorkspaceMembers.findOne({
          where: { workspaceId: workspace.id, userId }
        });
        
        if (!member || !['owner', 'admin', 'pm'].includes(member.role)) {
          return res.status(403).json({
            success: false,
            error: 'You do not have permission to create budgets for this project'
          });
        }
      }
    }

    const budget = await Budget.create({
      projectId,
      name,
      budgetAmount,
      currency: currency || 'USD',
      startDate,
      endDate,
      status: 'active'
    });

    res.status(201).json({
      success: true,
      data: budget
    });
  } catch (error) {
    logger.error('Create budget error:', error);
    next(error);
  }
};

/**
 * @desc    Add expense to budget
 * @route   POST /api/v1/budgets/:budgetId/expenses
 * @access  Private
 */
const addExpense = async (req, res, next) => {
  try {
    const { budgetId } = req.params;
    const { taskId, category, description, amount, date } = req.body;
    const userId = req.user.id;

    if (!category || !amount) {
      return res.status(400).json({
        success: false,
        error: 'category and amount are required'
      });
    }

    const budget = await Budget.findByPk(budgetId);
    if (!budget) {
      return res.status(404).json({
        success: false,
        error: 'Budget not found'
      });
    }

    // Check permission: Only super_admin, admin, owner, pm can add expenses
    const userRole = req.user.role;
    if (!['super_admin', 'admin', 'owner', 'pm'].includes(userRole)) {
      // Check if user has access to the budget's project
      const project = await Project.findByPk(budget.projectId);
      if (!project) {
        return res.status(404).json({
          success: false,
          error: 'Project not found'
        });
      }

      const { Workspace, WorkspaceMembers } = require('../models');
      const workspace = await Workspace.findByPk(project.workspaceId);
      
      if (workspace.ownerId !== userId) {
        const member = await WorkspaceMembers.findOne({
          where: { workspaceId: workspace.id, userId }
        });
        
        if (!member || !['owner', 'admin', 'pm'].includes(member.role)) {
          return res.status(403).json({
            success: false,
            error: 'You do not have permission to add expenses to this budget'
          });
        }
      }
    }

    const expense = await BudgetExpense.create({
      budgetId,
      taskId,
      category,
      description,
      amount,
      date: date || new Date(),
      userId
    });

    // Update budget spent amount
    const totalSpent = await BudgetExpense.sum('amount', {
      where: { budgetId }
    });

    const newSpentAmount = parseFloat(totalSpent || 0);
    const budgetAmount = parseFloat(budget.budgetAmount);
    
    let status = budget.status;
    if (newSpentAmount > budgetAmount && status !== 'exceeded') {
      status = 'exceeded';
    } else if (newSpentAmount <= budgetAmount && status === 'exceeded') {
      status = 'active';
    }

    await budget.update({
      spentAmount: newSpentAmount,
      status
    });

    res.status(201).json({
      success: true,
      data: expense
    });
  } catch (error) {
    logger.error('Add expense error:', error);
    next(error);
  }
};

/**
 * @desc    Get budget expenses
 * @route   GET /api/v1/budgets/:budgetId/expenses
 * @access  Private
 */
const getExpenses = async (req, res, next) => {
  try {
    const { budgetId } = req.params;
    const { startDate, endDate, category } = req.query;
    const userId = req.user.id;
    const userRole = req.user.role;

    // Authorization: verify the budget belongs to an accessible workspace
    if (userRole !== 'super_admin') {
      const budget = await Budget.findByPk(budgetId, {
        include: [{ model: Project, as: 'project', attributes: ['id', 'workspaceId'] }]
      });
      if (!budget) {
        return res.status(404).json({ success: false, error: 'Budget not found' });
      }
      const workspaceId = budget.project?.workspaceId;
      if (workspaceId) {
        const { Workspace } = require('../models');
        const [membership, ownedWs] = await Promise.all([
          WorkspaceMembers.findOne({ where: { workspaceId, userId } }),
          Workspace.findOne({ where: { id: workspaceId, ownerId: userId } })
        ]);
        if (!membership && !ownedWs) {
          return res.status(403).json({ success: false, error: 'Access denied' });
        }
      }
    }

    const whereClause = { budgetId };
    
    if (startDate || endDate) {
      whereClause.date = {};
      if (startDate) whereClause.date[Op.gte] = new Date(startDate);
      if (endDate) whereClause.date[Op.lte] = new Date(endDate);
    }

    if (category) {
      whereClause.category = category;
    }

    const expenses = await BudgetExpense.findAll({
      where: whereClause,
      include: [
        {
          model: Task,
          as: 'task',
          attributes: ['id', 'title'],
          required: false
        },
        {
          model: User,
          as: 'user',
          attributes: ['id', 'firstName', 'lastName', 'email'],
          required: false
        }
      ],
      order: [['date', 'DESC']]
    });

    res.status(200).json({
      success: true,
      count: expenses.length,
      data: expenses
    });
  } catch (error) {
    logger.error('Get expenses error:', error);
    next(error);
  }
};

/**
 * @desc    Update budget
 * @route   PUT /api/v1/budgets/:budgetId
 * @access  Private (Admin/PM only)
 */
const updateBudget = async (req, res, next) => {
  try {
    const { budgetId } = req.params;
    const { name, budgetAmount, currency, startDate, endDate, status } = req.body;
    const userId = req.user.id;
    const userRole = req.user.role;

    const budget = await Budget.findByPk(budgetId, {
      include: [{ model: Project, as: 'project', attributes: ['id', 'workspaceId'] }]
    });
    if (!budget) {
      return res.status(404).json({ success: false, error: 'Budget not found' });
    }

    // Permission check
    if (!['super_admin', 'admin', 'owner', 'pm'].includes(userRole)) {
      const { Workspace, WorkspaceMembers } = require('../models');
      const workspace = await Workspace.findByPk(budget.project?.workspaceId);
      if (!workspace || workspace.ownerId !== userId) {
        const member = await WorkspaceMembers.findOne({
          where: { workspaceId: budget.project?.workspaceId, userId }
        });
        if (!member || !['owner', 'admin', 'pm'].includes(member.role)) {
          return res.status(403).json({ success: false, error: 'You do not have permission to update this budget' });
        }
      }
    }

    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (budgetAmount !== undefined) {
      updateData.budgetAmount = budgetAmount;
      // Recompute exceeded status against new amount
      const currentSpent = await BudgetExpense.sum('amount', { where: { budgetId } }) || 0;
      if (parseFloat(currentSpent) > parseFloat(budgetAmount)) {
        updateData.status = 'exceeded';
      } else if (budget.status === 'exceeded') {
        updateData.status = 'active';
      }
    }
    if (currency !== undefined) updateData.currency = currency;
    if (startDate !== undefined) updateData.startDate = startDate || null;
    if (endDate !== undefined) updateData.endDate = endDate || null;
    if (status !== undefined && ['active', 'closed'].includes(status)) updateData.status = status;

    await budget.update(updateData);

    // Return enriched budget with spend data
    const spent = await BudgetExpense.sum('amount', { where: { budgetId } }) || 0;
    const budgetAmt = parseFloat(budget.budgetAmount);
    res.status(200).json({
      success: true,
      data: {
        ...budget.toJSON(),
        spentAmount: parseFloat(spent),
        remainingAmount: budgetAmt - parseFloat(spent),
        spentPercentage: budgetAmt > 0 ? Math.round((parseFloat(spent) / budgetAmt) * 100) : 0,
        isExceeded: parseFloat(spent) > budgetAmt,
      }
    });
  } catch (error) {
    logger.error('Update budget error:', error);
    next(error);
  }
};

/**
 * @desc    Update expense
 * @route   PUT /api/v1/budgets/:budgetId/expenses/:expenseId
 * @access  Private (Admin/PM only)
 */
const updateExpense = async (req, res, next) => {
  try {
    const { budgetId, expenseId } = req.params;
    const { category, description, amount, date } = req.body;
    const userId = req.user.id;
    const userRole = req.user.role;

    const expense = await BudgetExpense.findOne({ where: { id: expenseId, budgetId } });
    if (!expense) {
      return res.status(404).json({ success: false, error: 'Expense not found' });
    }

    // Permission check: uploader or admin/pm/owner
    if (!['super_admin', 'admin', 'owner', 'pm'].includes(userRole) && expense.userId !== userId) {
      return res.status(403).json({ success: false, error: 'You can only edit your own expenses' });
    }

    const updateData = {};
    if (category !== undefined) updateData.category = category;
    if (description !== undefined) updateData.description = description;
    if (amount !== undefined) updateData.amount = amount;
    if (date !== undefined) updateData.date = date;

    await expense.update(updateData);

    // Recalculate budget status after amount change
    if (amount !== undefined) {
      const budget = await Budget.findByPk(budgetId);
      if (budget) {
        const totalSpent = await BudgetExpense.sum('amount', { where: { budgetId } }) || 0;
        const newSpent = parseFloat(totalSpent);
        const budgetAmt = parseFloat(budget.budgetAmount);
        const newStatus = newSpent > budgetAmt ? 'exceeded' : (budget.status === 'exceeded' ? 'active' : budget.status);
        await budget.update({ spentAmount: newSpent, status: newStatus });
      }
    }

    res.status(200).json({ success: true, data: expense });
  } catch (error) {
    logger.error('Update expense error:', error);
    next(error);
  }
};

const deleteExpense = async (req, res, next) => {
  try {
    const { budgetId, expenseId } = req.params;
    const userId = req.user.id;
    const userRole = req.user.role;

    const expense = await BudgetExpense.findOne({ where: { id: expenseId, budgetId } });
    if (!expense) {
      return res.status(404).json({ success: false, error: 'Expense not found' });
    }

    if (!['super_admin', 'admin', 'owner', 'pm'].includes(userRole) && expense.userId !== userId) {
      return res.status(403).json({ success: false, error: 'You can only delete your own expenses' });
    }

    await expense.destroy();

    const budget = await Budget.findByPk(budgetId);
    if (budget) {
      const totalSpent = await BudgetExpense.sum('amount', { where: { budgetId } }) || 0;
      const newSpent = parseFloat(totalSpent);
      const budgetAmt = parseFloat(budget.budgetAmount);
      const newStatus = newSpent > budgetAmt ? 'exceeded' : (budget.status === 'exceeded' ? 'active' : budget.status);
      await budget.update({ spentAmount: newSpent, status: newStatus });
    }

    res.status(200).json({ success: true, message: 'Expense deleted' });
  } catch (error) {
    logger.error('Delete expense error:', error);
    next(error);
  }
};

module.exports = {
  getBudgets,
  createBudget,
  addExpense,
  getExpenses,
  updateBudget,
  updateExpense,
  deleteExpense,
};

