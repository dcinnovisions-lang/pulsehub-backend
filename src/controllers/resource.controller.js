const { Resource, User, Workspace, TimeLog, Task, Project } = require('../models');
const { Op } = require('sequelize');
const logger = require('../utils/logger');

/**
 * @desc    Get resource allocation and workload
 * @route   GET /api/v1/resources/workload
 * @access  Private
 */
const getWorkload = async (req, res, next) => {
  try {
    const { workspaceId, startDate, endDate } = req.query;

    const whereClause = {};
    if (workspaceId) {
      whereClause.workspaceId = workspaceId;
    }

    // Get all resources
    const resources = await Resource.findAll({
      where: whereClause,
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['id', 'firstName', 'lastName', 'email', 'avatar']
        },
        {
          model: Workspace,
          as: 'workspace',
          attributes: ['id', 'name'],
          required: false
        }
      ]
    });

    // Calculate workload for each resource
    const workloadData = await Promise.all(
      resources.map(async (resource) => {
        // Get assigned tasks
        const assignedTasks = await Task.findAll({
          include: [
            {
              model: User,
              as: 'assignees',
              where: { id: resource.userId },
              attributes: [],
              through: { attributes: [] }
            },
            {
              model: Project,
              as: 'project',
              attributes: ['id', 'name'],
              required: false
            }
          ],
          where: {
            isArchived: false,
            ...(startDate && endDate ? {
              [Op.or]: [
                { dueDate: { [Op.between]: [new Date(startDate), new Date(endDate)] } },
                { startDate: { [Op.between]: [new Date(startDate), new Date(endDate)] } }
              ]
            } : {})
          }
        });

        // Get time logs for the period
        const timeLogWhere = {
          userId: resource.userId
        };

        if (startDate && endDate) {
          timeLogWhere.loggedDate = {
            [Op.between]: [new Date(startDate), new Date(endDate)]
          };
        }

        const timeLogs = await TimeLog.findAll({
          where: timeLogWhere,
          include: [
            {
              model: Task,
              as: 'task',
              attributes: ['id', 'title'],
              required: false
            }
          ]
        });

        const totalHoursLogged = timeLogs.reduce((sum, log) => sum + parseFloat(log.hours || 0), 0);
        const capacityHours = parseFloat(resource.capacityHours || 40);
        const utilization = capacityHours > 0 ? (totalHoursLogged / capacityHours) * 100 : 0;

        // Calculate estimated hours from tasks
        const estimatedHours = assignedTasks.reduce((sum, task) => {
          return sum + parseFloat(task.estimatedHours || 0);
        }, 0);

        return {
          resourceId: resource.id,
          userId: resource.userId,
          user: resource.user,
          workspace: resource.workspace,
          capacityHours,
          availability: resource.availability,
          assignedTasksCount: assignedTasks.length,
          estimatedHours,
          loggedHours: totalHoursLogged,
          utilization: Math.round(utilization),
          isOverallocated: utilization > 100,
          tasks: assignedTasks.map(t => ({
            id: t.id,
            title: t.title,
            estimatedHours: t.estimatedHours,
            project: t.project
          }))
        };
      })
    );

    res.status(200).json({
      success: true,
      data: {
        resources: workloadData,
        totalResources: workloadData.length,
        overallocatedCount: workloadData.filter(r => r.isOverallocated).length,
        averageUtilization: workloadData.length > 0
          ? Math.round(workloadData.reduce((sum, r) => sum + r.utilization, 0) / workloadData.length)
          : 0
      }
    });
  } catch (error) {
    logger.error('Get workload error:', error);
    next(error);
  }
};

/**
 * @desc    Create or update resource
 * @route   POST /api/v1/resources
 * @access  Private (Admin only)
 */
const createOrUpdateResource = async (req, res, next) => {
  try {
    const { userId, workspaceId, capacityHours, availability, skills, hourlyRate } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'userId is required'
      });
    }

    // Check if resource exists
    let resource = await Resource.findOne({
      where: { userId, workspaceId: workspaceId || null }
    });

    if (resource) {
      // Update existing
      await resource.update({
        capacityHours: capacityHours !== undefined ? capacityHours : resource.capacityHours,
        availability: availability || resource.availability,
        skills: skills !== undefined ? skills : resource.skills,
        hourlyRate: hourlyRate !== undefined ? hourlyRate : resource.hourlyRate
      });
    } else {
      // Create new
      resource = await Resource.create({
        userId,
        workspaceId: workspaceId || null,
        capacityHours: capacityHours || 40,
        availability: availability || 'available',
        skills: skills || [],
        hourlyRate: hourlyRate || null
      });
    }

    res.status(200).json({
      success: true,
      data: resource
    });
  } catch (error) {
    logger.error('Create/update resource error:', error);
    next(error);
  }
};

/**
 * @desc    List resources for a workspace
 * @route   GET /api/v1/resources
 * @access  Private
 */
const listResources = async (req, res, next) => {
  try {
    const { workspaceId } = req.query;
    const where = workspaceId ? { workspaceId } : {};

    const resources = await Resource.findAll({
      where,
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['id', 'firstName', 'lastName', 'email', 'avatar']
        },
        {
          model: Workspace,
          as: 'workspace',
          attributes: ['id', 'name'],
          required: false
        }
      ],
      order: [['createdAt', 'DESC']]
    });

    res.status(200).json({ success: true, data: resources });
  } catch (error) {
    logger.error('List resources error:', error);
    next(error);
  }
};

const updateResource = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, type, capacity, availability, workspaceId, capacityHours, skills, hourlyRate } = req.body;

    const resource = await Resource.findByPk(id);
    if (!resource) {
      return res.status(404).json({ success: false, error: 'Resource not found' });
    }

    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (type !== undefined) updateData.type = type;
    if (capacity !== undefined) updateData.capacity = capacity;
    if (availability !== undefined) updateData.availability = availability;
    if (workspaceId !== undefined) updateData.workspaceId = workspaceId;
    if (capacityHours !== undefined) updateData.capacityHours = capacityHours;
    if (skills !== undefined) updateData.skills = skills;
    if (hourlyRate !== undefined) updateData.hourlyRate = hourlyRate;

    await resource.update(updateData);

    res.status(200).json({ success: true, data: resource });
  } catch (error) {
    logger.error('Update resource error:', error);
    next(error);
  }
};

const deleteResource = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const userRole = req.user.role;

    const resource = await Resource.findByPk(id, {
      include: [{ model: Workspace, as: 'workspace', attributes: ['id', 'ownerId'] }]
    });
    if (!resource) {
      return res.status(404).json({ success: false, error: 'Resource not found' });
    }

    if (userRole !== 'super_admin') {
      const workspaceId = resource.workspaceId;
      if (!workspaceId) {
        return res.status(403).json({ success: false, error: 'Access denied' });
      }
      const isOwner = resource.workspace && resource.workspace.ownerId === userId;
      if (!isOwner) {
        const { WorkspaceMembers } = require('../models');
        const member = await WorkspaceMembers.findOne({ where: { workspaceId, userId } });
        if (!member || !['owner', 'admin'].includes(member.role)) {
          return res.status(403).json({ success: false, error: 'You do not have permission to delete this resource' });
        }
      }
    }

    await resource.destroy();

    res.status(200).json({ success: true, message: 'Resource deleted' });
  } catch (error) {
    logger.error('Delete resource error:', error);
    next(error);
  }
};

module.exports = {
  listResources,
  getWorkload,
  createOrUpdateResource,
  updateResource,
  deleteResource
};

