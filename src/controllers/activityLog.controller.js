const { ActivityLog, User } = require('../models');
const { Op } = require('sequelize');
const logger = require('../utils/logger');

/**
 * @desc    Get activity logs for an entity
 * @route   GET /api/v1/activity-logs
 * @access  Private
 */
const getActivityLogs = async (req, res, next) => {
  try {
    const { entityType, entityId, userId, action, page = 1, limit = 20 } = req.query;

    const whereClause = {};

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

    const parsedPage  = Math.max(1, parseInt(page, 10) || 1);
    const parsedLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const offset = (parsedPage - 1) * parsedLimit;

    const { count: total, rows: logs } = await ActivityLog.findAndCountAll({
      where: whereClause,
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
    const { entityType, entityId, userId, action } = req.query;

    const whereClause = {};

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

    const logs = await ActivityLog.findAll({
      where: whereClause,
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
    const log = await ActivityLog.create({
      entityType,
      entityId,
      action,
      userId,
      changes,
      metadata
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
