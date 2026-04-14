// RBAC V2 — STEP 10
// Project-level member management controller.
// Handles adding/removing/updating users at the PROJECT level (not workspace level).
// Project roles override workspace roles for all permission checks within the project.

'use strict';

const { sequelize, Project, User, Workspace, WorkspaceMembers, ProjectMembers } = require('../models');
const { Op } = require('sequelize');
const logger = require('../utils/logger');
const { createActivityLog } = require('./activityLog.controller');
const { createNotification } = require('./notification.controller');
const { getIO } = require('../socket');

// Valid project-level roles
const PROJECT_ROLES = ['project_lead', 'contributor', 'reporter', 'reviewer', 'commenter', 'viewer'];

// Role metadata for display
const ROLE_META = {
  project_lead: {
    label: 'Project Lead',
    description: 'Full project control — manage team, tasks, settings, budget',
    color: '#7C3AED',
    icon: '👑'
  },
  contributor: {
    label: 'Contributor',
    description: 'Create and edit own tasks, log time, upload attachments',
    color: '#2563EB',
    icon: '✏️'
  },
  reporter: {
    label: 'Reporter',
    description: 'Submit new issues/tasks and track their own submissions only',
    color: '#D97706',
    icon: '📋'
  },
  reviewer: {
    label: 'Reviewer',
    description: 'Review and approve tasks — cannot edit task details',
    color: '#059669',
    icon: '✅'
  },
  commenter: {
    label: 'Commenter',
    description: 'View everything, add comments — cannot create or edit tasks',
    color: '#0891B2',
    icon: '💬'
  },
  viewer: {
    label: 'Viewer',
    description: 'Read-only access — cannot comment or edit anything',
    color: '#6B7280',
    icon: '👁️'
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v1/projects/:id/members
// ─────────────────────────────────────────────────────────────────────────────
const getProjectMembers = async (req, res, next) => {
  try {
    const { id: projectId } = req.params;

    const project = await Project.findByPk(projectId, {
      include: [{ model: Workspace, as: 'workspace', attributes: ['id', 'name', 'ownerId'] }]
    });

    if (!project) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }

    // Load project-level members with their user info
    const projectMembers = await ProjectMembers.findAll({
      where: { projectId },
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['id', 'email', 'firstName', 'lastName', 'avatar', 'role', 'isActive']
        },
        {
          model: User,
          as: 'inviter',
          attributes: ['id', 'firstName', 'lastName', 'email']
        }
      ],
      order: [
        // Order: project_lead first, then alphabetically
        [sequelize.literal(`CASE "ProjectMembers"."role"
          WHEN 'project_lead' THEN 1
          WHEN 'contributor'  THEN 2
          WHEN 'reporter'     THEN 3
          WHEN 'reviewer'     THEN 4
          WHEN 'commenter'    THEN 5
          WHEN 'viewer'       THEN 6
          ELSE 7 END`), 'ASC'],
        [{ model: User, as: 'user' }, 'firstName', 'ASC']
      ]
    });

    // Enrich with role metadata
    const enriched = projectMembers.map(pm => ({
      id: pm.id,
      projectId: pm.projectId,
      userId: pm.userId,
      role: pm.role,
      roleMeta: ROLE_META[pm.role] || { label: pm.role, description: '', color: '#6B7280' },
      joinedAt: pm.joinedAt,
      user: pm.user,
      invitedBy: pm.inviter ? {
        id: pm.inviter.id,
        name: `${pm.inviter.firstName} ${pm.inviter.lastName}`,
        email: pm.inviter.email
      } : null
    }));

    // Also load workspace members who are NOT yet in project_members
    // This lets the UI show who can be added
    const projectMemberUserIds = projectMembers.map(pm => pm.userId);

    const workspaceMembers = await WorkspaceMembers.findAll({
      where: {
        workspaceId: project.workspaceId,
        userId: { [Op.notIn]: projectMemberUserIds.length ? projectMemberUserIds : ['00000000-0000-0000-0000-000000000000'] }
      },
      include: [{
        model: User,
        as: 'user',
        attributes: ['id', 'email', 'firstName', 'lastName', 'avatar', 'role', 'isActive']
      }]
    });

    const eligibleToAdd = workspaceMembers
      .filter(wm => wm.user?.isActive)
      .map(wm => ({
        id: wm.userId,
        email: wm.user.email,
        firstName: wm.user.firstName,
        lastName: wm.user.lastName,
        avatar: wm.user.avatar,
        workspaceRole: wm.role
      }));

    res.status(200).json({
      success: true,
      count: enriched.length,
      data: enriched,
      eligibleToAdd,
      availableRoles: PROJECT_ROLES.map(r => ({ value: r, ...ROLE_META[r] }))
    });
  } catch (error) {
    logger.error('getProjectMembers error:', error);
    next(error);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/v1/projects/:id/members
// Body: { userId, role }
// ─────────────────────────────────────────────────────────────────────────────
const addProjectMember = async (req, res, next) => {
  try {
    const { id: projectId } = req.params;
    const { userId, role = 'contributor' } = req.body;

    if (!userId) {
      return res.status(400).json({ success: false, error: 'userId is required' });
    }

    if (!PROJECT_ROLES.includes(role)) {
      return res.status(400).json({
        success: false,
        error: `Invalid role. Must be one of: ${PROJECT_ROLES.join(', ')}`
      });
    }

    const project = await Project.findByPk(projectId);
    if (!project) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }

    // Target user must exist
    const targetUser = await User.findByPk(userId, {
      attributes: ['id', 'email', 'firstName', 'lastName', 'avatar', 'isActive']
    });
    if (!targetUser) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    if (!targetUser.isActive) {
      return res.status(400).json({ success: false, error: 'Cannot add deactivated user' });
    }

    // Target user must be a workspace member first
    const wsMember = await WorkspaceMembers.findOne({
      where: { workspaceId: project.workspaceId, userId }
    });
    if (!wsMember) {
      return res.status(400).json({
        success: false,
        error: 'User must be a workspace member before being added to a project'
      });
    }

    // Check for existing project membership
    const existing = await ProjectMembers.findOne({ where: { projectId, userId } });
    if (existing) {
      return res.status(400).json({
        success: false,
        error: 'User is already a member of this project'
      });
    }

    const member = await ProjectMembers.create({
      projectId,
      userId,
      role,
      invitedBy: req.user.id,
      joinedAt: new Date()
    });

    // Activity log
    try {
      await createActivityLog('project', projectId, 'member_added', req.user.id, null, {
        addedUserId: userId,
        addedUserName: `${targetUser.firstName} ${targetUser.lastName}`,
        role
      });
    } catch (logErr) {
      logger.warn('Failed to log member_added activity', logErr);
    }

    // Notify the added user
    try {
      const actorName = `${req.user.firstName || ''} ${req.user.lastName || ''}`.trim() || 'Someone';
      await createNotification({
        userId:     userId,
        type:       'project_member_added',
        title:      `You were added to "${project.name}"`,
        body:       `${actorName} added you as ${ROLE_META[role]?.label || role}`,
        entityType: 'project',
        entityId:   projectId,
        actorId:    req.user.id,
        metadata:   { url: `/app/projects/${projectId}`, projectId }
      });
    } catch (notifErr) {
      logger.warn('Failed to send project_member_added notification', notifErr);
    }

    // Emit socket event to project room
    try {
      getIO().to(`project:${projectId}`).emit('member:added', {
        projectId,
        userId,
        role
      });
    } catch (socketErr) {
      logger.warn('Failed to emit member:added socket event for project', socketErr);
    }

    res.status(201).json({
      success: true,
      data: {
        id: member.id,
        projectId,
        userId,
        role,
        roleMeta: ROLE_META[role],
        user: targetUser,
        joinedAt: member.joinedAt
      }
    });
  } catch (error) {
    logger.error('addProjectMember error:', error);
    next(error);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/v1/projects/:id/members/:userId
// Body: { role }
// ─────────────────────────────────────────────────────────────────────────────
const updateProjectMemberRole = async (req, res, next) => {
  try {
    const { id: projectId, userId } = req.params;
    const { role } = req.body;

    if (!role || !PROJECT_ROLES.includes(role)) {
      return res.status(400).json({
        success: false,
        error: `Invalid role. Must be one of: ${PROJECT_ROLES.join(', ')}`
      });
    }

    // Prevent demoting the last project_lead
    if (role !== 'project_lead') {
      const leadCount = await ProjectMembers.count({
        where: { projectId, role: 'project_lead' }
      });
      const targetMember = await ProjectMembers.findOne({ where: { projectId, userId } });

      if (leadCount === 1 && targetMember?.role === 'project_lead') {
        return res.status(400).json({
          success: false,
          error: 'Cannot demote the only project lead. Assign another lead first.'
        });
      }
    }

    const member = await ProjectMembers.findOne({ where: { projectId, userId } });
    if (!member) {
      return res.status(404).json({ success: false, error: 'Member not found in this project' });
    }

    const previousRole = member.role;
    await member.update({ role });

    // Activity log
    try {
      await createActivityLog('project', projectId, 'member_role_changed', req.user.id, null, {
        targetUserId: userId,
        previousRole,
        newRole: role
      });
    } catch (logErr) {
      logger.warn('Failed to log member_role_changed activity', logErr);
    }

    res.status(200).json({
      success: true,
      data: {
        userId,
        role,
        roleMeta: ROLE_META[role],
        previousRole
      }
    });
  } catch (error) {
    logger.error('updateProjectMemberRole error:', error);
    next(error);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/v1/projects/:id/members/:userId
// ─────────────────────────────────────────────────────────────────────────────
const removeProjectMember = async (req, res, next) => {
  try {
    const { id: projectId, userId } = req.params;

    // Cannot remove yourself if you're the only lead
    const member = await ProjectMembers.findOne({ where: { projectId, userId } });
    if (!member) {
      return res.status(404).json({ success: false, error: 'Member not found in this project' });
    }

    if (member.role === 'project_lead') {
      const leadCount = await ProjectMembers.count({
        where: { projectId, role: 'project_lead' }
      });
      if (leadCount === 1) {
        return res.status(400).json({
          success: false,
          error: 'Cannot remove the only project lead. Assign another lead first.'
        });
      }
    }

    const project = await Project.findByPk(projectId, { attributes: ['id', 'name'] });
    await member.destroy();

    // Activity log
    try {
      await createActivityLog('project', projectId, 'member_removed', req.user.id, null, {
        removedUserId: userId,
        removedRole: member.role
      });
    } catch (logErr) {
      logger.warn('Failed to log member_removed activity', logErr);
    }

    // Notify the removed user
    try {
      const actorName = `${req.user.firstName || ''} ${req.user.lastName || ''}`.trim() || 'Someone';
      await createNotification({
        userId:     userId,
        type:       'project_member_removed',
        title:      `You were removed from "${project?.name || 'a project'}"`,
        body:       `${actorName} removed you from the project`,
        entityType: 'project',
        entityId:   projectId,
        actorId:    req.user.id,
        metadata:   { projectId }
      });
    } catch (notifErr) {
      logger.warn('Failed to send project_member_removed notification', notifErr);
    }

    res.status(200).json({ success: true, message: 'Member removed from project successfully' });
  } catch (error) {
    logger.error('removeProjectMember error:', error);
    next(error);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v1/projects/:id/members/roles
// Returns available project roles with metadata
// ─────────────────────────────────────────────────────────────────────────────
const getProjectRoles = async (_req, res) => {
  res.status(200).json({
    success: true,
    data: PROJECT_ROLES.map(r => ({ value: r, ...ROLE_META[r] }))
  });
};

module.exports = {
  getProjectMembers,
  addProjectMember,
  updateProjectMemberRole,
  removeProjectMember,
  getProjectRoles,
  PROJECT_ROLES,
  ROLE_META
};
