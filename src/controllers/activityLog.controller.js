const { ActivityLog, User, Workspace, WorkspaceMembers } = require('../models');
const { Op } = require('sequelize');
const { sequelize } = require('../config/database');
const logger = require('../utils/logger');
const { accessibleProjectIds } = require('../utils/projectAccess');

// Limits a query to activity the caller is allowed to see (their workspaces/projects, or their own actions).
const scopeCondition = async (user) => {
  if (user.role === 'super_admin') return null;
  const [projectIds, memberships, owned] = await Promise.all([
    accessibleProjectIds(user),
    WorkspaceMembers.findAll({ where: { userId: user.id }, attributes: ['workspaceId'], raw: true }),
    Workspace.findAll({ where: { ownerId: user.id }, attributes: ['id'], raw: true })
  ]);
  const workspaceIds = [...new Set([...memberships.map((m) => m.workspaceId), ...owned.map((w) => w.id)])];
  const none = '00000000-0000-0000-0000-000000000000';
  return {
    [Op.or]: [
      { projectId: { [Op.in]: projectIds && projectIds.length ? projectIds : [none] } },
      { workspaceId: { [Op.in]: workspaceIds.length ? workspaceIds : [none] } },
      { userId: user.id }
    ]
  };
};

/**
 * @desc    Get activity logs for an entity
 * @route   GET /api/v1/activity-logs
 * @access  Private
 */
const getActivityLogs = async (req, res, next) => {
  try {
    const { entityType, entityId, userId, action, workspaceId, startDate, endDate, page = 1, limit = 20 } = req.query;

    const whereClause = {};
    if (workspaceId) whereClause.workspaceId = workspaceId;
    if (startDate && !Number.isNaN(new Date(startDate).getTime())) whereClause.createdAt = { ...(whereClause.createdAt || {}), [Op.gte]: new Date(startDate) };
    if (endDate && !Number.isNaN(new Date(endDate).getTime())) { const end = new Date(endDate); end.setHours(23, 59, 59, 999); whereClause.createdAt = { ...(whereClause.createdAt || {}), [Op.lte]: end }; }

    if (entityType) {
      whereClause.entityType = entityType;
    }

    if (entityId) {
      whereClause.entityId = entityId;
    }

    if (userId) {
      whereClause.userId = userId;
    }

    if (action) {
      whereClause.action = action;
    }

    const scope = await scopeCondition(req.user);
    const scopedWhere = scope ? { [Op.and]: [whereClause, scope] } : whereClause;

    const parsedPage  = Math.max(1, parseInt(page, 10) || 1);
    const parsedLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const offset = (parsedPage - 1) * parsedLimit;

    const { count: total, rows: logs } = await ActivityLog.findAndCountAll({
      where: scopedWhere,
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['id', 'firstName', 'lastName', 'email', 'avatar']
        }
      ],
      order: [['createdAt', 'DESC']],
      limit: parsedLimit,
      offset
    });

    res.status(200).json({
      success: true,
      data: logs,
      total,
      page: parsedPage,
      totalPages: Math.ceil(total / parsedLimit)
    });
  } catch (error) {
    logger.error('Get activity logs error:', error);
    next(error);
  }
};

/**
 * @desc    Export activity logs as CSV
 * @route   GET /api/v1/activity-logs/export
 * @access  Private
 */
