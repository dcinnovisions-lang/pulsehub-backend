const { sequelize } = require('../config/database');
const { AuditLog } = require('../models');
const logger = require('./logger');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Human readable names for the filter dropdown and the log table
const ACTION_LABELS = {
  'auth.login': 'Signed in',
  'auth.login_failed': 'Failed sign-in',
  'auth.registered': 'Account registered',
  'auth.password_reset': 'Password reset',
  'auth.password_changed': 'Password changed',
  'auth.2fa_enabled': 'Two-factor enabled',
  'auth.2fa_disabled': 'Two-factor disabled',
  'user.role_changed': 'Platform role changed',
  'user.deleted': 'User deleted',
  'account.deleted': 'Account deleted',
  'workspace.created': 'Workspace created',
  'workspace.updated': 'Workspace updated',
  'workspace.deleted': 'Workspace deleted',
  'workspace.restored': 'Workspace restored',
  'workspace.ownership_transferred': 'Ownership transferred',
  'workspace.member_added': 'Member added to workspace',
  'workspace.member_role_changed': 'Workspace role changed',
  'workspace.member_removed': 'Member removed from workspace',
  'project.created': 'Project created',
  'project.updated': 'Project updated',
  'project.archived': 'Project archived',
  'project.member_added': 'Member added to project',
  'project.member_role_changed': 'Project role changed',
  'project.member_removed': 'Member removed from project',
  'project.permissions_updated': 'Project permissions changed',
  'invite.sent': 'Invitation sent',
  'invite.accepted': 'Invitation accepted',
  'invite.cancelled': 'Invitation cancelled',
  'guest.granted': 'Guest access granted',
  'guest.revoked': 'Guest access revoked',
  'apikey.created': 'API key created',
  'apikey.revoked': 'API key revoked',
  'issues.imported': 'Issues imported',
  'issues.exported': 'Issues exported',
  'issues.deleted': 'Issue deleted',
  'sprint.started': 'Sprint started',
  'sprint.completed': 'Sprint completed',
  'sprint.deleted': 'Sprint deleted',
  'release.released': 'Release published',
  'sso.updated': 'Single sign-on settings changed'
};

const clip = (v, n) => (v === null || v === undefined ? null : String(v).slice(0, n));

// Adds the workspace for a project when only the project is known
const resolveScope = async ({ workspaceId, projectId }) => {
  const out = { workspaceId: workspaceId && UUID_RE.test(workspaceId) ? workspaceId : null, projectId: projectId && UUID_RE.test(projectId) ? projectId : null };
  if (!out.workspaceId && out.projectId) {
    try {
      const [rows] = await sequelize.query('SELECT workspace_id FROM projects WHERE id = :id', { replacements: { id: out.projectId } });
      if (rows[0]) out.workspaceId = rows[0].workspace_id;
    } catch (_) { /* best effort */ }
  }
  return out;
};

/**
 * Records one audit event. Never throws (auditing must not break the operation being audited).
 * @param {object} req  express request (used for IP / user agent / actor)
 * @param {object} e    { action, actorId?, actorEmail?, workspaceId?, projectId?, targetType?, targetId?, targetLabel?, metadata? }
 */
const audit = async (req, e) => {
  try {
    if (process.env.NODE_ENV === 'test') return null;
    const scope = await resolveScope(e);
    return await AuditLog.create({
      actorId: e.actorId || (req && req.user && req.user.id) || null,
      actorEmail: clip(e.actorEmail || (req && req.user && req.user.email), 255),
      workspaceId: scope.workspaceId,
      projectId: scope.projectId,
      action: clip(e.action, 80),
      targetType: clip(e.targetType, 40),
      targetId: clip(e.targetId, 64),
      targetLabel: clip(e.targetLabel, 255),
      metadata: e.metadata || null,
      ip: clip(req && req.ip, 64),
      userAgent: clip(req && req.headers && req.headers['user-agent'], 255)
    });
  } catch (err) {
    logger.warn('Audit log write failed (non-fatal):', err.message);
    return null;
  }
};

module.exports = { audit, ACTION_LABELS, resolveScope, UUID_RE };
