const { TimeLog, Task, Project, User } = require('../models');
const { Op } = require('sequelize');
const logger = require('../utils/logger');

/**
 * @desc    Create time log
 * @route   POST /api/v1/time-logs
 * @access  Private
 */
const createTimeLog = async (req, res, next) => {
  try {
    const { taskId, hours, minutes, description, date, isBillable } = req.body;
    const userId = req.user.id;

    if (!taskId || (hours === undefined && minutes === undefined)) {
      return res.status(400).json({
        success: false,
        error: 'taskId and time (hours or minutes) are required'
      });
    }

    // Verify task exists
    const task = await Task.findByPk(taskId);
    if (!task) {
      return res.status(404).json({
        success: false,
        error: 'Task not found'
      });
    }

    const totalMinutes = (hours || 0) * 60 + (minutes || 0);
    const totalHours = totalMinutes / 60;

    const timeLog = await TimeLog.create({
      taskId,
      userId,
      hours: totalHours,
      description,
      loggedDate: date || new Date(),
      isBillable: isBillable === true || isBillable === 'true'
    });

    // Log activity
    const { createActivityLog } = require('./activityLog.controller');
    await createActivityLog(
      'task',
      taskId,
      'time_logged',
      userId,
      { hours: totalHours.toFixed(2) },
      { description }
    );

    res.status(201).json({
      success: true,
      data: timeLog
    });
  } catch (error) {
    logger.error('Create time log error:', error);
    next(error);
  }
};

/**
 * @desc    Get time logs
 * @route   GET /api/v1/time-logs
 * @access  Private
 */
const getTimeLogs = async (req, res, next) => {
  try {
    const { taskId, userId, projectId, startDate, endDate } = req.query;
    const currentUserId = req.user.id;

    const whereClause = {};

    if (taskId) {
      whereClause.taskId = taskId;
    }

    if (userId) {
      whereClause.userId = userId;
    } else if (req.user.role !== 'super_admin' && req.user.role !== 'admin') {
      // Regular users only see their own logs
      whereClause.userId = currentUserId;
    }

    if (startDate || endDate) {
      whereClause.loggedDate = {};
      if (startDate) whereClause.loggedDate[Op.gte] = new Date(startDate);
      if (endDate) whereClause.loggedDate[Op.lte] = new Date(endDate);
    }

    const includeOptions = [
      {
        model: Task,
        as: 'task',
        attributes: ['id', 'title', 'projectId'],
        include: [
          {
            model: Project,
            as: 'project',
            attributes: ['id', 'name'],
            required: false
          }
        ],
        required: false
      },
      {
        model: User,
        as: 'user',
        attributes: ['id', 'firstName', 'lastName', 'email', 'avatar'],
        required: false
      }
    ];

    if (projectId) {
      includeOptions[0].where = { projectId };
    }

    const page   = Math.max(1, parseInt(req.query.page)  || 1);
    const limit  = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const offset = (page - 1) * limit;

    const { count, rows: timeLogs } = await TimeLog.findAndCountAll({
      where: whereClause,
      include: includeOptions,
      order: [['loggedDate', 'DESC'], ['createdAt', 'DESC']],
      limit,
      offset,
      distinct: true
    });

    // Calculate totals for current page
    const totalHours = timeLogs.reduce((sum, log) => sum + parseFloat(log.hours || 0), 0);

    res.status(200).json({
      success: true,
      count: timeLogs.length,
      total: count,
      totalHours: totalHours.toFixed(2),
      pagination: {
        page,
        limit,
        totalPages: Math.ceil(count / limit),
        hasNextPage: page < Math.ceil(count / limit),
        hasPrevPage: page > 1
      },
      data: timeLogs
    });
  } catch (error) {
    logger.error('Get time logs error:', error);
    next(error);
  }
};

/**
 * @desc    Get time tracking statistics
 * @route   GET /api/v1/time-logs/statistics
 * @access  Private
 */
