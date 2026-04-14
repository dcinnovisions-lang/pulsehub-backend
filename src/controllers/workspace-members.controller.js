const { Workspace, User, WorkspaceMembers, Project } = require('../models');
const sequelize = require('../models').sequelize;
const logger = require('../utils/logger');
const { createActivityLog } = require('./activityLog.controller');
const { createNotification } = require('./notification.controller');
const { getIO } = require('../socket');
const { getWorkspaceModel, normalizeWorkspace } = require('./workspace-core.controller');

/**
 * @desc    Get workspace members
 * @route   GET /api/v1/workspaces/:id/members
 * @access  Private
 */
const getWorkspaceMembers = async (req, res, next) => {
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
          through: { attributes: ['role'] }
        }
      ]
    });

    if (!workspace) {
      return res.status(404).json({
        success: false,
        error: 'Workspace not found'
      });
    }

    // Combine owner and members — deduplicate so the owner isn't listed twice
    // (owner is also inserted into workspace_members with role='owner' on creation)
    const allMembers = [
      { ...workspace.owner.toJSON(), role: 'owner' },
      ...workspace.members
        .filter(member => member.id !== workspace.ownerId)
        .map(member => ({
          ...member.toJSON(),
          role: member.WorkspaceMembers?.role || 'member'
        }))
    ];

    res.status(200).json({
      success: true,
      count: allMembers.length,
      data: allMembers
    });
  } catch (error) {
    logger.error('Get workspace members error:', error);
    next(error);
  }
};

/**
 * @desc    Add member to workspace
 * @route   POST /api/v1/workspaces/:id/members
 * @access  Private
 */
const addWorkspaceMember = async (req, res, next) => {
  try {
    const model = getWorkspaceModel(req);
    const workspace = await model.findByPk(req.params.id);

    if (!workspace) {
      return res.status(404).json({
        success: false,
        error: 'Workspace not found'
      });
    }

    // Super admin can always add members
    if (req.user.role !== 'super_admin') {
      // Check if user is owner or admin
      if (workspace.ownerId !== req.user.id) {
        const member = await WorkspaceMembers.findOne({
          where: { workspaceId: workspace.id, userId: req.user.id }
        });
        if (!member || (member.role !== 'admin' && member.role !== 'pm')) {
          return res.status(403).json({
            success: false,
            error: 'Not authorized to add members'
          });
        }
      }
    }

    const { email, role = 'member' } = req.body;

    // Validate role — prevent privilege escalation via crafted role values
    const ALLOWED_WORKSPACE_ROLES = ['admin', 'billing_admin', 'member', 'commenter', 'viewer', 'guest'];
    if (!ALLOWED_WORKSPACE_ROLES.includes(role)) {
      return res.status(400).json({
        success: false,
        error: `Invalid role. Allowed values: ${ALLOWED_WORKSPACE_ROLES.join(', ')}`
      });
    }

    // Find user by email
    const user = await User.findOne({ where: { email } });
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found with this email'
      });
    }

    // Check if user is already a member
    const existingMember = await WorkspaceMembers.findOne({
      where: { workspaceId: workspace.id, userId: user.id }
    });

    if (existingMember) {
      return res.status(400).json({
        success: false,
        error: 'User is already a member of this workspace'
      });
    }

    // Add member
    await WorkspaceMembers.create({
      workspaceId: workspace.id,
      userId: user.id,
      role
    });

    // Notify added user
    try {
      const actorName = `${req.user.firstName || ''} ${req.user.lastName || ''}`.trim() || 'Someone';
      await createNotification({
        userId:     user.id,
        type:       'workspace_member_added',
        title:      `You were added to "${workspace.name}"`,
        body:       `${actorName} added you to this workspace`,
        entityType: 'workspace',
        entityId:   workspace.id,
        actorId:    req.user.id,
        metadata:   { url: `/app/workspaces/${workspace.id}` }
      });
    } catch (notifErr) {
      logger.warn('Failed to send workspace_member_added notification', notifErr);
    }

    // Emit socket event to workspace room
    try {
      getIO().to(`workspace:${workspace.id}`).emit('member:added', {
        workspaceId: workspace.id,
        userId: user.id,
        role
      });
    } catch (socketErr) {
      logger.warn('Failed to emit member:added socket event', socketErr);
    }

    // Reload workspace with members
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
    logger.error('Add workspace member error:', error);
    next(error);
  }
};

/**
 * @desc    Update workspace member role
 * @route   PUT /api/v1/workspaces/:id/members/:userId
 * @access  Private
 */
