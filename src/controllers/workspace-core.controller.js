const { Workspace, User, Project, Task, sequelize, WorkspaceMembers } = require('../models');
const { Op } = require('sequelize');
const logger = require('../utils/logger');
const { createActivityLog } = require('./activityLog.controller');

// Helper to choose Workspace model access depending on query and role
const getWorkspaceModel = (req) => {
  if (req.user && req.user.role === 'super_admin' && req.query && req.query.includeDeleted === 'true') {
    return Workspace.unscoped();
  }
  return Workspace;
};

// Normalize workspace object(s) to ensure `isActive` is always an explicit boolean
const normalizeWorkspace = (ws) => {
  if (!ws) return ws;
  const obj = typeof ws.toJSON === 'function' ? ws.toJSON() : { ...ws };
  obj.isActive = obj.isActive === false ? false : true;
  return obj;
};

const normalizeWorkspaces = (list) => (Array.isArray(list) ? list.map(normalizeWorkspace) : list);

/**
 * @desc    Get all workspaces for current user
 * @route   GET /api/v1/workspaces
 * @access  Private
 */
const getWorkspaces = async (req, res, next) => {
  try {
    const model = getWorkspaceModel(req);

    // Build where clause (default scope on model filters inactive workspaces)
    let whereClause = {};

    if (req.user.role !== 'super_admin') {
      // Regular users only see workspaces they own or are members of
      whereClause = {
        [Op.or]: [
          { ownerId: req.user.id },
          { '$members.id$': req.user.id }
        ]
      };
    }

    const workspaces = await model.findAll({
      where: whereClause,
      include: [
        {
          model: User,
          as: 'owner',
          attributes: ['id', 'email', 'firstName', 'lastName', 'avatar']
        },
        {
          model: User,
          as: 'members',
          attributes: ['id', 'email', 'firstName', 'lastName', 'avatar'],
          through: { attributes: ['role'] }
        }
      ],
      order: [['createdAt', 'DESC']]
    });

    res.status(200).json({
      success: true,
      count: workspaces.length,
      data: normalizeWorkspaces(workspaces)
    });
  } catch (error) {
    logger.error('Get workspaces error:', error);
    next(error);
  }
};

/**
 * @desc    Get workspace by ID
 * @route   GET /api/v1/workspaces/:id
 * @access  Private
 */
const getWorkspaceById = async (req, res, next) => {
  try {
    const model = getWorkspaceModel(req);
    const workspace = await model.findByPk(req.params.id, {
      include: [
        {
          model: User,
          as: 'owner',
          attributes: ['id', 'email', 'firstName', 'lastName', 'avatar']
        },
        {
          model: User,
          as: 'members',
          attributes: ['id', 'email', 'firstName', 'lastName', 'avatar'],
          through: { attributes: [] }
        }
      ]
    });

    if (!workspace) {
      return res.status(404).json({
        success: false,
        error: 'Workspace not found'
      });
    }

    res.status(200).json({
      success: true,
      data: normalizeWorkspace(workspace)
    });
  } catch (error) {
    logger.error('Get workspace by ID error:', error);
    next(error);
  }
};

/**
 * @desc    Create workspace
 * @route   POST /api/v1/workspaces
 * @access  Private
 */
