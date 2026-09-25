const { Task, Status, Project, User, List } = require('../models');
const { Op } = require('sequelize');
const logger = require('../utils/logger');

/**
 * @desc    Get Kanban board data for a project
 * @route   GET /api/v1/projects/:projectId/kanban
 * @access  Private
 */
const getKanbanBoard = async (req, res, next) => {
  try {
    const projectId = req.params.id || req.params.projectId;
    const { listId, sprintId, issueType } = req.query;

    // Verify project exists
    const project = await Project.findByPk(projectId);
    if (!project) {
      return res.status(404).json({
        success: false,
        error: 'Project not found'
      });
    }

    // Get all statuses for the project
    const statuses = await Status.findAll({
      where: { projectId },
      order: [['position', 'ASC']],
      attributes: ['id', 'name', 'color', 'position']
    });

    // Build where clause
    const whereClause = {
      projectId,
      isArchived: false
    };

    if (listId) {
      whereClause.listId = listId;
    }
    if (sprintId === 'backlog') whereClause.sprintId = { [Op.is]: null };
    else if (sprintId) whereClause.sprintId = sprintId;
    if (issueType) whereClause.issueType = issueType;

    // Get all tasks for the project
    const tasks = await Task.findAll({
      where: whereClause,
      include: [
        {
          model: Status,
          as: 'status',
          attributes: ['id', 'name', 'color'],
          required: false
        },
        {
          model: User,
          as: 'assignees',
          attributes: ['id', 'firstName', 'lastName', 'email', 'avatar'],
          through: { attributes: [] },
          required: false
        },
        {
          model: List,
          as: 'list',
          attributes: ['id', 'name'],
          required: false
        }
      ],
      order: [['position', 'ASC'], ['createdAt', 'DESC']]
    });

    // Group tasks by status
    const columns = statuses.map(status => {
      const columnTasks = tasks.filter(task => 
        task.statusId === status.id || (!task.statusId && status.position === 0)
      );

      return {
        id: status.id,
        name: status.name,
        color: status.color,
        position: status.position,
        tasks: columnTasks.map(task => ({
          id: task.id,
          title: task.title,
          taskKey: task.taskKey,
          issueType: task.issueType,
          storyPoints: task.storyPoints,
          severity: task.severity,
          sprintId: task.sprintId,
          epicId: task.epicId,
          description: task.description,
          priority: task.priority,
          dueDate: task.dueDate,
          progress: task.progress,
          position: task.position,
          assignees: task.assignees || [],
          list: task.list,
          createdAt: task.createdAt,
          updatedAt: task.updatedAt
        })),
        taskCount: columnTasks.length
      };
    });

    // Add unassigned column if there are tasks without status
    const unassignedTasks = tasks.filter(task => !task.statusId);
    if (unassignedTasks.length > 0) {
      columns.unshift({
        id: 'unassigned',
        name: 'Unassigned',
        color: '#94a3b8',
        position: -1,
        tasks: unassignedTasks.map(task => ({
          id: task.id,
          title: task.title,
          taskKey: task.taskKey,
          issueType: task.issueType,
          storyPoints: task.storyPoints,
          severity: task.severity,
          sprintId: task.sprintId,
          epicId: task.epicId,
          description: task.description,
          priority: task.priority,
          dueDate: task.dueDate,
          progress: task.progress,
          position: task.position,
          assignees: task.assignees || [],
          list: task.list,
          createdAt: task.createdAt,
          updatedAt: task.updatedAt
        })),
        taskCount: unassignedTasks.length
      });
    }

    res.status(200).json({
      success: true,
      data: {
        projectId: project.id,
        projectName: project.name,
        columns,
        totalTasks: tasks.length
      }
    });
  } catch (error) {
    logger.error('Get Kanban board error:', error);
    next(error);
  }
};

/**
 * @desc    Update task position/status (for drag-drop)
 * @route   PUT /api/v1/tasks/:taskId/move
 * @access  Private
 */
const moveTask = async (req, res, next) => {
  try {
    const taskId = req.params.taskId || req.params.id;
    const { statusId, position, listId } = req.body;

    const task = await Task.findByPk(taskId);
    if (!task) {
      return res.status(404).json({
        success: false,
        error: 'Task not found'
      });
    }

    // Bug QA hand-off (Ready for Retest -> reporter, Reopened -> fixer)
    if (statusId !== undefined) {
      const { applyBugHandoff } = require('../utils/bugWorkflow');
      await applyBugHandoff({ task, statusId, actor: req.user });
    }

    // Update task
    const updateData = {};
    if (statusId !== undefined) {
      updateData.statusId = statusId;
    }
    if (position !== undefined) {
      updateData.position = position;
    }
    if (listId !== undefined) {
      updateData.listId = listId;
    }

    await task.update(updateData);

    // Log activity
    const { createActivityLog } = require('./activityLog.controller');
    await createActivityLog(
      'task',
      taskId,
      'moved',
      req.user.id,
      { statusId: { old: task.statusId, new: statusId }, position: { old: task.position, new: position } }
    );

    res.status(200).json({
      success: true,
      data: task
    });
  } catch (error) {
    logger.error('Move task error:', error);
    next(error);
  }
};

module.exports = {
  getKanbanBoard,
  moveTask
};

