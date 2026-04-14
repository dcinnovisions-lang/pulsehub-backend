const { Task, Subtask, User } = require('../models');
const logger = require('../utils/logger');

/**
 * @desc    Create subtask
 * @route   POST /api/v1/tasks/:taskId/subtasks
 * @access  Private
 */
const createSubtask = async (req, res, next) => {
  try {
    const { taskId } = req.params;
    const { title, assigneeId, dueDate, estimatedHours } = req.body;

    // Verify task exists
    const task = await Task.findByPk(taskId);
    if (!task) {
      return res.status(404).json({
        success: false,
        error: 'Task not found'
      });
    }

    // Get max position for subtasks
    const maxPosition = await Subtask.max('position', {
      where: { taskId }
    }) || 0;

    const subtask = await Subtask.create({
      taskId,
      title,
      position: maxPosition + 1,
      isCompleted: false,
      assigneeId: assigneeId || null,
      dueDate: dueDate || null,
      estimatedHours: estimatedHours || null
    });

    // Reload with assignee
    await subtask.reload({
      include: [{
        model: User,
        as: 'assignee',
        attributes: ['id', 'email', 'firstName', 'lastName', 'avatar']
      }]
    });

    res.status(201).json({
      success: true,
      data: subtask
    });
  } catch (error) {
    logger.error('Create subtask error:', error);
    next(error);
  }
};

/**
 * @desc    Update subtask
 * @route   PUT /api/v1/tasks/:taskId/subtasks/:subtaskId
 * @access  Private
 */
const updateSubtask = async (req, res, next) => {
  try {
    const { taskId, subtaskId } = req.params;
    const { title, isCompleted, assigneeId, dueDate, estimatedHours } = req.body;

    const subtask = await Subtask.findOne({
      where: { id: subtaskId, taskId }
    });

    if (!subtask) {
      return res.status(404).json({
        success: false,
        error: 'Subtask not found'
      });
    }

    await subtask.update({
      title: title !== undefined ? title : subtask.title,
      isCompleted: isCompleted !== undefined ? isCompleted : subtask.isCompleted,
      assigneeId: assigneeId !== undefined ? assigneeId : subtask.assigneeId,
      dueDate: dueDate !== undefined ? dueDate : subtask.dueDate,
      estimatedHours: estimatedHours !== undefined ? estimatedHours : subtask.estimatedHours
    });

    // Reload with assignee
    await subtask.reload({
      include: [{
        model: User,
        as: 'assignee',
        attributes: ['id', 'email', 'firstName', 'lastName', 'avatar']
      }]
    });

    res.status(200).json({
      success: true,
      data: subtask
    });
  } catch (error) {
    logger.error('Update subtask error:', error);
    next(error);
  }
};

/**
 * @desc    Delete subtask
 * @route   DELETE /api/v1/tasks/:taskId/subtasks/:subtaskId
 * @access  Private
 */
const deleteSubtask = async (req, res, next) => {
  try {
    const { taskId, subtaskId } = req.params;

    const subtask = await Subtask.findOne({
      where: { id: subtaskId, taskId }
    });

    if (!subtask) {
      return res.status(404).json({
        success: false,
        error: 'Subtask not found'
      });
    }

    await subtask.destroy();

    res.status(200).json({
      success: true,
      data: {}
    });
  } catch (error) {
    logger.error('Delete subtask error:', error);
    next(error);
  }
};

/**
 * @desc    List subtasks for a task
 * @route   GET /api/v1/tasks/:taskId/subtasks
 * @access  Private
 */
const getSubtasks = async (req, res, next) => {
  try {
    const { taskId } = req.params;

    const task = await Task.findByPk(taskId);
    if (!task) {
      return res.status(404).json({ success: false, error: 'Task not found' });
    }

    const subtasks = await Subtask.findAll({
      where: { taskId },
      include: [{
        model: User,
        as: 'assignee',
        attributes: ['id', 'email', 'firstName', 'lastName', 'avatar']
      }],
      order: [['position', 'ASC']]
    });

    res.status(200).json({ success: true, data: subtasks });
  } catch (error) {
    logger.error('Get subtasks error:', error);
    next(error);
  }
};

module.exports = {
  getSubtasks,
  createSubtask,
  updateSubtask,
  deleteSubtask
};
