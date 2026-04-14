const { Task, Project, Status, User, Workspace, WorkspaceMembers } = require('../models');
const { Op } = require('sequelize');
const logger = require('../utils/logger');

/**
 * @desc    Get calendar view data (tasks by date range)
 * @route   GET /api/v1/calendar
 * @access  Private
 */
const getCalendarData = async (req, res, next) => {
  try {
    const { startDate, endDate, projectId, userId } = req.query;
    const currentUserId = req.user.id;
    const userRole = req.user.role;

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        error: 'startDate and endDate are required (ISO format)'
      });
    }

    const whereClause = {
      isArchived: false,
      [Op.or]: [
        { dueDate: { [Op.between]: [new Date(startDate), new Date(endDate)] } },
        { startDate: { [Op.between]: [new Date(startDate), new Date(endDate)] } }
      ]
    };

    // Super admin can see all tasks
    let accessibleProjectIds = null;
    
    if (userRole !== 'super_admin') {
      // Get projects user has access to (through workspace membership)
      
      // Get workspace IDs user has access to
      const userWorkspaces = await WorkspaceMembers.findAll({
        where: { userId: currentUserId },
        attributes: ['workspaceId']
      });
      
      const accessibleWorkspaceIds = userWorkspaces.map(wm => wm.workspaceId);
      
      // Also include workspaces user owns
      const ownedWorkspaces = await Workspace.findAll({
        where: { ownerId: currentUserId },
        attributes: ['id']
      });
      
      const ownedWorkspaceIds = ownedWorkspaces.map(ws => ws.id);
      const allAccessibleWorkspaceIds = [...new Set([...accessibleWorkspaceIds, ...ownedWorkspaceIds])];
      
      if (allAccessibleWorkspaceIds.length === 0) {
        // User has no workspace access, return empty
        return res.status(200).json({
          success: true,
          data: {
            events: [],
            count: 0,
            startDate,
            endDate
          }
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
            data: {
              events: [],
              count: 0,
              startDate,
              endDate
            }
          });
        }
        whereClause.projectId = { [Op.in]: accessibleProjectIds };
      }
    } else if (projectId) {
      // Super admin with project filter
      whereClause.projectId = projectId;
    }

    // If userId is specified, filter by assignee
    let includeOptions = [
      {
        model: Project,
        as: 'project',
        attributes: ['id', 'name', 'color'],
        required: false
      },
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
      }
    ];

    if (userId) {
      includeOptions[2].where = { id: userId };
    } else {
      // If no userId specified, for members/viewers, show only tasks assigned to them
      // For admins/owners/pm, show all tasks in accessible projects
      if (userRole === 'member' || userRole === 'viewer') {
        includeOptions[2].where = { id: currentUserId };
      }
      // For admin, owner, pm - they can see all tasks in their accessible projects
    }

    const tasks = await Task.findAll({
      where: whereClause,
      include: includeOptions,
      order: [['dueDate', 'ASC'], ['startDate', 'ASC']]
    });

    // Format tasks for calendar
    const calendarEvents = tasks.map(task => {
      const event = {
        id: task.id,
        title: task.title,
        description: task.description,
        start: task.startDate || task.dueDate || task.createdAt,
        end: task.dueDate || (task.startDate ? new Date(new Date(task.startDate).getTime() + 24 * 60 * 60 * 1000) : new Date(new Date(task.createdAt).getTime() + 24 * 60 * 60 * 1000)),
        allDay: true,
        priority: task.priority,
        status: task.status,
        project: task.project,
        assignees: task.assignees || [],
        progress: task.progress,
        url: `/app/tasks/${task.id}`
      };

      return event;
    });

    res.status(200).json({
      success: true,
      data: {
        events: calendarEvents,
        count: calendarEvents.length,
        startDate,
        endDate
      }
    });
  } catch (error) {
    logger.error('Get calendar data error:', error);
    next(error);
  }
};

module.exports = {
  getCalendarData
};

