const { SavedView, User, Workspace, Project } = require('../models');
const { Op } = require('sequelize');
const logger = require('../utils/logger');

/**
 * @desc    Get all saved views for user
 * @route   GET /api/v1/saved-views
 * @access  Private
 */
const getSavedViews = async (req, res, next) => {
  try {
    const { workspaceId, projectId, viewType } = req.query;
    const userId = req.user.id;

    const whereClause = {
      [Op.or]: [
        { userId },
        { isPublic: true }
      ]
    };

    if (workspaceId) {
      whereClause.workspaceId = workspaceId;
    }

    if (projectId) {
      whereClause.projectId = projectId;
    }

    if (viewType) {
      whereClause.viewType = viewType;
    }

    const views = await SavedView.findAll({
      where: whereClause,
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['id', 'firstName', 'lastName', 'email']
        },
        {
          model: Workspace,
          as: 'workspace',
          attributes: ['id', 'name'],
          required: false
        },
        {
          model: Project,
          as: 'project',
          attributes: ['id', 'name'],
          required: false
        }
      ],
      order: [['isDefault', 'DESC'], ['createdAt', 'DESC']]
    });

    res.status(200).json({
      success: true,
      count: views.length,
      data: views
    });
  } catch (error) {
    logger.error('Get saved views error:', error);
    next(error);
  }
};

/**
 * @desc    Get saved view by ID
 * @route   GET /api/v1/saved-views/:id
 * @access  Private
 */
const getSavedViewById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const view = await SavedView.findOne({
      where: {
        id,
        [Op.or]: [
          { userId },
          { isPublic: true }
        ]
      },
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['id', 'firstName', 'lastName', 'email']
        }
      ]
    });

    if (!view) {
      return res.status(404).json({
        success: false,
        error: 'Saved view not found'
      });
    }

    res.status(200).json({
      success: true,
      data: view
    });
  } catch (error) {
    logger.error('Get saved view error:', error);
    next(error);
  }
};

/**
 * @desc    Create saved view
 * @route   POST /api/v1/saved-views
 * @access  Private
 */
const createSavedView = async (req, res, next) => {
  try {
    const {
      name,
      workspaceId,
      projectId,
      viewType,
      filters,
      sortBy,
      groupBy,
      columns,
      isDefault,
      isPublic
    } = req.body;
    const userId = req.user.id;

    // If setting as default, unset other defaults for same scope
    if (isDefault) {
      const defaultWhere = {
        userId,
        isDefault: true
      };
      if (workspaceId) defaultWhere.workspaceId = workspaceId;
      if (projectId) defaultWhere.projectId = projectId;
      if (viewType) defaultWhere.viewType = viewType;

      await SavedView.update(
        { isDefault: false },
        { where: defaultWhere }
      );
    }

    const view = await SavedView.create({
      name,
      userId,
      workspaceId: workspaceId || null,
      projectId: projectId || null,
      viewType: viewType || 'list',
      filters: filters || null,
      sortBy: sortBy || null,
      groupBy: groupBy || null,
      columns: columns || null,
      isDefault: isDefault || false,
      isPublic: isPublic || false
    });

    res.status(201).json({
      success: true,
      data: view
    });
  } catch (error) {
    logger.error('Create saved view error:', error);
    next(error);
  }
};

/**
 * @desc    Update saved view
 * @route   PUT /api/v1/saved-views/:id
 * @access  Private
 */
const updateSavedView = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const {
      name,
      filters,
      sortBy,
      groupBy,
      columns,
      isDefault,
      isPublic
    } = req.body;

    const view = await SavedView.findOne({
      where: { id, userId }
    });

    if (!view) {
      return res.status(404).json({
        success: false,
        error: 'Saved view not found'
      });
    }

    // If setting as default, unset other defaults
    if (isDefault && !view.isDefault) {
      const defaultWhere = {
        userId,
        isDefault: true
      };
      if (view.workspaceId) defaultWhere.workspaceId = view.workspaceId;
      if (view.projectId) defaultWhere.projectId = view.projectId;
      if (view.viewType) defaultWhere.viewType = view.viewType;

      await SavedView.update(
        { isDefault: false },
        { where: defaultWhere }
      );
    }

    await view.update({
      name: name !== undefined ? name : view.name,
      filters: filters !== undefined ? filters : view.filters,
      sortBy: sortBy !== undefined ? sortBy : view.sortBy,
      groupBy: groupBy !== undefined ? groupBy : view.groupBy,
      columns: columns !== undefined ? columns : view.columns,
      isDefault: isDefault !== undefined ? isDefault : view.isDefault,
      isPublic: isPublic !== undefined ? isPublic : view.isPublic
    });

    res.status(200).json({
      success: true,
      data: view
    });
  } catch (error) {
    logger.error('Update saved view error:', error);
    next(error);
  }
};

/**
 * @desc    Delete saved view
 * @route   DELETE /api/v1/saved-views/:id
 * @access  Private
 */
const deleteSavedView = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const view = await SavedView.findOne({
      where: { id, userId }
    });

    if (!view) {
      return res.status(404).json({
        success: false,
        error: 'Saved view not found'
      });
    }

    await view.destroy();

    res.status(200).json({
      success: true,
      message: 'Saved view deleted successfully'
    });
  } catch (error) {
    logger.error('Delete saved view error:', error);
    next(error);
  }
};

module.exports = {
  getSavedViews,
  getSavedViewById,
  createSavedView,
  updateSavedView,
  deleteSavedView
};




