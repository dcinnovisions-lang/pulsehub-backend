const { Op } = require('sequelize');
const { AuditLog, User, Workspace, WorkspaceMembers } = require('../models');
const { ACTION_LABELS, UUID_RE } = require('../utils/audit');
const { toCSV } = require('../utils/csv');
const logger = require('../utils/logger');

// Workspaces whose audit log the caller may read: owners and admins only. null = all (super admin).
const auditableWorkspaceIds = async (user) => {
  if (user.role === 'super_admin') return null;
  const [owned, admin] = await Promise.all([
    Workspace.findAll({ where: { ownerId: user.id }, attributes: ['id'], raw: true }),
    WorkspaceMembers.findAll({ where: { userId: user.id, role: { [Op.in]: ['owner', 'admin'] } }, attributes: ['workspaceId'], raw: true })
  ]);
  return [...new Set([...owned.map((w) => w.id), ...admin.map((m) => m.workspaceId)])];
};

const buildWhere = async (req) => {
  const allowed = await auditableWorkspaceIds(req.user);
  const { workspaceId, action, actorId, q, from, to } = req.query;

  if (allowed !== null && allowed.length === 0) {
    const e = new Error('Only workspace owners and admins can view the audit log');
    e.status = 403;
    throw e;
  }
  if (workspaceId && (!UUID_RE.test(workspaceId) || (allowed !== null && !allowed.includes(workspaceId)))) {
    const e = new Error('You do not have access to this workspace\'s audit log');
    e.status = 403;
    throw e;
  }

  const and = [];
  const scopeIds = workspaceId ? [workspaceId] : allowed;
  if (scopeIds !== null) {
    // Workspace-scoped events, plus sign-ins and failed sign-ins of that workspace's people
    const [members, owners] = await Promise.all([
      WorkspaceMembers.findAll({ where: { workspaceId: { [Op.in]: scopeIds } }, attributes: ['userId'], raw: true }),
      Workspace.findAll({ where: { id: { [Op.in]: scopeIds } }, attributes: ['ownerId'], raw: true })
    ]);
    const userIds = [...new Set([...members.map((m) => m.userId), ...owners.map((o) => o.ownerId)])];
    const users = userIds.length ? await User.findAll({ where: { id: { [Op.in]: userIds } }, attributes: ['email'], raw: true }) : [];
    and.push({
      [Op.or]: [
        { workspaceId: { [Op.in]: scopeIds } },
        { workspaceId: null, actorId: { [Op.in]: userIds.length ? userIds : ['00000000-0000-0000-0000-000000000000'] } },
        { workspaceId: null, actorId: null, actorEmail: { [Op.in]: users.length ? users.map((u) => u.email) : [''] } }
      ]
    });
  }

  if (action) and.push(action.endsWith('.') ? { action: { [Op.like]: `${action.replace(/[%_]/g, '')}%` } } : { action });
  if (actorId && UUID_RE.test(actorId)) and.push({ actorId });
  if (from && !Number.isNaN(new Date(from).getTime())) and.push({ createdAt: { [Op.gte]: new Date(from) } });
  if (to && !Number.isNaN(new Date(to).getTime())) { const end = new Date(to); end.setHours(23, 59, 59, 999); and.push({ createdAt: { [Op.lte]: end } }); }
  if (q && String(q).trim()) {
    const term = `%${String(q).trim().replace(/[%_]/g, '')}%`;
    and.push({ [Op.or]: [{ targetLabel: { [Op.iLike]: term } }, { actorEmail: { [Op.iLike]: term } }, { action: { [Op.iLike]: term } }] });
  }
  return and.length ? { [Op.and]: and } : {};
};

const decorate = (row) => {
  const j = row.toJSON();
  j.actionLabel = ACTION_LABELS[j.action] || j.action;
  return j;
};

const handleError = (err, res, next) => {
  if (err.status) return res.status(err.status).json({ success: false, error: err.message });
  logger.error('Audit log error:', err);
  return next(err);
};

/**
 * @route GET /api/v1/audit-logs?workspaceId=&action=&actorId=&q=&from=&to=&page=&limit=
 */
const listAuditLogs = async (req, res, next) => {
  try {
    const where = await buildWhere(req);
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 25));
    const { count, rows } = await AuditLog.findAndCountAll({
      where,
      include: [{ model: User, as: 'actor', attributes: ['id', 'firstName', 'lastName', 'email', 'avatar'], required: false }],
      order: [['createdAt', 'DESC']],
      limit,
      offset: (page - 1) * limit
    });
    res.json({ success: true, data: rows.map(decorate), total: count, page, limit, totalPages: Math.ceil(count / limit) });
  } catch (err) { handleError(err, res, next); }
};

/**
 * @route GET /api/v1/audit-logs/export
 */
const exportAuditLogs = async (req, res, next) => {
  try {
    const where = await buildWhere(req);
    const rows = await AuditLog.findAll({
      where,
      include: [{ model: User, as: 'actor', attributes: ['firstName', 'lastName', 'email'], required: false }],
      order: [['createdAt', 'DESC']],
      limit: 20000
    });
    const header = ['Time (UTC)', 'Event', 'Action code', 'Actor', 'Actor email', 'Target type', 'Target', 'Details', 'IP address'];
    const data = rows.map((r) => [
      r.createdAt ? new Date(r.createdAt).toISOString() : '',
      ACTION_LABELS[r.action] || r.action,
      r.action,
      r.actor ? `${r.actor.firstName} ${r.actor.lastName}`.trim() : '',
      r.actorEmail || (r.actor && r.actor.email) || '',
      r.targetType || '',
      r.targetLabel || r.targetId || '',
      r.metadata ? JSON.stringify(r.metadata) : '',
      r.ip || ''
    ]);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=audit-log-${new Date().toISOString().slice(0, 10)}.csv`);
    res.send('﻿' + toCSV([header, ...data]));
  } catch (err) { handleError(err, res, next); }
};

// Known actions for the filter dropdown, grouped by category
const listActions = (req, res) => {
  const groups = {};
  Object.entries(ACTION_LABELS).forEach(([action, label]) => {
    const cat = action.split('.')[0];
    (groups[cat] = groups[cat] || []).push({ action, label });
  });
  res.json({ success: true, data: groups });
};

module.exports = { listAuditLogs, exportAuditLogs, listActions };