const exportActivityLogs = async (req, res, next) => {
  try {
    const { entityType, entityId, userId, action, workspaceId, startDate, endDate } = req.query;

    const whereClause = {};
    if (workspaceId) whereClause.workspaceId = workspaceId;
    if (startDate && !Number.isNaN(new Date(startDate).getTime())) whereClause.createdAt = { ...(whereClause.createdAt || {}), [Op.gte]: new Date(startDate) };
    if (endDate && !Number.isNaN(new Date(endDate).getTime())) { const end = new Date(endDate); end.setHours(23, 59, 59, 999); whereClause.createdAt = { ...(whereClause.createdAt || {}), [Op.lte]: end }; }

    if (entityType) {
      whereClause.entityType = entityType;
    }

    if (entityId) {
      whereClause.entityId = entityId;
    }

    if (userId) {
      whereClause.userId = userId;
    }

    if (action) {
      whereClause.action = action;
    }

    const scope = await scopeCondition(req.user);
    const logs = await ActivityLog.findAll({
      where: scope ? { [Op.and]: [whereClause, scope] } : whereClause,
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['id', 'firstName', 'lastName', 'email']
        }
      ],
      order: [['createdAt', 'DESC']],
      limit: 10000 // safety cap
    });

    // Build CSV
    const csvHeader = 'date,action,entityType,entityId,user,description';
    const escapeCSV = (val) => {
      if (val === null || val === undefined) return '';
      const str = String(val);
      // Wrap in quotes if the value contains a comma, quote, or newline
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const csvRows = logs.map((log) => {
      const date = log.createdAt ? new Date(log.createdAt).toISOString() : '';
      const action_ = escapeCSV(log.action);
      const entityType_ = escapeCSV(log.entityType);
      const entityId_ = escapeCSV(log.entityId);
      const userName = log.user
        ? escapeCSV(`${log.user.firstName || ''} ${log.user.lastName || ''}`.trim() || log.user.email)
        : '';
      const description = escapeCSV(
        log.metadata && log.metadata.description
          ? log.metadata.description
          : log.changes
          ? JSON.stringify(log.changes)
          : ''
      );
      return [date, action_, entityType_, entityId_, userName, description].join(',');
    });

    const csvContent = [csvHeader, ...csvRows].join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="activity-logs.csv"');
    res.status(200).send(csvContent);
  } catch (error) {
    logger.error('Export activity logs error:', error);
    next(error);
  }
};

/**
 * @desc    Create activity log (internal use)
 * @route   POST /api/v1/activity-logs
 * @access  Private (used by other controllers)
 */
const createActivityLog = async (entityType, entityId, action, userId, changes = null, metadata = null) => {
  try {
    // Which project / workspace does this belong to? (drives who may see it)
    let projectId = null;
    let workspaceId = null;
    try {
      let rows = [];
      if (entityType === 'task') {
        [rows] = await sequelize.query('SELECT p.id AS project_id, p.workspace_id FROM tasks t JOIN projects p ON p.id = t.project_id WHERE t.id = :id', { replacements: { id: entityId } });
      } else if (entityType === 'project') {
        [rows] = await sequelize.query('SELECT id AS project_id, workspace_id FROM projects WHERE id = :id', { replacements: { id: entityId } });
      } else if (entityType === 'workspace') {
        rows = [{ project_id: null, workspace_id: entityId }];
      } else if (entityType === 'comment') {
        [rows] = await sequelize.query('SELECT p.id AS project_id, p.workspace_id FROM comments c JOIN tasks t ON t.id = c.task_id JOIN projects p ON p.id = t.project_id WHERE c.id = :id', { replacements: { id: entityId } });
      } else if (entityType === 'attachment') {
        [rows] = await sequelize.query('SELECT p.id AS project_id, p.workspace_id FROM attachments a JOIN tasks t ON t.id = a.task_id JOIN projects p ON p.id = t.project_id WHERE a.id = :id', { replacements: { id: entityId } });
      }
      if (rows && rows[0]) { projectId = rows[0].project_id || null; workspaceId = rows[0].workspace_id || null; }
    } catch (_) { /* scope is best effort */ }

    const log = await ActivityLog.create({
      entityType,
      entityId,
      action,
      userId,
      changes,
      metadata,
      projectId,
      workspaceId
    });

    return log;
  } catch (error) {
    logger.error('Create activity log error:', error);
    // Don't throw - activity logging shouldn't break main operations
    return null;
  }
};

module.exports = {
  getActivityLogs,
  exportActivityLogs,
  createActivityLog
};
