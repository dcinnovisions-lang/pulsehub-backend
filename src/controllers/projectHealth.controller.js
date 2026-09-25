const { Project, Task, Status, Workspace, User, Budget, BudgetExpense } = require('../models');
const { Op } = require('sequelize');
const logger = require('../utils/logger');

/**
 * Calculate project health score (0-100)
 * Factors: On-time delivery, task completion, overdue tasks, resource utilization
 */
const calculateHealthScore = (project, tasks, statuses) => {
  if (!tasks || tasks.length === 0) {
    return {
      score: 100,
      status: 'healthy',
      factors: {
        taskCompletion: 100,
        onTimeDelivery: 100,
        overdueTasks: 0,
        resourceUtilization: 100
      }
    };
  }

  const totalTasks = tasks.length;
  const completedStatuses = statuses.filter(s => 
    s.name.toLowerCase() === 'done' || 
    s.name.toLowerCase() === 'completed'
  ).map(s => s.id);
  
  const completedTasks = tasks.filter(t => 
    completedStatuses.includes(t.statusId)
  ).length;
  
  const taskCompletionRate = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 100;

  // Calculate overdue tasks
  const now = new Date();
  const overdueTasks = tasks.filter(task => {
    if (!task.dueDate) return false;
    const dueDate = new Date(task.dueDate);
    return dueDate < now && !completedStatuses.includes(task.statusId);
  }).length;
  
  const overdueRate = totalTasks > 0 ? (overdueTasks / totalTasks) * 100 : 0;

  // On-time delivery score (inverse of overdue rate)
  const onTimeDeliveryScore = Math.max(0, 100 - (overdueRate * 2)); // Penalize overdue tasks more

  // Resource utilization (simplified - based on assigned tasks)
  const assignedTasks = tasks.filter(t => t.assignees && t.assignees.length > 0).length;
  const resourceUtilization = totalTasks > 0 ? (assignedTasks / totalTasks) * 100 : 100;

  // Calculate overall health score (weighted average)
  const healthScore = Math.round(
    (taskCompletionRate * 0.3) +
    (onTimeDeliveryScore * 0.4) +
    (Math.min(100, resourceUtilization) * 0.2) +
    (Math.max(0, 100 - (overdueRate * 1.5)) * 0.1)
  );

  let status = 'healthy';
  if (healthScore >= 80) status = 'healthy';
  else if (healthScore >= 60) status = 'at_risk';
  else if (healthScore >= 40) status = 'critical';
  else status = 'off_track';

  return {
    score: Math.max(0, Math.min(100, healthScore)),
    status,
    factors: {
      taskCompletion: Math.round(taskCompletionRate),
      onTimeDelivery: Math.round(onTimeDeliveryScore),
      overdueTasks: overdueTasks,
      overdueRate: Math.round(overdueRate),
      resourceUtilization: Math.round(resourceUtilization)
    }
  };
};

/**
 * @desc    Get project health score
 * @route   GET /api/v1/projects/:projectId/health
 * @access  Private
 */
