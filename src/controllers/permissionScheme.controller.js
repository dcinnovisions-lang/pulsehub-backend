const { PermissionOverride, Project } = require('../models');
const { PERMISSION_MATRIX } = require('../middleware/permissions');
const { EDITABLE_ROLES, EDITABLE, VALUES, fromRuleValue, clearCache } = require('../utils/permissionOverrides');
const logger = require('../utils/logger');

const nest = (rows) => {
  const out = {};
  rows.forEach((r) => {
    out[r.role] = out[r.role] || {};
    out[r.role][r.resource] = out[r.role][r.resource] || {};
    out[r.role][r.resource][r.action] = r.value;
  });
  return out;
};

// Built-in matrix restricted to the customisable roles/resources/actions, as strings
const defaultsMatrix = () => {
  const out = {};
  EDITABLE_ROLES.forEach((role) => {
    out[role] = {};
    Object.entries(EDITABLE).forEach(([resource, actions]) => {
      out[role][resource] = {};
      actions.forEach((action) => {
        const v = PERMISSION_MATRIX[role] && PERMISSION_MATRIX[role][resource] ? PERMISSION_MATRIX[role][resource][action] : undefined;
        out[role][resource][action] = v === undefined ? 'false' : fromRuleValue(v);
      });
    });
  });
  return out;
};

// Resolves { workspaceId, projectId|null } from the route
const scopeOf = async (req) => {
  if (req.params.projectId) {
    const project = await Project.findByPk(req.params.projectId, { attributes: ['id', 'workspaceId', 'name'] });
    if (!project) { const e = new Error('Project not found'); e.status = 404; throw e; }
    return { workspaceId: project.workspaceId, projectId: project.id, label: project.name };
  }
  return { workspaceId: req.params.workspaceId, projectId: null, label: 'workspace' };
};

const readState = async (scope) => {
  const own = await PermissionOverride.findAll({
    where: { workspaceId: scope.workspaceId, projectId: scope.projectId },
    attributes: ['role', 'resource', 'action', 'value'], raw: true
  });
  let inherited = {};
  if (scope.projectId) {
    const ws = await PermissionOverride.findAll({
      where: { workspaceId: scope.workspaceId, projectId: null },
      attributes: ['role', 'resource', 'action', 'value'], raw: true
    });
    inherited = nest(ws);
  }
  return {
    scope: scope.projectId ? 'project' : 'workspace',
    editableRoles: EDITABLE_ROLES,
    editable: EDITABLE,
    values: VALUES,
    defaults: defaultsMatrix(),
    inherited,
    overrides: nest(own),
  };
};

const handleError = (err, res, next) => {
  if (err.status) return res.status(err.status).json({ success: false, error: err.message });
  logger.error('Permission scheme error:', err);
  return next(err);
};

/** @route GET /api/v1/(projects|workspaces)/:id/permission-scheme */
const getScheme = async (req, res, next) => {
  try {
    const scope = await scopeOf(req);
    res.json({ success: true, data: await readState(scope) });
  } catch (err) { handleError(err, res, next); }
};

/**
 * @route PUT /api/v1/(projects|workspaces)/:id/permission-scheme
 * body: { overrides: { role: { resource: { action: 'true'|'false'|'own'|'own_or_assigned'|'assigned'|null } } } }
 * Replaces the scope's overrides. Rules that equal the inherited/default value are not stored.
 */
const putScheme = async (req, res, next) => {
  try {
    const incoming = req.body && req.body.overrides;
    if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) {
      return res.status(400).json({ success: false, error: 'overrides must be an object' });
    }
    const scope = await scopeOf(req);
    const defaults = defaultsMatrix();
    const rows = [];

    for (const [role, resources] of Object.entries(incoming)) {
      if (!EDITABLE_ROLES.includes(role)) {
        return res.status(400).json({ success: false, error: `Role "${role}" cannot be customised. Editable roles: ${EDITABLE_ROLES.join(', ')}` });
      }
      for (const [resource, actions] of Object.entries(resources || {})) {
        if (!EDITABLE[resource]) {
          return res.status(400).json({ success: false, error: `"${resource}" permissions cannot be customised` });
        }
        for (const [action, value] of Object.entries(actions || {})) {
          if (!EDITABLE[resource].includes(action)) {
            return res.status(400).json({ success: false, error: `"${resource}.${action}" cannot be customised` });
          }
          if (value === null || value === undefined) continue; // inherit
          if (!VALUES.includes(String(value))) {
            return res.status(400).json({ success: false, error: `Value for ${role} ${resource}.${action} must be one of: ${VALUES.join(', ')}` });
          }
          // Safety: a project lead must always be able to read work in their project
          if (role === 'project_lead' && resource === 'task' && action === 'read' && String(value) !== 'true') {
            return res.status(400).json({ success: false, error: 'Project leads must keep permission to read issues' });
          }
          if (String(value) === defaults[role][resource][action] && !scope.projectId) continue;
          rows.push({ workspaceId: scope.workspaceId, projectId: scope.projectId, role, resource, action, value: String(value), updatedBy: req.user.id });
        }
      }
    }

    await PermissionOverride.sequelize.transaction(async (transaction) => {
      await PermissionOverride.destroy({ where: { workspaceId: scope.workspaceId, projectId: scope.projectId }, transaction });
      if (rows.length) await PermissionOverride.bulkCreate(rows, { transaction });
    });
    clearCache();
    res.json({ success: true, data: await readState(scope) });
  } catch (err) { handleError(err, res, next); }
};

module.exports = { getScheme, putScheme };
