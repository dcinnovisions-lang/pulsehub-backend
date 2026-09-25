// Records security- and admin-relevant requests in the audit log.
// It watches finished requests, so it never blocks or fails the request itself.

const { audit } = require('../utils/audit');
const logger = require('../utils/logger');

const pick = (obj, keys) => {
  const out = {};
  keys.forEach((k) => { if (obj && obj[k] !== undefined) out[k] = obj[k]; });
  return out;
};
const changedKeys = (body, allowed) => Object.keys(body || {}).filter((k) => (allowed ? allowed.includes(k) : true) && body[k] !== undefined);
const dataOf = (resBody) => (resBody && resBody.data) || {};

// [method, route pattern (without /api/vN), action, builder(req, params, resBody) -> partial audit event | null to skip]
const RULES = [
  ['POST', '/auth/register', 'auth.registered', (req, p, r) => ({ actorId: dataOf(r).user && dataOf(r).user.id, actorEmail: req.body && req.body.email, targetType: 'user', targetId: dataOf(r).user && dataOf(r).user.id })],
  ['POST', '/auth/reset-password', 'auth.password_reset', () => ({})],
  ['POST', '/auth/2fa/verify', 'auth.2fa_enabled', () => ({})],
  ['POST', '/auth/2fa/disable', 'auth.2fa_disabled', () => ({})],
  ['PUT', '/users/:id/role', 'user.role_changed', (req, p) => ({ targetType: 'user', targetId: p.id, metadata: pick(req.body, ['role']) })],
  ['DELETE', '/users/me', 'account.deleted', () => ({})],
  ['DELETE', '/users/:id', 'user.deleted', (req, p) => ({ targetType: 'user', targetId: p.id })],
  ['PUT', '/users/:id', 'auth.password_changed', (req, p) => (req.body && req.body.newPassword ? { targetType: 'user', targetId: p.id } : null)],

  ['POST', '/workspaces', 'workspace.created', (req, p, r) => ({ workspaceId: dataOf(r).id, targetType: 'workspace', targetId: dataOf(r).id, targetLabel: dataOf(r).name || (req.body && req.body.name) })],
  ['PUT', '/workspaces/:id', 'workspace.updated', (req, p) => ({ workspaceId: p.id, targetType: 'workspace', targetId: p.id, metadata: { fields: changedKeys(req.body, ['name', 'description', 'logo', 'isActive']) } })],
  ['DELETE', '/workspaces/:id', 'workspace.deleted', (req, p) => ({ workspaceId: p.id, targetType: 'workspace', targetId: p.id })],
  ['POST', '/workspaces/:id/restore', 'workspace.restored', (req, p) => ({ workspaceId: p.id, targetType: 'workspace', targetId: p.id })],
  ['PUT', '/workspaces/:id/transfer-ownership', 'workspace.ownership_transferred', (req, p) => ({ workspaceId: p.id, targetType: 'workspace', targetId: p.id, metadata: pick(req.body, ['newOwnerId', 'userId']) })],
  ['POST', '/workspaces/:id/members', 'workspace.member_added', (req, p) => ({ workspaceId: p.id, targetType: 'user', targetLabel: req.body && req.body.email, metadata: pick(req.body, ['email', 'role']) })],
  ['PUT', '/workspaces/:id/members/:userId', 'workspace.member_role_changed', (req, p) => ({ workspaceId: p.id, targetType: 'user', targetId: p.userId, metadata: pick(req.body, ['role']) })],
  ['DELETE', '/workspaces/:id/members/:userId', 'workspace.member_removed', (req, p) => ({ workspaceId: p.id, targetType: 'user', targetId: p.userId })],

  ['POST', '/projects', 'project.created', (req, p, r) => ({ projectId: dataOf(r).id, targetType: 'project', targetId: dataOf(r).id, targetLabel: dataOf(r).name || (req.body && req.body.name) })],
  ['POST', '/projects/from-template', 'project.created', (req, p, r) => ({ projectId: dataOf(r).id, targetType: 'project', targetId: dataOf(r).id, targetLabel: dataOf(r).name })],
  ['PUT', '/projects/:id', 'project.updated', (req, p) => ({ projectId: p.id, targetType: 'project', targetId: p.id, metadata: { fields: changedKeys(req.body, ['name', 'description', 'status', 'color', 'key']) } })],
  ['DELETE', '/projects/:id', 'project.archived', (req, p) => ({ projectId: p.id, targetType: 'project', targetId: p.id })],
  ['POST', '/projects/:id/members', 'project.member_added', (req, p) => ({ projectId: p.id, targetType: 'user', targetId: req.body && req.body.userId, metadata: pick(req.body, ['userId', 'role']) })],
  ['PUT', '/projects/:id/members/:userId', 'project.member_role_changed', (req, p) => ({ projectId: p.id, targetType: 'user', targetId: p.userId, metadata: pick(req.body, ['role']) })],
  ['DELETE', '/projects/:id/members/:userId', 'project.member_removed', (req, p) => ({ projectId: p.id, targetType: 'user', targetId: p.userId })],

  ['POST', '/invites', 'invite.sent', (req, p, r) => ({ workspaceId: req.body && req.body.workspaceId, projectId: req.body && req.body.projectId, targetType: 'invite', targetLabel: req.body && req.body.email, metadata: pick(req.body, ['email', 'role']) })],
  ['POST', '/invites/:token/accept', 'invite.accepted', () => ({ targetType: 'invite' })],
  ['DELETE', '/invites/:id', 'invite.cancelled', (req, p) => ({ targetType: 'invite', targetId: p.id })],
  ['POST', '/guest-access', 'guest.granted', (req) => ({ targetType: 'guest', metadata: pick(req.body, ['resourceType', 'resourceId', 'canView', 'canComment', 'expiresAt']) })],
  ['DELETE', '/guest-access/:id', 'guest.revoked', (req, p) => ({ targetType: 'guest', targetId: p.id })],

  ['POST', '/api-keys', 'apikey.created', (req, p, r) => ({ targetType: 'apikey', targetId: dataOf(r).id, targetLabel: req.body && req.body.name })],
  ['DELETE', '/api-keys/:id', 'apikey.revoked', (req, p) => ({ targetType: 'apikey', targetId: p.id })],

  ['POST', '/projects/:projectId/import', 'issues.imported', (req, p, r) => ({ projectId: p.projectId, targetType: 'project', targetId: p.projectId, metadata: pick(dataOf(r), ['created', 'epics', 'sprintsCreated', 'releasesCreated']) })],
  ['GET', '/tasks/export', 'issues.exported', (req) => ({ projectId: req.query && req.query.projectId, workspaceId: req.query && req.query.workspaceId, targetType: 'project', targetId: req.query && req.query.projectId })],
  ['DELETE', '/tasks/:id', 'issues.deleted', (req, p) => ({ taskId: p.id, targetType: 'task', targetId: p.id })],
  ['DELETE', '/tasks/bulk', 'issues.deleted', (req) => ({ targetType: 'task', metadata: { count: Array.isArray(req.body && req.body.taskIds) ? req.body.taskIds.length : 0 } })],
  ['POST', '/tasks/bulk-archive', 'issues.deleted', (req) => ({ targetType: 'task', metadata: { count: Array.isArray(req.body && req.body.taskIds) ? req.body.taskIds.length : 0, archived: true } })],
  ['POST', '/sprints/:id/start', 'sprint.started', (req, p, r) => ({ projectId: dataOf(r).projectId, targetType: 'sprint', targetId: p.id, targetLabel: dataOf(r).name })],
  ['POST', '/sprints/:id/complete', 'sprint.completed', (req, p, r) => ({ projectId: dataOf(r).projectId, targetType: 'sprint', targetId: p.id, targetLabel: dataOf(r).name, metadata: r && r.summary })],
  ['DELETE', '/sprints/:id', 'sprint.deleted', (req, p) => ({ targetType: 'sprint', targetId: p.id })],
  ['POST', '/releases/:id/release', 'release.released', (req, p, r) => ({ projectId: dataOf(r).projectId, targetType: 'release', targetId: p.id, targetLabel: dataOf(r).name })],
  ['PUT', '/workspaces/:workspaceId/permission-scheme', 'project.permissions_updated', (req, p) => ({ workspaceId: p.workspaceId, targetType: 'workspace', targetId: p.workspaceId, targetLabel: 'Workspace permission scheme' })],
  ['PUT', '/projects/:projectId/permission-scheme', 'project.permissions_updated', (req, p) => ({ projectId: p.projectId, targetType: 'project', targetId: p.projectId, targetLabel: 'Project permission scheme' })],
  ['PUT', '/workspaces/:workspaceId/sso', 'sso.updated', (req, p) => ({ workspaceId: p.workspaceId, targetType: 'workspace', targetId: p.workspaceId, targetLabel: 'Single sign-on', metadata: { enabled: req.body && req.body.enabled, enforce: req.body && req.body.enforce, domains: req.body && req.body.allowedDomains } })],
];

