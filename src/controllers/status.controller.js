const { Status, Project, Task } = require('../models');
const { Op } = require('sequelize');
const logger = require('../utils/logger');

/**
 * @desc    Get all statuses for a project
 * @route   GET /api/v1/projects/:projectId/statuses
 * @access  Private
 */
const getStatusesByProject = async (req, res, next) => {
  try {
    const { projectId } = req.params;

    // Verify project exists
    const project = await Project.findByPk(projectId);
    if (!project) {
      return res.status(404).json({
        success: false,
        error: 'Project not found'
      });
    }

    let statuses = await Status.findAll({
      where: { projectId },
      order: [['position', 'ASC'], ['createdAt', 'ASC']],
      include: [
        {
          model: Task,
          as: 'tasks',
          attributes: ['id'],
          required: false
        }
      ]
    });

    // If no statuses exist, create default statuses (for existing projects)
    if (statuses.length === 0) {
      const defaultStatuses = [
        { name: 'To Do', color: '#94A3B8', position: 0, isDefault: true },
        { name: 'In Progress', color: '#3B82F6', position: 1, isDefault: false },
        { name: 'Done', color: '#10B981', position: 2, isDefault: false }
      ];

      await Promise.all(
        defaultStatuses.map(status => 
          Status.create({
            ...status,
            projectId: project.id
          })
        )
      );

      // Reload statuses after creation
      statuses = await Status.findAll({
        where: { projectId },
        order: [['position', 'ASC'], ['createdAt', 'ASC']],
        include: [
          {
            model: Task,
            as: 'tasks',
            attributes: ['id'],
            required: false
          }
        ]
      });
    }

    // Add task count to each status
    const statusesWithCount = statuses.map(status => {
      const statusData = status.toJSON();
      statusData.taskCount = statusData.tasks ? statusData.tasks.length : 0;
      delete statusData.tasks;
      return statusData;
    });

    res.status(200).json({
      success: true,
      count: statusesWithCount.length,
      data: statusesWithCount
    });
  } catch (error) {
    logger.error('Get statuses by project error:', error);
    next(error);
  }
};

/**
 * @desc    Create status for a project
 * @route   POST /api/v1/projects/:projectId/statuses
 * @access  Private (Admin/PM only)
 */
const createStatus = async (req, res, next) => {
  try {
    const { projectId } = req.params;
    const { name, color, position, isDefault } = req.body;

    // Verify project exists
    const project = await Project.findByPk(projectId);
    if (!project) {
      return res.status(404).json({
        success: false,
        error: 'Project not found'
      });
    }

    // Check if status with same name already exists
    const existingStatus = await Status.findOne({
      where: { projectId, name: { [Op.iLike]: name } }
    });

    if (existingStatus) {
      return res.status(400).json({
        success: false,
        error: 'Status with this name already exists'
      });
    }

    // Get max position if not provided
    let statusPosition = position;
    if (statusPosition === undefined || statusPosition === null) {
      const maxStatus = await Status.findOne({
        where: { projectId },
        order: [['position', 'DESC']],
        attributes: ['position']
      });
      statusPosition = maxStatus ? maxStatus.position + 1 : 0;
    }

    // If this is set as default, unset other defaults
    if (isDefault) {
      await Status.update(
        { isDefault: false },
        { where: { projectId } }
      );
    }

    const status = await Status.create({
      name,
      projectId,
      color: color || '#94A3B8',
      position: statusPosition,
      isDefault: isDefault || false
    });

    res.status(201).json({
      success: true,
      data: status
    });
  } catch (error) {
    logger.error('Create status error:', error);
    next(error);
  }
};

/**
 * @desc    Update status
 * @route   PUT /api/v1/statuses/:id
 * @access  Private (Admin/PM only)
 */
const updateStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, color, position, isDefault } = req.body;

    const status = await Status.findByPk(id);
    if (!status) {
      return res.status(404).json({
        success: false,
        error: 'Status not found'
      });
    }

    // Check if name is being changed and if it conflicts
    if (name && name !== status.name) {
      const existingStatus = await Status.findOne({
        where: {
          projectId: status.projectId,
          name: { [Op.iLike]: name },
          id: { [Op.ne]: id }
        }
      });

      if (existingStatus) {
        return res.status(400).json({
          success: false,
          error: 'Status with this name already exists'
        });
      }
    }

    // If setting as default, unset other defaults in project
    if (isDefault === true && !status.isDefault) {
      await Status.update(
        { isDefault: false },
        { where: { projectId: status.projectId, id: { [Op.ne]: id } } }
      );
    }

    await status.update({
      ...(name && { name }),
      ...(color && { color }),
      ...(position !== undefined && { position }),
      ...(isDefault !== undefined && { isDefault })
    });

    res.status(200).json({
      success: true,
      data: status
    });
  } catch (error) {
    logger.error('Update status error:', error);
    next(error);
  }
};

/**
 * @desc    Delete status
 * @route   DELETE /api/v1/statuses/:id
 * @access  Private (Admin only)
 */
const deleteStatus = async (req, res, next) => {
  try {
    const { id } = req.params;

    const status = await Status.findByPk(id, {
      include: [
        {
          model: Task,
          as: 'tasks',
          attributes: ['id'],
          required: false
        }
      ]
    });

    if (!status) {
      return res.status(404).json({
        success: false,
        error: 'Status not found'
      });
    }

    // Check if status has tasks
    const taskCount = status.tasks ? status.tasks.length : 0;
    if (taskCount > 0) {
      return res.status(400).json({
        success: false,
        error: `Cannot delete status: ${taskCount} task(s) are using this status. Please reassign tasks before deleting.`
      });
    }

    await status.destroy();

    res.status(200).json({
      success: true,
      message: 'Status deleted successfully'
    });
  } catch (error) {
    logger.error('Delete status error:', error);
    next(error);
  }
};

module.exports = {
  getStatusesByProject,
  createStatus,
  updateStatus,
  deleteStatus
};

