const { GuestAccess, User, Project } = require('../models');
const logger = require('../utils/logger');

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

    // Find the user by email
    const targetUser = await User.findOne({ where: { email } });
    if (!targetUser) {
      return res.status(404).json({ success: false, error: 'No user found with this email address' });
    }

    // Find workspace from project
    let workspaceId = req.body.workspaceId;
    if (!workspaceId && resourceType === 'project') {
      const project = await Project.findByPk(resourceId, { attributes: ['workspaceId'] });
      if (project) workspaceId = project.workspaceId;
    }

    if (!workspaceId) {
      return res.status(400).json({ success: false, error: 'Could not determine workspaceId' });
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
    await record.destroy();
    res.json({ success: true, message: 'Guest access revoked' });
  } catch (error) {
    logger.error('Revoke guest access error:', error);
    next(error);
  }
};

module.exports = { getGuestAccess, createGuestAccess, revokeGuestAccess };
