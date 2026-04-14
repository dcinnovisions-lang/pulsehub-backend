'use strict';

const { Automation, Project, Workspace, WorkspaceMembers, User } = require('../models');
const { Op } = require('sequelize');
const logger = require('../utils/logger');

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TRIGGER_TYPES = [
  'task_created',
  'task_status_changed',
  'task_assigned',
  'task_priority_changed',
  'task_overdue',
  'task_due_soon',
  'comment_added'
];

const ACTION_TYPES = [
  'change_status',
  'set_priority',
  'assign_user',
  'send_notification',
  'post_comment',
  'create_subtask'
];

const hasWorkspaceAccess = async (userId, workspaceId, minRole = ['owner', 'admin', 'pm']) => {
  const workspace = await Workspace.findByPk(workspaceId);
  if (!workspace) return false;
  if (workspace.ownerId === userId) return true;

  const member = await WorkspaceMembers.findOne({ where: { workspaceId, userId } });
  if (!member) return false;
  if (minRole === 'any') return true;
  return minRole.includes(member.role);
};

// ─── GET /api/v1/automations?workspaceId=&projectId= ─────────────────────────
const getAutomations = async (req, res, next) => {
  try {
    const { workspaceId, projectId } = req.query;
    if (!workspaceId) return res.status(400).json({ success: false, error: 'workspaceId is required' });

    // Check access
    const hasAccess = req.user.role === 'super_admin' || await hasWorkspaceAccess(req.user.id, workspaceId, 'any');
    if (!hasAccess) return res.status(403).json({ success: false, error: 'Access denied' });

    const where = { workspaceId };
    if (projectId) where.projectId = projectId;

    const automations = await Automation.findAll({
      where,
      include: [
        { model: User, as: 'creator', attributes: ['id', 'firstName', 'lastName', 'avatar'] }
      ],
      order: [['createdAt', 'DESC']]
    });

    res.status(200).json({ success: true, count: automations.length, data: automations });
  } catch (error) {
    logger.error('getAutomations error:', error);
    next(error);
  }
};

// ─── GET /api/v1/automations/:id ─────────────────────────────────────────────
const getAutomation = async (req, res, next) => {
  try {
    const automation = await Automation.findByPk(req.params.id, {
      include: [{ model: User, as: 'creator', attributes: ['id', 'firstName', 'lastName', 'avatar'] }]
    });
    if (!automation) return res.status(404).json({ success: false, error: 'Automation not found' });

    const hasAccess = req.user.role === 'super_admin' ||
      await hasWorkspaceAccess(req.user.id, automation.workspaceId, 'any');
    if (!hasAccess) return res.status(403).json({ success: false, error: 'Access denied' });

    res.status(200).json({ success: true, data: automation });
  } catch (error) {
    logger.error('getAutomation error:', error);
    next(error);
  }
};

// ─── POST /api/v1/automations ─────────────────────────────────────────────────
const createAutomation = async (req, res, next) => {
  try {
    const { workspaceId, projectId, name, description, trigger, actions } = req.body;

    if (!workspaceId) return res.status(400).json({ success: false, error: 'workspaceId is required' });
    if (!name || !name.trim()) return res.status(400).json({ success: false, error: 'name is required' });
    if (!trigger || !TRIGGER_TYPES.includes(trigger.type)) {
      return res.status(400).json({ success: false, error: `trigger.type must be one of: ${TRIGGER_TYPES.join(', ')}` });
    }
    if (!Array.isArray(actions) || actions.length === 0) {
      return res.status(400).json({ success: false, error: 'At least one action is required' });
    }
    for (const a of actions) {
      if (!ACTION_TYPES.includes(a.type)) {
        return res.status(400).json({ success: false, error: `Unknown action type: ${a.type}` });
      }
    }

    // Verify workspace access (owner/admin/pm can create)
    const hasAccess = req.user.role === 'super_admin' ||
      await hasWorkspaceAccess(req.user.id, workspaceId, ['owner', 'admin', 'pm']);
    if (!hasAccess) return res.status(403).json({ success: false, error: 'You must be an owner, admin, or PM to create automations' });

    // Verify projectId belongs to workspace if provided
    if (projectId) {
      const project = await Project.findOne({ where: { id: projectId, workspaceId } });
      if (!project) return res.status(404).json({ success: false, error: 'Project not found in this workspace' });
    }

    const automation = await Automation.create({
      workspaceId,
      projectId: projectId || null,
      createdBy: req.user.id,
      name: name.trim(),
      description: description || null,
      trigger,
      actions
    });

    const result = await Automation.findByPk(automation.id, {
      include: [{ model: User, as: 'creator', attributes: ['id', 'firstName', 'lastName', 'avatar'] }]
    });

    res.status(201).json({ success: true, data: result });
  } catch (error) {
    logger.error('createAutomation error:', error);
    next(error);
  }
};