const getProjectHealth = async (req, res, next) => {
  try {
    const { projectId } = req.params;
    const userId = req.user.id;
    const userRole = req.user.role;

    // Get project with workspace
    const project = await Project.findByPk(projectId, {
      include: [
        {
          model: Workspace,
          as: 'workspace',
          attributes: ['id', 'name', 'ownerId']
        }
      ]
    });

    if (!project) {
      return res.status(404).json({
        success: false,
        error: 'Project not found'
      });
    }

    // Check access permissions
    if (userRole !== 'super_admin' && project.workspace.ownerId !== userId) {
      const { WorkspaceMembers } = require('../models');
      const member = await WorkspaceMembers.findOne({
        where: { workspaceId: project.workspaceId, userId }
      });

      if (!member) {
        return res.status(403).json({
          success: false,
          error: 'You do not have access to this project'
        });
      }
    }

    // Get all tasks for the project
    const tasks = await Task.findAll({
      where: { projectId, isArchived: false },
      include: [
        {
          model: User,
          as: 'assignees',
          attributes: ['id', 'firstName', 'lastName', 'email'],
          through: { attributes: [] },
          required: false
        },
        {
          model: Status,
          as: 'status',
          attributes: ['id', 'name', 'color'],
          required: false
        }
      ]
    });

    // Get all statuses for the project
    const statuses = await Status.findAll({
      where: { projectId },
      attributes: ['id', 'name', 'color', 'position']
    });

    // Calculate health score
    const healthData = calculateHealthScore(project, tasks, statuses);

    // Calculate risk factors
    const riskFactors = [];
    if (healthData.factors.overdueTasks > 0) {
      riskFactors.push({
        type: 'overdue_tasks',
        severity: healthData.factors.overdueRate > 20 ? 'high' : 'medium',
        message: `${healthData.factors.overdueTasks} task(s) are overdue`,
        count: healthData.factors.overdueTasks
      });
    }

    if (healthData.factors.taskCompletion < 50) {
      riskFactors.push({
        type: 'low_completion',
        severity: 'medium',
        message: `Only ${healthData.factors.taskCompletion}% of tasks completed`,
        percentage: healthData.factors.taskCompletion
      });
    }

    if (healthData.factors.resourceUtilization < 50) {
      riskFactors.push({
        type: 'low_resource_utilization',
        severity: 'low',
        message: `Only ${healthData.factors.resourceUtilization}% of tasks are assigned`,
        percentage: healthData.factors.resourceUtilization
      });
    }

    // Get trend data (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const recentTasks = tasks.filter(task => 
      new Date(task.createdAt) >= sevenDaysAgo
    );

    const recentCompleted = recentTasks.filter(task =>
      statuses.some(s => 
        (s.name.toLowerCase() === 'done' || s.name.toLowerCase() === 'completed') &&
        s.id === task.statusId
      )
    ).length;

    const trend = recentTasks.length > 0 
      ? (recentCompleted / recentTasks.length) * 100 
      : 0;

    res.status(200).json({
      success: true,
      data: {
        projectId: project.id,
        projectName: project.name,
        healthScore: healthData.score,
        status: healthData.status,
        factors: healthData.factors,
        riskFactors,
        trend: Math.round(trend),
        lastUpdated: new Date().toISOString()
      }
    });
  } catch (error) {
    logger.error('Get project health error:', error);
    next(error);
  }
};

/**
 * @desc    Get stakeholder dashboard (portfolio view)
 * @route   GET /api/v1/dashboard/stakeholder
 * @access  Private (Viewer/Stakeholder role or higher)
 */
