// Permission schemes: which roles / resources / actions can be customised, and a small cache
// of the overrides so the permission middleware does not query on every request.

const EDITABLE_ROLES = ['project_lead', 'contributor', 'reporter', 'reviewer', 'commenter', 'viewer'];

// resource -> actions that may be customised. 'project' and 'workspace' (membership, settings,
// billing, deleting) are deliberately not customisable so nobody can lock owners out.
const EDITABLE = {
  task: ['create', 'read', 'update', 'delete', 'assign', 'archive', 'approve'],
  subtask: ['create', 'read', 'update', 'delete'],
  comment: ['create', 'read', 'update', 'delete'],
  attachment: ['create', 'read', 'update', 'delete'],
  time_log: ['create', 'read', 'update', 'delete'],
  sprint: ['create', 'read', 'update', 'delete'],
  document: ['create', 'read', 'update', 'delete'],
  whiteboard: ['create', 'read', 'update', 'delete'],
  chat: ['create', 'read', 'update', 'delete'],
  budget: ['create', 'read', 'update', 'delete', 'view_amounts'],
  custom_field: ['create', 'read', 'update', 'delete'],
  status: ['create', 'read', 'update', 'delete'],
  report: ['read'],
};

const VALUES = ['true', 'false', 'own', 'own_or_assigned', 'assigned'];

const toRuleValue = (v) => (v === 'true' ? true : v === 'false' ? false : v);
const fromRuleValue = (v) => (v === true ? 'true' : v === false ? 'false' : String(v));

const TTL_MS = 15 * 1000;
const cache = new Map(); // key -> { at, data }

const keyOf = (workspaceId, projectId) => `${workspaceId || ''}:${projectId || ''}`;
const clearCache = () => cache.clear();

// Returns { role: { resource: { action: <rule value> } } } for a project (workspace scheme first, project scheme on top)
const loadOverrides = async (workspaceId, projectId) => {
  if (!workspaceId) return {};
  const key = keyOf(workspaceId, projectId);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.data;

  let data = {};
  try {
    const { PermissionOverride } = require('../models');
    if (PermissionOverride && PermissionOverride.findAll) {
      const { Op } = require('sequelize');
      const rows = await PermissionOverride.findAll({
        where: { workspaceId, projectId: projectId ? { [Op.or]: [null, projectId] } : null },
        attributes: ['projectId', 'role', 'resource', 'action', 'value'],
        raw: true
      });
      // workspace-level rows first, project-level rows override them
      (rows || []).sort((a, b) => (a.projectId ? 1 : 0) - (b.projectId ? 1 : 0)).forEach((r) => {
        data[r.role] = data[r.role] || {};
        data[r.role][r.resource] = data[r.role][r.resource] || {};
        data[r.role][r.resource][r.action] = toRuleValue(r.value);
      });
    }
  } catch (_) { data = {}; }
  cache.set(key, { at: Date.now(), data });
  return data;
};

module.exports = { EDITABLE_ROLES, EDITABLE, VALUES, toRuleValue, fromRuleValue, loadOverrides, clearCache };
