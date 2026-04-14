const { Task, Project, List, Status, User, Subtask, Workspace, WorkspaceMembers } = require('../models');
const { Op } = require('sequelize');
const logger = require('../utils/logger');
const { createActivityLog } = require('./activityLog.controller');
const { createNotification } = require('./notification.controller');
const { runAutomations } = require('../utils/automationEngine');
const { emitTaskUpdated, getIO } = require('../socket');

/**
 * @desc    Get all tasks
 * @route   GET /api/v1/tasks
 * @access  Private
 */
const getTasks = async (req, res, next) => {
  try {
    const { projectId, listId, statusId, assigneeId } = req.query;
    const page   = Math.max(1, parseInt(req.query.page)  || 1);
    const limit  = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));
    const offset = (page - 1) * limit;
    const userId = req.user.id;
    const userRole = req.user.role;

    const whereClause = {};
    if (listId) whereClause.listId = listId;
    if (statusId) whereClause.statusId = statusId;

    // Super admin can see all tasks
    let accessibleProjectIds = null;

    if (userRole !== 'super_admin') {
      // Get projects user has access to (through workspace membership)

      // Get workspace IDs user has access to
      const userWorkspaces = await WorkspaceMembers.findAll({
        where: { userId },
        attributes: ['workspaceId']
      });

      const accessibleWorkspaceIds = userWorkspaces.map(wm => wm.workspaceId);

      // Also include workspaces user owns
      const ownedWorkspaces = await Workspace.findAll({
        where: { ownerId: userId },
        attributes: ['id']
      });

      const ownedWorkspaceIds = ownedWorkspaces.map(ws => ws.id);
      const allAccessibleWorkspaceIds = [...new Set([...accessibleWorkspaceIds, ...ownedWorkspaceIds])];

      if (allAccessibleWorkspaceIds.length === 0) {
        // User has no workspace access, return empty
        return res.status(200).json({
          success: true,
          count: 0,
          data: []
        });
      }

      // Get projects from accessible workspaces
      const accessibleProjects = await Project.findAll({
        where: { workspaceId: { [Op.in]: allAccessibleWorkspaceIds } },
        attributes: ['id']
      });

      accessibleProjectIds = accessibleProjects.map(p => p.id);

      if (projectId) {
        // Verify user has access to this specific project
        if (!accessibleProjectIds.includes(projectId)) {
          return res.status(403).json({
            success: false,
            error: 'You do not have access to this project'
          });
        }
        whereClause.projectId = projectId;
      } else {
        // Filter by accessible projects only
        if (accessibleProjectIds.length === 0) {
          return res.status(200).json({
            success: true,
            count: 0,
            data: []
          });
        }
        whereClause.projectId = { [Op.in]: accessibleProjectIds };
      }
    } else if (projectId) {
      // Super admin with project filter
      whereClause.projectId = projectId;
    }

    const includeOptions = [
      {
        model: Project,
        as: 'project',
        attributes: ['id', 'name']
      },
      {
        model: List,
        as: 'list',
        attributes: ['id', 'name']
      },
      {
        model: Status,
        as: 'status',
        attributes: ['id', 'name', 'color']
      },
      {
        model: User,
        as: 'creator',
        attributes: ['id', 'email', 'firstName', 'lastName', 'avatar']
      },
      {
        model: User,
        as: 'assignees',
        attributes: ['id', 'email', 'firstName', 'lastName', 'avatar'],
        through: { attributes: [] }
      },
      {
        model: Subtask,
        as: 'subtasks',
        attributes: ['id', 'title', 'isCompleted', 'position']
      }
    ];

    // Filter by assignee
    if (assigneeId) {
      includeOptions[4].where = { id: assigneeId };
      includeOptions[4].required = true; // Use INNER JOIN to only get tasks with this assignee
    } else if (userRole === 'member' || userRole === 'viewer') {
      // For members/viewers, only show tasks assigned to them
      includeOptions[4].where = { id: userId };
      includeOptions[4].required = true; // Use INNER JOIN to only get tasks with this assignee
    }

    const { count, rows: tasks } = await Task.findAndCountAll({
      where: whereClause,
      include: includeOptions,
      order: [['position', 'ASC'], ['createdAt', 'DESC']],
      limit,
      offset,
      distinct: true   // needed when include has hasMany — prevents inflated count
    });

    res.status(200).json({
      success: true,
      count: tasks.length,
      total: count,
      pagination: {
        page,
        limit,
        totalPages: Math.ceil(count / limit),
        hasNextPage: page < Math.ceil(count / limit),
        hasPrevPage: page > 1
      },
      data: tasks
    });
  } catch (error) {
    logger.error('Get tasks error:', error);
    next(error);
  }
};

