const { GuestAccess, User, Project, Workspace, WorkspaceMembers } = require('../models');
const logger = require('../utils/logger');

/**
 * Guest access grants a non-member read/comment access to a specific
 * project/workspace/document — it's a privilege-granting action, so only
 * someone who can already manage membership on the target workspace should
 * be able to create, list, or revoke it. Route docs always said
 * "@access Private (admin/owner)" but the routes previously only had
 * `authenticate` with no actual role/ownership check — any logged-in user
 * (any role, not even a member of the target workspace) could grant or
 * revoke guest access to arbitrary resources by ID. Fixed here rather than
 * via the central RBAC matrix: guest access isn't itself one of
 * PERMISSION_MATRIX's resources, and workspaceId isn't always directly on
 * the request the way checkPermission's auto-resolve expects (it's derived
 * from resourceType/resourceId), so an explicit check mirroring
 * ensureWorkspaceAccess (utils/accessControl.js) plus a role restriction is
 * more accurate here than forcing this through the generic middleware.
 */
const canManageGuestAccess = async (user, workspaceId) => {
  if (user.role === 'super_admin') return true;
  if (!workspaceId) return { status: 400, message: 'Workspace context required' };

  const workspace = await Workspace.findByPk(workspaceId);
  if (!workspace) return { status: 404, message: 'Workspace not found' };
  if (workspace.ownerId === user.id) return true;

  const member = await WorkspaceMembers.findOne({ where: { workspaceId, userId: user.id } });
  if (!member || !['admin', 'owner'].includes(member.role)) {
    return { status: 403, message: 'Only workspace admins/owners can manage guest access' };
  }
  return true;
};

/** Resolves a workspaceId from a resourceType/resourceId pair. */
const resolveWorkspaceId = async (resourceType, resourceId) => {
  if (resourceType === 'workspace') return resourceId;
  if (resourceType === 'project') {
    const project = await Project.findByPk(resourceId, { attributes: ['workspaceId'] });
    return project ? project.workspaceId : null;
  }
  // 'document' and any future resource types: no direct workspace lookup
  // wired up yet — treated as unresolvable (caller must supply workspaceId).
  return null;
};

/**
 * @desc    Get guest access records (optionally filtered by projectId)
 * @route   GET /api/v1/guest-access
 * @access  Private (admin/owner)
 */
const getGuestAccess = async (req, res, next) => {
  try {
    const { projectId } = req.query;
    const where = {};

    if (projectId) {
      where.resourceType = 'project';
      where.resourceId = projectId;
      const workspaceId = await resolveWorkspaceId('project', projectId);
      const access = await canManageGuestAccess(req.user, workspaceId);
      if (access !== true) return res.status(access.status).json({ success: false, error: access.message });
    } else if (req.user.role !== 'super_admin') {
      // No projectId scope given — only super_admin may list every guest
      // access record platform-wide; everyone else must scope by project.
      return res.status(400).json({ success: false, error: 'projectId is required' });
    }

    const records = await GuestAccess.findAll({
      where,
      include: [
        { model: User, as: 'user', attributes: ['id', 'email', 'firstName', 'lastName'] },
        { model: User, as: 'inviter', attributes: ['id', 'email', 'firstName', 'lastName'] },
      ],
      order: [['createdAt', 'DESC']],
    });

    res.json({ success: true, data: records });
  } catch (error) {
    logger.error('Get guest access error:', error);
    next(error);
  }
};

/**
 * @desc    Create guest access record
 * @route   POST /api/v1/guest-access
 * @access  Private (admin/owner)
 */
const createGuestAccess = async (req, res, next) => {
  try {
    const { email, resourceType, resourceId, canView = true, canComment = false, expiresAt } = req.body;

    if (!email || !resourceType || !resourceId) {
      return res.status(400).json({ success: false, error: 'email, resourceType, and resourceId are required' });
    }

    // Find workspace from project (or use the explicit workspaceId body field)
    let workspaceId = req.body.workspaceId;
    if (!workspaceId) {
      workspaceId = await resolveWorkspaceId(resourceType, resourceId);
    }

    if (!workspaceId) {
      return res.status(400).json({ success: false, error: 'Could not determine workspaceId' });
    }

    const access = await canManageGuestAccess(req.user, workspaceId);
    if (access !== true) return res.status(access.status).json({ success: false, error: access.message });

    // Find the user by email
    const targetUser = await User.findOne({ where: { email } });
    if (!targetUser) {
      return res.status(404).json({ success: false, error: 'No user found with this email address' });
    }

    const [record, created] = await GuestAccess.findOrCreate({
      where: { userId: targetUser.id, resourceType, resourceId },
      defaults: {
        userId: targetUser.id,
        workspaceId,
        resourceType,
        resourceId,
        canView,
        canComment,
        expiresAt: expiresAt || null,
        invitedBy: req.user.id,
      },
    });

    if (!created) {
      await record.update({ canView, canComment, expiresAt: expiresAt || null });
    }

    res.status(created ? 201 : 200).json({ success: true, data: record });
  } catch (error) {
    logger.error('Create guest access error:', error);
    next(error);
  }
};

/**
 * @desc    Revoke (delete) a guest access record
 * @route   DELETE /api/v1/guest-access/:id
 * @access  Private (admin/owner)
 */
const revokeGuestAccess = async (req, res, next) => {
  try {
    const record = await GuestAccess.findByPk(req.params.id);
    if (!record) {
      return res.status(404).json({ success: false, error: 'Guest access record not found' });
    }

    const access = await canManageGuestAccess(req.user, record.workspaceId);
    if (access !== true) return res.status(access.status).json({ success: false, error: access.message });

    await record.destroy();
    res.json({ success: true, message: 'Guest access revoked' });
  } catch (error) {
    logger.error('Revoke guest access error:', error);
    next(error);
  }
};

module.exports = { getGuestAccess, createGuestAccess, revokeGuestAccess };
