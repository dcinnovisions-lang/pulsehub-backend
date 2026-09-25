const { Task } = require('../models');
const { Op } = require('sequelize');
const logger = require('../utils/logger');

/**
 * @desc    Bulk create tasks
 * @route   POST /api/v1/tasks/bulk
 * @access  Private
 */
const bulkCreateTasks = async (req, res, next) => {
  try {
    const { tasks } = req.body;

    if (!Array.isArray(tasks) || tasks.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Tasks array is required'
      });
    }

    const createdTasks = await Task.bulkCreate(
      tasks.map(task => ({
        ...task,
        createdBy: req.user.id
      })),
      { individualHooks: true }
    );

    res.status(201).json({
      success: true,
      count: createdTasks.length,
      data: createdTasks
    });
  } catch (error) {
    logger.error('Bulk create tasks error:', error);
    next(error);
  }
};

/**
 * @desc    Bulk update tasks
 * @route   PUT /api/v1/tasks/bulk
 * @access  Private
 */
const bulkUpdateTasks = async (req, res, next) => {
  try {
    const { taskIds, updates } = req.body;

    if (!Array.isArray(taskIds) || taskIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Task IDs array is required'
      });
    }

    await Task.update(updates, {
      where: {
        id: {
          [Op.in]: taskIds
        }
      }
    });

    res.status(200).json({
      success: true,
      message: `${taskIds.length} tasks updated successfully`
    });
  } catch (error) {
    logger.error('Bulk update tasks error:', error);
    next(error);
  }
};

/**
 * @desc    Bulk delete tasks
 * @route   DELETE /api/v1/tasks/bulk
 * @access  Private
 */
const bulkDeleteTasks = async (req, res, next) => {
  try {
    const { taskIds } = req.body;

    if (!Array.isArray(taskIds) || taskIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Task IDs array is required'
      });
    }

    await Task.update(
      { isArchived: true },
      {
        where: {
          id: {
            [Op.in]: taskIds
          }
        }
      }
    );

    res.status(200).json({
      success: true,
      message: `${taskIds.length} tasks archived successfully`
    });
  } catch (error) {
    logger.error('Bulk delete tasks error:', error);
    next(error);
  }
};

/**
 * @desc    Bulk archive tasks
 * @route   POST /api/v1/tasks/bulk-archive
 * @access  Private
 */
const bulkArchiveTasks = async (req, res, next) => {
  try {
    const { taskIds } = req.body;

    if (!Array.isArray(taskIds) || taskIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Task IDs array is required'
      });
    }

    await Task.update(
      { isArchived: true },
      {
        where: {
          id: {
            [Op.in]: taskIds
          }
        }
      }
    );

    res.status(200).json({
      success: true,
      message: `${taskIds.length} tasks archived successfully`
    });
  } catch (error) {
    logger.error('Bulk archive tasks error:', error);
    next(error);
  }
};

module.exports = {
  bulkCreateTasks,
  bulkUpdateTasks,
  bulkDeleteTasks,
  bulkArchiveTasks
};