/**
 * @desc    Get task by ID
 * @route   GET /api/v1/tasks/:id
 * @access  Private
 */
const getTaskById = async (req, res, next) => {
  try {
    const task = await Task.findByPk(req.params.id, {
      include: [
        {
          model: Project,
          as: 'project',
          attributes: ['id', 'name']
        },
        {
          model: List,
          as: 'list',
          attributes: ['id', 'name']
        },
        {
          model: Status,
          as: 'status',
          attributes: ['id', 'name', 'color']
        },
        {
          model: User,
          as: 'creator',
          attributes: ['id', 'email', 'firstName', 'lastName', 'avatar']
        },
        {
          model: User,
          as: 'assignees',
          attributes: ['id', 'email', 'firstName', 'lastName', 'avatar'],
          through: { attributes: [] }
        },
        {
          model: Subtask,
          as: 'subtasks',
          attributes: ['id', 'title', 'isCompleted', 'position', 'assigneeId'],
          order: [['position', 'ASC']],
          include: [{
            model: User,
            as: 'assignee',
            attributes: ['id', 'email', 'firstName', 'lastName', 'avatar']
          }]
        }
      ]
    });

    if (!task) {
      return res.status(404).json({
        success: false,
        error: 'Task not found'
      });
    }

    res.status(200).json({
      success: true,
      data: task
    });
  } catch (error) {
    logger.error('Get task by ID error:', error);
    next(error);
  }
};

/**
 * @desc    Create task
 * @route   POST /api/v1/tasks
 * @access  Private
 */
const createTask = async (req, res, next) => {
  try {
    const {
      title,
      description,
      projectId,
      listId,
      statusId,
      priority,
      dueDate,
      startDate,
      estimatedHours,
      assigneeIds
    } = req.body;

    // Verify project exists
    const project = await Project.findByPk(projectId);
    if (!project) {
      return res.status(404).json({
        success: false,
        error: 'Project not found'
      });
    }

    // Authorization is handled by checkPermission middleware (RBAC).

    // Get max position for the list
    const maxPosition = await Task.max('position', {
      where: {
        listId: listId || { [Op.is]: null },
        projectId
      }
    });

    const task = await Task.create({
      title,
      description,
      projectId,
      listId,
      statusId,
      priority: priority || 'medium',
      dueDate,
      startDate,
      estimatedHours,
      createdBy: req.user.id,
      position: (maxPosition || 0) + 1
    });

    // Add assignees if provided
    if (assigneeIds && Array.isArray(assigneeIds) && assigneeIds.length > 0) {
      await task.setAssignees(assigneeIds);
    }

    // Reload with associations
    await task.reload({
      include: [
        {
          model: User,
          as: 'assignees',
          attributes: ['id', 'email', 'firstName', 'lastName', 'avatar'],
          through: { attributes: [] }
        }
      ]
    });

    // Log activity
    await createActivityLog('task', task.id, 'created', req.user.id, null, {
      projectId: task.projectId,
      listId: task.listId
    });

    // Notify assignees (skip the creator)
    if (task.assignees && task.assignees.length > 0) {
      const actorName = `${req.user.firstName || ''} ${req.user.lastName || ''}`.trim() || 'Someone';
      await Promise.allSettled(
        task.assignees.map(assignee =>
          createNotification({
            userId:     assignee.id,
            type:       'task_assigned',
            title:      `You were assigned to "${task.title}"`,
            body:       `${actorName} assigned you to this task in ${project.name}`,
            entityType: 'task',
            entityId:   task.id,
            actorId:    req.user.id,
            metadata:   { url: `/app/projects/${task.projectId}/tasks/${task.id}`, projectId: task.projectId }
          })
        )
      );
    }

    // Run automations for task_created trigger (non-fatal)
    runAutomations('task_created', { task, actorId: req.user.id }).catch(() => {});

    res.status(201).json({
      success: true,
      data: task
    });
  } catch (error) {
    logger.error('Create task error:', error);
    next(error);
  }
};

/**
 * @desc    Update task
 * @route   PUT /api/v1/tasks/:id
 * @access  Private
 */