const stripPrefix = (s) => s.replace(/^\/api\/v\d+/, '').replace(/\/+$/, '') || '/';

const auditTrail = (req, res, next) => {
  const cap = { body: null, route: null, params: null };
  const capture = () => {
    if (!cap.route && req.route) {
      cap.route = stripPrefix(`${req.baseUrl || ''}${req.route.path}`);
      cap.params = { ...req.params };
    }
  };

  const origJson = res.json.bind(res);
  res.json = (body) => { capture(); cap.body = body; return origJson(body); };
  const origSend = res.send.bind(res);
  res.send = (body) => { capture(); return origSend(body); };

  res.on('finish', () => {
    (async () => {
      capture();
      if (!cap.route) return;
      const isLogin = req.method === 'POST' && cap.route === '/auth/login';

      if (isLogin) {
        if (res.statusCode === 200) {
          const u = (cap.body && cap.body.data && cap.body.data.user) || {};
          await audit(req, { action: 'auth.login', actorId: u.id, actorEmail: u.email || (req.body && req.body.email), targetType: 'user', targetId: u.id });
        } else if (res.statusCode === 401 || res.statusCode === 400 || res.statusCode === 403) {
          await audit(req, { action: 'auth.login_failed', actorEmail: req.body && req.body.email, targetType: 'user', metadata: { status: res.statusCode } });
        }
        return;
      }

      if (res.statusCode >= 400) return;
      const rule = RULES.find(([m, p]) => m === req.method && p === cap.route);
      if (!rule) return;
      const [, , action, build] = rule;
      const extra = await build(req, cap.params || {}, cap.body);
      if (extra === null) return;

      if (extra.taskId) {
        try {
          const { sequelize } = require('../config/database');
          const [rows] = await sequelize.query('SELECT project_id, title, task_key FROM tasks WHERE id = :id', { replacements: { id: extra.taskId } });
          if (rows[0]) { extra.projectId = extra.projectId || rows[0].project_id; extra.targetLabel = extra.targetLabel || `${rows[0].task_key || ''} ${rows[0].title}`.trim(); }
        } catch (_) { /* best effort */ }
        delete extra.taskId;
      }
      await audit(req, { action, ...extra });
    })().catch((e) => logger.warn('auditTrail failed (non-fatal):', e.message));
  });

  next();
};

module.exports = { auditTrail, RULES };