const getStakeholderDashboard = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const userRole = req.user.role;

    // Get all accessible projects
    let projects = [];

    if (userRole === 'super_admin') {
      // Super admin sees all projects
      projects = await Project.findAll({
        where: { status: 'active' },
        include: [
          {
            model: Workspace,
            as: 'workspace',
            attributes: ['id', 'name', 'ownerId']
          }
        ]
      });
    } else {
      // Get user's workspaces
      const { WorkspaceMembers } = require('../models');
      const workspaceMemberships = await WorkspaceMembers.findAll({
        where: { userId },
        attributes: ['workspaceId']
      });

      const workspaceIds = workspaceMemberships.map(wm => wm.workspaceId);

      // Also include workspaces owned by user
      const ownedWorkspaces = await Workspace.findAll({
        where: { ownerId: userId },
        attributes: ['id']
      });

      const allWorkspaceIds = [
        ...workspaceIds,
        ...ownedWorkspaces.map(w => w.id)
      ];

      if (allWorkspaceIds.length === 0) {
        return res.status(200).json({
          success: true,
          data: {
            totalProjects: 0,
            projects: [],
            summary: {
              onTrack: 0,
              atRisk: 0,
              offTrack: 0,
              healthy: 0
            },
            metrics: {
              totalTasks: 0,
              completedTasks: 0,
              overdueTasks: 0,
              completionRate: 0
            }
          }
        });
      }

      projects = await Project.findAll({
        where: {
          workspaceId: { [Op.in]: allWorkspaceIds },
          status: 'active'
        },
        include: [
          {
            model: Workspace,
            as: 'workspace',
            attributes: ['id', 'name', 'ownerId']
          }
        ]
      });
    }

    // Calculate health for each project
    const projectsWithHealth = await Promise.all(
      projects.map(async (project) => {
        // For viewers/members, only count tasks assigned to them
        const taskWhereClause = { projectId: project.id, isArchived: false };
        const taskIncludeOptions = [
          {
            model: Status,
            as: 'status',
            attributes: ['id', 'name', 'color'],
            required: false
          }
        ];

        const tasks = await Task.findAll({
          where: taskWhereClause,
          include: taskIncludeOptions
        });

        const statuses = await Status.findAll({
          where: { projectId: project.id },
          attributes: ['id', 'name', 'color']
        });

        const healthData = calculateHealthScore(project, tasks, statuses);

        // Budget data for this project
        const projectBudgets = await Budget.findAll({
          where: { projectId: project.id },
          include: [{
            model: BudgetExpense,
            as: 'expenses',
            attributes: ['amount'],
            required: false
          }]
        });
        const totalBudgeted = projectBudgets.reduce((sum, b) => sum + parseFloat(b.budgetAmount || 0), 0);
        const totalSpent = projectBudgets.reduce((sum, b) =>
          sum + (b.expenses || []).reduce((s, e) => s + parseFloat(e.amount || 0), 0), 0);
        const budgetUtilPct = totalBudgeted > 0 ? Math.round((totalSpent / totalBudgeted) * 100) : null;

        return {
          id: project.id,
          name: project.name,
          workspaceName: project.workspace?.name,
          workspaceId: project.workspaceId,
          status: project.status,
          healthScore: healthData.score,
          healthStatus: healthData.status,
          totalTasks: tasks.length,
          completedTasks: tasks.filter(t =>
            statuses.some(s =>
              (s.name.toLowerCase() === 'done' || s.name.toLowerCase() === 'completed') &&
              s.id === t.statusId
            )
          ).length,
          overdueTasks: healthData.factors.overdueTasks,
          updatedAt: project.updatedAt,
          // Budget fields
          budgetCount: projectBudgets.length,
          totalBudgeted,
          totalSpent,
          budgetRemaining: totalBudgeted - totalSpent,
          budgetUtilPct,
          budgetExceeded: totalSpent > totalBudgeted && totalBudgeted > 0,
        };
      })
    );

    // Calculate summary
    const summary = {
      onTrack: projectsWithHealth.filter(p => p.healthStatus === 'healthy').length,
      atRisk: projectsWithHealth.filter(p => p.healthStatus === 'at_risk').length,
      offTrack: projectsWithHealth.filter(p => 
        p.healthStatus === 'critical' || p.healthStatus === 'off_track'
      ).length,
      healthy: projectsWithHealth.filter(p => p.healthStatus === 'healthy').length
    };

    // Calculate overall metrics
    const totalTasks = projectsWithHealth.reduce((sum, p) => sum + p.totalTasks, 0);
    const completedTasks = projectsWithHealth.reduce((sum, p) => sum + p.completedTasks, 0);
    const overdueTasks = projectsWithHealth.reduce((sum, p) => sum + p.overdueTasks, 0);
    const completionRate = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;

    // Calculate average health score
    const avgHealthScore = projectsWithHealth.length > 0
      ? Math.round(
          projectsWithHealth.reduce((sum, p) => sum + p.healthScore, 0) /
          projectsWithHealth.length
        )
      : 100;

    // Portfolio-level budget rollup
    const portfolioBudgeted = projectsWithHealth.reduce((sum, p) => sum + (p.totalBudgeted || 0), 0);
    const portfolioSpent    = projectsWithHealth.reduce((sum, p) => sum + (p.totalSpent    || 0), 0);

    res.status(200).json({
      success: true,
      data: {
        totalProjects: projectsWithHealth.length,
        projects: projectsWithHealth,
        summary,
        metrics: {
          totalTasks,
          completedTasks,
          overdueTasks,
          completionRate: Math.round(completionRate),
          averageHealthScore: avgHealthScore,
          // Budget KPIs
          portfolioBudgeted,
          portfolioSpent,
          portfolioRemaining: portfolioBudgeted - portfolioSpent,
          portfolioBudgetUtil: portfolioBudgeted > 0
            ? Math.round((portfolioSpent / portfolioBudgeted) * 100)
            : null,
        },
        lastUpdated: new Date().toISOString()
      }
    });
  } catch (error) {
    logger.error('Get stakeholder dashboard error:', error);
    next(error);
  }
};

module.exports = {
  getProjectHealth,
  getStakeholderDashboard
};