const updateTask = async (req, res, next) => {
  try {
    const task = await Task.findByPk(req.params.id);

    if (!task) {
      return res.status(404).json({
        success: false,
        error: 'Task not found'
      });
    }

    const {
      title,
      description,
      listId,
      statusId,
      priority,
      dueDate,
      startDate,
      estimatedHours,
      assigneeIds,
      position,
      progress,
      labels
    } = req.body;

    // Track changes for activity log
    const changes = {};
    const oldValues = {
      title: task.title,
      description: task.description,
      listId: task.listId,
      statusId: task.statusId,
      priority: task.priority,
      dueDate: task.dueDate,
      startDate: task.startDate,
      estimatedHours: task.estimatedHours,
      progress: task.progress
    };

    if (title !== undefined && title !== task.title) changes.title = { old: task.title, new: title };
    if (description !== undefined && description !== task.description) changes.description = { old: task.description, new: description };
    if (listId !== undefined && listId !== task.listId) changes.listId = { old: task.listId, new: listId };
    if (statusId !== undefined && statusId !== task.statusId) {
      changes.statusId = { old: task.statusId, new: statusId };
      // Get status names for better logging
      const oldStatus = await Status.findByPk(task.statusId);
      const newStatus = await Status.findByPk(statusId);
      if (oldStatus && newStatus) {
        changes.statusId = { old: oldStatus.name, new: newStatus.name };
      }
    }
    if (priority !== undefined && priority !== task.priority) changes.priority = { old: task.priority, new: priority };
    if (dueDate !== undefined && dueDate !== task.dueDate) changes.dueDate = { old: task.dueDate, new: dueDate };
    if (startDate !== undefined && startDate !== task.startDate) changes.startDate = { old: task.startDate, new: startDate };
    if (estimatedHours !== undefined && estimatedHours !== task.estimatedHours) changes.estimatedHours = { old: task.estimatedHours, new: estimatedHours };
    if (progress !== undefined && progress !== task.progress) changes.progress = { old: task.progress, new: progress };

    await task.update({
      title: title !== undefined ? title : task.title,
      description: description !== undefined ? description : task.description,
      listId: listId !== undefined ? listId : task.listId,
      statusId: statusId !== undefined ? statusId : task.statusId,
      priority: priority || task.priority,
      dueDate: dueDate !== undefined ? dueDate : task.dueDate,
      startDate: startDate !== undefined ? startDate : task.startDate,
      estimatedHours: estimatedHours !== undefined ? estimatedHours : task.estimatedHours,
      position: position !== undefined ? position : task.position,
      progress: progress !== undefined ? progress : task.progress,
      labels: labels !== undefined ? labels : task.labels
    });

    // Update assignees if provided
    if (assigneeIds !== undefined) {
      const { TaskAssignees, User } = require('../models');

      // First, remove all existing assignees
      await TaskAssignees.destroy({
        where: { task_id: task.id }
      });

      // Then, add new assignees if any
      if (Array.isArray(assigneeIds) && assigneeIds.length > 0) {
        // Verify all user IDs exist
        const users = await User.findAll({
          where: { id: assigneeIds },
          attributes: ['id']
        });

        const validUserIds = users.map(u => u.id);

        // Create assignee records with proper field names
        if (validUserIds.length > 0) {
          await TaskAssignees.bulkCreate(
            validUserIds.map(userId => ({
              task_id: task.id,
              user_id: userId
            }))
          );
        }
      }
    }

    // Track assignee changes
    let assigneeAction = null;
    if (assigneeIds !== undefined) {
      const { TaskAssignees } = require('../models');
      const currentAssignees = await TaskAssignees.findAll({
        where: { task_id: task.id },
        attributes: ['user_id']
      });
      const currentAssigneeIds = currentAssignees.map(a => a.user_id);
      const newAssigneeIds = Array.isArray(assigneeIds) ? assigneeIds : [];

      if (JSON.stringify(currentAssigneeIds.sort()) !== JSON.stringify(newAssigneeIds.sort())) {
        assigneeAction = newAssigneeIds.length > currentAssigneeIds.length ? 'assigned' : 'unassigned';
        changes.assignees = { old: currentAssigneeIds, new: newAssigneeIds };
      }
    }

    // Reload with associations
    await task.reload({
      include: [
        {
          model: User,
          as: 'assignees',
          attributes: ['id', 'email', 'firstName', 'lastName', 'avatar'],
          through: { attributes: [] }
        }
      ]
    });

    // Log activity
    if (Object.keys(changes).length > 0) {
      const action = changes.statusId ? 'status_changed' : (assigneeAction || 'updated');
      await createActivityLog('task', task.id, action, req.user.id, changes);
    }

    // Notify newly-added assignees
    if (assigneeIds !== undefined && Array.isArray(assigneeIds) && assigneeIds.length > 0) {
      const oldIds = changes.assignees?.old || [];
      const addedIds = assigneeIds.filter(id => !oldIds.includes(id));
      if (addedIds.length > 0) {
        const actorName = `${req.user.firstName || ''} ${req.user.lastName || ''}`.trim() || 'Someone';
        const proj = await Project.findByPk(task.projectId, { attributes: ['name'] });
        await Promise.allSettled(
          addedIds.map(uid =>
            createNotification({
              userId:     uid,
              type:       'task_assigned',
              title:      `You were assigned to "${task.title}"`,
              body:       `${actorName} assigned you to this task${proj ? ` in ${proj.name}` : ''}`,
              entityType: 'task',
              entityId:   task.id,
              actorId:    req.user.id,
              metadata:   { url: `/app/projects/${task.projectId}/tasks/${task.id}`, projectId: task.projectId }
            })
          )
        );
      }
    }

    // Run automations (non-fatal)
    if (changes.statusId) {
      runAutomations('task_status_changed', { task, oldStatusId: oldValues.statusId, actorId: req.user.id }).catch(() => {});
    }
    if (changes.assignees) {
      runAutomations('task_assigned', { task, actorId: req.user.id }).catch(() => {});
    }
    if (changes.priority) {
      runAutomations('task_priority_changed', { task, oldPriority: oldValues.priority, actorId: req.user.id }).catch(() => {});
    }

    // Emit real-time update to project room members
    try {
      emitTaskUpdated(task.projectId, {
        taskId: task.id,
        projectId: task.projectId,
        changes: Object.keys(changes),
        updatedBy: req.user.id
      });
    } catch (socketErr) {
      logger.warn('emitTaskUpdated failed (non-fatal):', socketErr.message);
    }

    if (assigneeIds !== undefined) {
      try {
        getIO().to(`project:${task.projectId}`).emit('task:assigned', {
          taskId: task.id,
          projectId: task.projectId,
          assignees: task.assignees
        });
      } catch (socketErr) {
        logger.warn('task:assigned emit failed (non-fatal):', socketErr.message);
      }
    }

    res.status(200).json({
      success: true,
      data: task
    });
  } catch (error) {
    logger.error('Update task error:', error);
    next(error);
  }
};