const updateWorkspaceMemberRole = async (req, res, next) => {
  try {
    const model = getWorkspaceModel(req);
    const workspace = await model.findByPk(req.params.id);

    if (!workspace) {
      return res.status(404).json({
        success: false,
        error: 'Workspace not found'
      });
    }

    // Super admin can always update
    if (req.user.role !== 'super_admin') {
      // Check if user is owner or admin
      if (workspace.ownerId !== req.user.id) {
        const member = await WorkspaceMembers.findOne({
          where: { workspaceId: workspace.id, userId: req.user.id }
        });
        if (!member || member.role !== 'admin') {
          return res.status(403).json({
            success: false,
            error: 'Not authorized to update member roles'
          });
        }
      }
    }

    const { role } = req.body;
    const member = await WorkspaceMembers.findOne({
      where: { workspaceId: workspace.id, userId: req.params.userId }
    });

    if (!member) {
      return res.status(404).json({
        success: false,
        error: 'Member not found'
      });
    }

    await member.update({ role });

    res.status(200).json({
      success: true,
      data: member
    });
  } catch (error) {
    logger.error('Update workspace member role error:', error);
    next(error);
  }
};

/**
 * @desc    Remove member from workspace
 * @route   DELETE /api/v1/workspaces/:id/members/:userId
 * @access  Private
 */
const removeWorkspaceMember = async (req, res, next) => {
  try {
    const model = getWorkspaceModel(req);
    const workspace = await model.findByPk(req.params.id);

    if (!workspace) {
      return res.status(404).json({
        success: false,
        error: 'Workspace not found'
      });
    }

    // Super admin can always remove members
    if (req.user.role !== 'super_admin') {
      // Check if user is owner or admin
      if (workspace.ownerId !== req.user.id) {
        const member = await WorkspaceMembers.findOne({
          where: { workspaceId: workspace.id, userId: req.user.id }
        });
        if (!member || member.role !== 'admin') {
          return res.status(403).json({
            success: false,
            error: 'Not authorized to remove members'
          });
        }
      }
    }

    // Cannot remove owner
    if (workspace.ownerId === req.params.userId) {
      return res.status(400).json({
        success: false,
        error: 'Cannot remove workspace owner'
      });
    }

    await WorkspaceMembers.destroy({
      where: { workspaceId: workspace.id, userId: req.params.userId }
    });

    // Notify the removed user
    try {
      const actorName = `${req.user.firstName || ''} ${req.user.lastName || ''}`.trim() || 'Someone';
      await createNotification({
        userId:     req.params.userId,
        type:       'workspace_member_added', // reuse type — no workspace_member_removed type needed
        title:      `You were removed from "${workspace.name}"`,
        body:       `${actorName} removed you from this workspace`,
        entityType: 'workspace',
        entityId:   workspace.id,
        actorId:    req.user.id,
        metadata:   {}
      });
    } catch (notifErr) {
      logger.warn('Failed to send workspace member removed notification', notifErr);
    }

    res.status(200).json({
      success: true,
      message: 'Member removed successfully'
    });
  } catch (error) {
    logger.error('Remove workspace member error:', error);
    next(error);
  }
};

/**
 * @desc    Transfer workspace ownership to another member
 * @route   PUT /api/v1/workspaces/:id/transfer-ownership
 * @access  Private (super_admin or current owner)
 */
const transferWorkspaceOwnership = async (req, res, next) => {
  try {
    const workspace = await Workspace.findByPk(req.params.id);
    if (!workspace) {
      return res.status(404).json({ success: false, error: 'Workspace not found' });
    }

    // Only super_admin or current owner can transfer
    if (req.user.role !== 'super_admin' && workspace.ownerId !== req.user.id) {
      return res.status(403).json({ success: false, error: 'Not authorized to transfer ownership' });
    }

    const { newOwnerId } = req.body;
    if (!newOwnerId) {
      return res.status(400).json({ success: false, error: 'newOwnerId is required' });
    }
    const oldOwnerId = workspace.ownerId;
    if (newOwnerId === oldOwnerId) {
      return res.status(400).json({ success: false, error: 'This user is already the owner' });
    }

    // New owner must already be a member
    const newOwnerMember = await WorkspaceMembers.findOne({
      where: { workspaceId: workspace.id, userId: newOwnerId }
    });
    if (!newOwnerMember) {
      return res.status(404).json({ success: false, error: 'New owner must be an existing workspace member' });
    }

    const t = await sequelize.transaction();
    try {
      // Update workspace.ownerId
      await workspace.update({ ownerId: newOwnerId }, { transaction: t });

      // Demote old owner to admin in workspace_members
      await WorkspaceMembers.update(
        { role: 'admin' },
        { where: { workspaceId: workspace.id, userId: oldOwnerId }, transaction: t }
      );

      // Promote new owner in workspace_members
      await WorkspaceMembers.update(
        { role: 'owner' },
        { where: { workspaceId: workspace.id, userId: newOwnerId }, transaction: t }
      );

      await t.commit();
    } catch (err) {
      await t.rollback();
      throw err;
    }

    res.status(200).json({ success: true, message: 'Ownership transferred successfully' });
  } catch (error) {
    logger.error('Transfer ownership error:', error);
    next(error);
  }
};

module.exports = {
  getWorkspaceMembers,
  addWorkspaceMember,
  updateWorkspaceMemberRole,
  removeWorkspaceMember,
  transferWorkspaceOwnership,
};