const createWorkspace = async (req, res, next) => {
  try {
    const { name, description, ownerId } = req.body;

    // Any authenticated user can create a workspace for themselves.
    // Only super_admin can assign a workspace to a different user.
    let finalOwnerId = req.user.id;

    if (ownerId && req.user.role === 'super_admin') {
      // Verify the target user exists
      const targetUser = await User.findByPk(ownerId);
      if (!targetUser) {
        return res.status(404).json({
          success: false,
          error: 'Target user not found'
        });
      }
      finalOwnerId = ownerId;
    } else if (ownerId && req.user.role !== 'super_admin') {
      return res.status(403).json({
        success: false,
        error: 'Only super admin can assign workspace to other users'
      });
    }

    const workspace = await Workspace.create({
      name,
      description,
      ownerId: finalOwnerId
    });

    // RBAC V2 — STEP 13
    // Add the workspace owner to workspace_members with role='owner'.
    // This is required so the permission middleware can resolve their role
    // from workspace_members (instead of relying on the ownerId check alone).
    await WorkspaceMembers.create({
      workspaceId: workspace.id,
      userId: finalOwnerId,
      role: 'owner'
    });

    // If super admin created workspace for someone else, also add them as admin member
    if (req.user.role === 'super_admin' && finalOwnerId !== req.user.id) {
      await WorkspaceMembers.create({
        workspaceId: workspace.id,
        userId: req.user.id,
        role: 'admin'
      });
    }

    // Reload with associations
    await workspace.reload({
      include: [
        {
          model: User,
          as: 'owner',
          attributes: ['id', 'email', 'firstName', 'lastName', 'avatar']
        },
        {
          model: User,
          as: 'members',
          attributes: ['id', 'email', 'firstName', 'lastName', 'avatar'],
          through: { attributes: ['role'] }
        }
      ]
    });

    res.status(201).json({
      success: true,
      data: normalizeWorkspace(workspace)
    });
  } catch (error) {
    logger.error('Create workspace error:', error);
    next(error);
  }
};

/**
 * @desc    Update workspace
 * @route   PUT /api/v1/workspaces/:id
 * @access  Private
 */
const updateWorkspace = async (req, res, next) => {
  try {
    const model = getWorkspaceModel(req);
    const workspace = await model.findByPk(req.params.id);

    if (!workspace) {
      return res.status(404).json({
        success: false,
        error: 'Workspace not found'
      });
    }

    const { name, description, ownerId } = req.body;

    // Super admin can transfer ownership
    if (ownerId && req.user.role === 'super_admin' && ownerId !== workspace.ownerId) {
      const targetUser = await User.findByPk(ownerId);
      if (!targetUser) {
        return res.status(404).json({
          success: false,
          error: 'Target user not found'
        });
      }

      // Transfer ownership
      await workspace.update({ ownerId });

      // Add previous owner as admin member if not super admin
      if (workspace.ownerId !== req.user.id) {
        const existingMember = await WorkspaceMembers.findOne({
          where: { workspaceId: workspace.id, userId: workspace.ownerId }
        });
        if (!existingMember) {
          await WorkspaceMembers.create({
            workspaceId: workspace.id,
            userId: workspace.ownerId,
            role: 'admin'
          });
        }
      }
    }

    await workspace.update({
      name: name || workspace.name,
      description: description !== undefined ? description : workspace.description
    });

    // Reload with associations
    await workspace.reload({
      include: [
        {
          model: User,
          as: 'owner',
          attributes: ['id', 'email', 'firstName', 'lastName', 'avatar']
        }
      ]
    });

    res.status(200).json({
      success: true,
      data: normalizeWorkspace(workspace)
    });
  } catch (error) {
    logger.error('Update workspace error:', error);
    next(error);
  }
};

/**
 * @desc    Search users by email
 * @route   GET /api/v1/users/search
 * @access  Private
 */
const searchUsers = async (req, res, next) => {
  try {
    const { email, q } = req.query;

    const whereClause = {};
    if (email) {
      whereClause.email = { [Op.iLike]: `%${email}%` };
    } else if (q) {
      whereClause[Op.or] = [
        { email: { [Op.iLike]: `%${q}%` } },
        { firstName: { [Op.iLike]: `%${q}%` } },
        { lastName: { [Op.iLike]: `%${q}%` } }
      ];
    }

    const users = await User.findAll({
      where: whereClause,
      attributes: ['id', 'email', 'firstName', 'lastName', 'avatar', 'role'],
      limit: 20
    });

    res.status(200).json({
      success: true,
      count: users.length,
      data: users
    });
  } catch (error) {
    logger.error('Search users error:', error);
    next(error);
  }
};

module.exports = {
  getWorkspaceModel,
  normalizeWorkspace,
  normalizeWorkspaces,
  getWorkspaces,
  getWorkspaceById,
  createWorkspace,
  updateWorkspace,
  searchUsers,
};