/**
 * @desc    Delete task
 * @route   DELETE /api/v1/tasks/:id
 * @access  Private
 */
const deleteTask = async (req, res, next) => {
  try {
    const task = await Task.findByPk(req.params.id);

    if (!task) {
      return res.status(404).json({
        success: false,
        error: 'Task not found'
      });
    }

    // Soft delete
    await task.update({ isArchived: true });

    // Log activity
    await createActivityLog('task', task.id, 'archived', req.user.id);

    res.status(200).json({
      success: true,
      message: 'Task archived successfully'
    });
  } catch (error) {
    logger.error('Delete task error:', error);
    next(error);
  }
};

/**
 * @desc    Reorder tasks (drag & drop)
 * @route   PUT /api/v1/tasks/reorder
 * @access  Private
 */
const reorderTasks = async (req, res, next) => {
  try {
    const { taskIds, projectId, listId } = req.body;

    if (!Array.isArray(taskIds) || taskIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'taskIds array is required'
      });
    }

    if (!projectId) {
      return res.status(400).json({
        success: false,
        error: 'projectId is required'
      });
    }

    // Verify all tasks exist and belong to the project
    const tasks = await Task.findAll({
      where: {
        id: { [Op.in]: taskIds },
        projectId
      }
    });

    if (tasks.length !== taskIds.length) {
      return res.status(400).json({
        success: false,
        error: 'Some tasks not found or do not belong to the project'
      });
    }

    // Update positions based on the order in taskIds array
    const updatePromises = taskIds.map((taskId, index) => {
      return Task.update(
        {
          position: index + 1,
          listId: listId !== undefined ? listId : null
        },
        { where: { id: taskId } }
      );
    });

    await Promise.all(updatePromises);

    // Log activity for each moved task
    for (const taskId of taskIds) {
      await createActivityLog('task', taskId, 'moved', req.user.id, {
        position: taskIds.indexOf(taskId) + 1,
        listId: listId || null
      });
    }

    res.status(200).json({
      success: true,
      message: 'Tasks reordered successfully'
    });
  } catch (error) {
    logger.error('Reorder tasks error:', error);
    next(error);
  }
};

module.exports = {
  getTasks,
  getTaskById,
  createTask,
  updateTask,
  deleteTask,
  reorderTasks
};