const getTimeStatistics = async (req, res, next) => {
  try {
    const { projectId, userId, startDate, endDate } = req.query;
    const currentUserId = req.user.id;

    const whereClause = {};

    if (projectId) {
      whereClause['$task.projectId$'] = projectId;
    }

    if (userId) {
      whereClause.userId = userId;
    } else if (req.user.role !== 'super_admin' && req.user.role !== 'admin') {
      whereClause.userId = currentUserId;
    }

    if (startDate || endDate) {
      whereClause.loggedDate = {};
      if (startDate) whereClause.loggedDate[Op.gte] = new Date(startDate);
      if (endDate) whereClause.loggedDate[Op.lte] = new Date(endDate);
    }

    const timeLogs = await TimeLog.findAll({
      where: whereClause,
      include: [
        {
          model: Task,
          as: 'task',
          attributes: ['id', 'title', 'projectId'],
          include: [
            {
              model: Project,
              as: 'project',
              attributes: ['id', 'name'],
              required: false
            }
          ],
          required: false
        },
        {
          model: User,
          as: 'user',
          attributes: ['id', 'firstName', 'lastName'],
          required: false
        }
      ]
    });

    // Calculate statistics
    const totalHours = timeLogs.reduce((sum, log) => sum + parseFloat(log.hours || 0), 0);

    // By user
    const byUser = {};
    timeLogs.forEach(log => {
      const userId = log.userId;
      if (!byUser[userId]) {
        byUser[userId] = {
          userId,
          userName: log.user ? `${log.user.firstName} ${log.user.lastName}` : 'Unknown',
          totalHours: 0,
          logCount: 0
        };
      }
      byUser[userId].totalHours += parseFloat(log.hours || 0);
      byUser[userId].logCount++;
    });

    // By project
    const byProject = {};
    timeLogs.forEach(log => {
      const projectId = log.task?.projectId;
      if (projectId) {
        if (!byProject[projectId]) {
          byProject[projectId] = {
            projectId,
            projectName: log.task?.project?.name || 'Unknown',
            totalHours: 0,
            logCount: 0
          };
        }
        byProject[projectId].totalHours += parseFloat(log.hours || 0);
        byProject[projectId].logCount++;
      }
    });

    // By task
    const byTask = {};
    timeLogs.forEach(log => {
      const taskId = log.taskId;
      if (!byTask[taskId]) {
        byTask[taskId] = {
          taskId,
          taskTitle: log.task?.title || 'Unknown',
          totalHours: 0,
          logCount: 0
        };
      }
      byTask[taskId].totalHours += parseFloat(log.hours || 0);
      byTask[taskId].logCount++;
    });

    // Daily breakdown (last 30 days)
    const dailyBreakdown = {};
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    timeLogs
      .filter(log => new Date(log.loggedDate) >= thirtyDaysAgo)
      .forEach(log => {
        const dateKey = new Date(log.loggedDate).toISOString().split('T')[0];
        if (!dailyBreakdown[dateKey]) {
          dailyBreakdown[dateKey] = 0;
        }
        dailyBreakdown[dateKey] += parseFloat(log.hours || 0);
      });

    res.status(200).json({
      success: true,
      data: {
        totalHours: totalHours.toFixed(2),
        totalLogs: timeLogs.length,
        byUser: Object.values(byUser),
        byProject: Object.values(byProject),
        byTask: Object.values(byTask).slice(0, 20), // Top 20 tasks
        dailyBreakdown: Object.entries(dailyBreakdown).map(([date, hours]) => ({ date, hours: hours.toFixed(2) }))
      }
    });
  } catch (error) {
    logger.error('Get time statistics error:', error);
    next(error);
  }
};

/**
 * @desc    Update time log
 * @route   PUT /api/v1/time-logs/:id
 * @access  Private
 */
const updateTimeLog = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { hours, minutes, description, date, isBillable } = req.body;
    const userId = req.user.id;

    const timeLog = await TimeLog.findByPk(id);
    if (!timeLog) {
      return res.status(404).json({
        success: false,
        error: 'Time log not found'
      });
    }

    // Check ownership (users can only edit their own logs unless admin)
    if (timeLog.userId !== userId && req.user.role !== 'super_admin' && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'You can only edit your own time logs'
      });
    }

    const updateData = {};
    if (hours !== undefined || minutes !== undefined) {
      const totalMinutes = (hours || 0) * 60 + (minutes || 0);
      updateData.hours = totalMinutes / 60;
    }
    if (description !== undefined) updateData.description = description;
    if (date !== undefined) updateData.loggedDate = date;
    if (isBillable !== undefined) updateData.isBillable = isBillable === true || isBillable === 'true';

    await timeLog.update(updateData);

    res.status(200).json({
      success: true,
      data: timeLog
    });
  } catch (error) {
    logger.error('Update time log error:', error);
    next(error);
  }
};

/**
 * @desc    Delete time log
 * @route   DELETE /api/v1/time-logs/:id
 * @access  Private
 */
const deleteTimeLog = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const timeLog = await TimeLog.findByPk(id);
    if (!timeLog) {
      return res.status(404).json({
        success: false,
        error: 'Time log not found'
      });
    }

    // Check ownership
    if (timeLog.userId !== userId && req.user.role !== 'super_admin' && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'You can only delete your own time logs'
      });
    }

    await timeLog.destroy();

    res.status(200).json({
      success: true,
      message: 'Time log deleted successfully'
    });
  } catch (error) {
    logger.error('Delete time log error:', error);
    next(error);
  }
};

module.exports = {
  createTimeLog,
  getTimeLogs,
  getTimeStatistics,
  updateTimeLog,
  deleteTimeLog
};