// ─── PUT /api/v1/automations/:id ─────────────────────────────────────────────
const updateAutomation = async (req, res, next) => {
  try {
    const automation = await Automation.findByPk(req.params.id);
    if (!automation) return res.status(404).json({ success: false, error: 'Automation not found' });

    const hasAccess = req.user.role === 'super_admin' ||
      automation.createdBy === req.user.id ||
      await hasWorkspaceAccess(req.user.id, automation.workspaceId, ['owner', 'admin']);
    if (!hasAccess) return res.status(403).json({ success: false, error: 'Access denied' });

    const { name, description, isActive, trigger, actions } = req.body;

    if (trigger && !TRIGGER_TYPES.includes(trigger.type)) {
      return res.status(400).json({ success: false, error: `Invalid trigger type` });
    }
    if (actions) {
      for (const a of actions) {
        if (!ACTION_TYPES.includes(a.type)) {
          return res.status(400).json({ success: false, error: `Unknown action type: ${a.type}` });
        }
      }
    }

    await automation.update({
      name:        name        !== undefined ? name.trim()   : automation.name,
      description: description !== undefined ? description   : automation.description,
      isActive:    isActive    !== undefined ? isActive      : automation.isActive,
      trigger:     trigger     !== undefined ? trigger       : automation.trigger,
      actions:     actions     !== undefined ? actions       : automation.actions
    });

    res.status(200).json({ success: true, data: automation });
  } catch (error) {
    logger.error('updateAutomation error:', error);
    next(error);
  }
};

// ─── DELETE /api/v1/automations/:id ──────────────────────────────────────────
const deleteAutomation = async (req, res, next) => {
  try {
    const automation = await Automation.findByPk(req.params.id);
    if (!automation) return res.status(404).json({ success: false, error: 'Automation not found' });

    const hasAccess = req.user.role === 'super_admin' ||
      automation.createdBy === req.user.id ||
      await hasWorkspaceAccess(req.user.id, automation.workspaceId, ['owner', 'admin']);
    if (!hasAccess) return res.status(403).json({ success: false, error: 'Access denied' });

    await automation.destroy();
    res.status(200).json({ success: true, message: 'Automation deleted' });
  } catch (error) {
    logger.error('deleteAutomation error:', error);
    next(error);
  }
};

// ─── PATCH /api/v1/automations/:id/toggle ────────────────────────────────────
const toggleAutomation = async (req, res, next) => {
  try {
    const automation = await Automation.findByPk(req.params.id);
    if (!automation) return res.status(404).json({ success: false, error: 'Automation not found' });

    const hasAccess = req.user.role === 'super_admin' ||
      automation.createdBy === req.user.id ||
      await hasWorkspaceAccess(req.user.id, automation.workspaceId, ['owner', 'admin', 'pm']);
    if (!hasAccess) return res.status(403).json({ success: false, error: 'Access denied' });

    await automation.update({ isActive: !automation.isActive });
    res.status(200).json({ success: true, data: { id: automation.id, isActive: automation.isActive } });
  } catch (error) {
    logger.error('toggleAutomation error:', error);
    next(error);
  }
};

// ─── GET /api/v1/automations/:id/logs ────────────────────────────────────────
const getAutomationLogs = async (req, res, next) => {
  try {
    const automation = await Automation.findByPk(req.params.id, {
      attributes: ['id', 'name', 'runCount', 'lastRunAt', 'recentLogs']
    });
    if (!automation) return res.status(404).json({ success: false, error: 'Automation not found' });

    const hasAccess = req.user.role === 'super_admin' ||
      await hasWorkspaceAccess(req.user.id, automation.workspaceId, 'any');
    if (!hasAccess) return res.status(403).json({ success: false, error: 'Access denied' });

    res.status(200).json({
      success: true,
      data: {
        runCount: automation.runCount,
        lastRunAt: automation.lastRunAt,
        logs: Array.isArray(automation.recentLogs) ? automation.recentLogs : []
      }
    });
  } catch (error) {
    logger.error('getAutomationLogs error:', error);
    next(error);
  }
};

module.exports = {
  getAutomations,
  getAutomation,
  createAutomation,
  updateAutomation,
  deleteAutomation,
  toggleAutomation,
  getAutomationLogs,
  TRIGGER_TYPES,
  ACTION_TYPES
};
