// RBAC V2 — STEP 8
// Complete rewrite of the permission middleware.
// V1 was resource-blind (one permission object for ALL resources).
// V2 is resource-aware with 3-level resolution:
//   Platform (super_admin) → Workspace role → Project role (override) → Guest scoping

'use strict';

const { Op } = require('sequelize');
const logger = require('../utils/logger');
const { EDITABLE_ROLES, loadOverrides } = require('../utils/permissionOverrides');

// ─────────────────────────────────────────────────────────────────────────────
// PERMISSION MATRIX
// Each role maps to a set of resources.
// Each resource maps to actions with values:
//   true               → always allowed
//   false              → always denied
//   'own'              → allowed only if user created the item (createdBy === userId)
//   'own_or_assigned'  → allowed if user created OR is assigned to the item
//   'assigned'         → allowed only if user is assigned to the item
//   'review_only'      → reviewer can only change the approval/review status
// ─────────────────────────────────────────────────────────────────────────────

const PERMISSION_MATRIX = {

  // ── WORKSPACE ROLES ────────────────────────────────────────────────────────

  owner: {
    workspace:    { create: true,  read: true,  update: true,  delete: true,  manage_members: true,  manage_billing: true,  transfer_ownership: true },
    project:      { create: true,  read: true,  update: true,  delete: true,  archive: true,         manage_members: true,  manage_settings: true },
    task:         { create: true,  read: true,  update: true,  delete: true,  assign: true,          archive: true,         approve: true },
    subtask:      { create: true,  read: true,  update: true,  delete: true },
    comment:      { create: true,  read: true,  update: true,  delete: true },
    attachment:   { create: true,  read: true,  update: true,  delete: true },
    document:     { create: true,  read: true,  update: true,  delete: true },
    whiteboard:   { create: true,  read: true,  update: true,  delete: true },
    chat:         { create: true,  read: true,  update: true,  delete: true },
    budget:       { create: true,  read: true,  update: true,  delete: true,  view_amounts: true },
    time_log:     { create: true,  read: true,  update: true,  delete: true },
    resource:     { create: true,  read: true,  update: true,  delete: true },
    report:       { create: true,  read: true,  update: true,  delete: true },
    custom_field: { create: true,  read: true,  update: true,  delete: true },
    status:       { create: true,  read: true,  update: true,  delete: true },
    workflow:     { create: true,  read: true,  update: true,  delete: true },
    sprint:       { create: true,  read: true,  update: true,  delete: true },
    custom_role:  { create: true,  read: true,  update: true,  delete: true },
    invite:       { create: true,  read: true,  update: true,  delete: true }
  },

  admin: {
    workspace:    { create: false, read: true,  update: true,  delete: false, manage_members: true,  manage_billing: false, transfer_ownership: false },
    project:      { create: true,  read: true,  update: true,  delete: true,  archive: true,         manage_members: true,  manage_settings: true },
    task:         { create: true,  read: true,  update: true,  delete: true,  assign: true,          archive: true,         approve: true },
    subtask:      { create: true,  read: true,  update: true,  delete: true },
    comment:      { create: true,  read: true,  update: true,  delete: true },
    attachment:   { create: true,  read: true,  update: true,  delete: true },
    document:     { create: true,  read: true,  update: true,  delete: true },
    whiteboard:   { create: true,  read: true,  update: true,  delete: true },
    chat:         { create: true,  read: true,  update: true,  delete: true },
    budget:       { create: true,  read: true,  update: true,  delete: true,  view_amounts: true },
    time_log:     { create: true,  read: true,  update: true,  delete: true },
    resource:     { create: true,  read: true,  update: true,  delete: true },
    report:       { create: true,  read: true,  update: true,  delete: true },
    custom_field: { create: true,  read: true,  update: true,  delete: true },
    status:       { create: true,  read: true,  update: true,  delete: true },
    workflow:     { create: true,  read: true,  update: true,  delete: true },
    sprint:       { create: true,  read: true,  update: true,  delete: true },
    custom_role:  { create: true,  read: true,  update: true,  delete: false },
    invite:       { create: true,  read: true,  update: true,  delete: true }
  },

  billing_admin: {
    // billing_admin ONLY has access to billing and high-level reports.
    // No project, task, or team data visible.
    workspace:    { create: false, read: true,  update: false, delete: false, manage_members: false, manage_billing: true,  transfer_ownership: false },
    budget:       { create: false, read: true,  update: false, delete: false, view_amounts: true },
    report:       { create: false, read: true,  update: false, delete: false }
  },

  // 'member' workspace role = fallback when no project_members record exists.
  // Minimal default — prevents accidental broad access.
  member: {
    workspace:    { create: false, read: true,  update: false, delete: false, manage_members: false },
    project:      { create: false, read: true,  update: false, delete: false, archive: false,        manage_members: false },
    task:         { create: false, read: true,  update: false, delete: false, assign: false,         archive: false },
    subtask:      { create: false, read: true,  update: false, delete: false },
    comment:      { create: true,  read: true,  update: 'own', delete: 'own' },
    attachment:   { create: false, read: true,  update: false, delete: false },
    document:     { create: false, read: true,  update: false, delete: false },
    whiteboard:   { create: false, read: true,  update: false, delete: false },
    chat:         { create: false, read: true,  update: false, delete: false },
    time_log:     { create: false, read: true,  update: false, delete: false },
    report:       { create: false, read: true,  update: false, delete: false }
  },

  // guest permissions are resolved via GuestAccess table — see resolveGuestPermission()
  guest: {},

  // ── PROJECT ROLES ──────────────────────────────────────────────────────────

  project_lead: {
    project:      { create: false, read: true,  update: true,  delete: false, archive: true,  manage_members: true,  manage_settings: true },
    task:         { create: true,  read: true,  update: true,  delete: true,  assign: true,   archive: true,         approve: true },
    subtask:      { create: true,  read: true,  update: true,  delete: true },
    comment:      { create: true,  read: true,  update: true,  delete: true },
    attachment:   { create: true,  read: true,  update: true,  delete: true },
    document:     { create: true,  read: true,  update: true,  delete: true },
    whiteboard:   { create: true,  read: true,  update: true,  delete: true },
    chat:         { create: true,  read: true,  update: false, delete: true },
    budget:       { create: true,  read: true,  update: true,  delete: false, view_amounts: true },
    time_log:     { create: true,  read: true,  update: true,  delete: true },
    resource:     { create: false, read: true,  update: false, delete: false },
    report:       { create: false, read: true,  update: false, delete: false },
    custom_field: { create: true,  read: true,  update: true,  delete: true },
    status:       { create: true,  read: true,  update: true,  delete: true },
    workflow:     { create: true,  read: true,  update: true,  delete: true },
    sprint:       { create: true,  read: true,  update: true,  delete: true },
    invite:       { create: true,  read: true,  update: true,  delete: true }
  },

  contributor: {
    project:      { create: false, read: true,  update: false, delete: false, archive: false, manage_members: false },
    task:         { create: true,  read: true,  update: 'own_or_assigned', delete: 'own', assign: false, archive: 'own' },
    subtask:      { create: true,  read: true,  update: 'own_or_assigned', delete: 'own' },
    comment:      { create: true,  read: true,  update: 'own', delete: 'own' },
    attachment:   { create: true,  read: true,  update: false, delete: 'own' },
    document:     { create: true,  read: true,  update: true,  delete: false },
    whiteboard:   { create: false, read: true,  update: true,  delete: false },
    chat:         { create: false, read: true,  update: false, delete: false },
    budget:       { create: false, read: false, update: false, delete: false, view_amounts: false },
    time_log:     { create: true,  read: 'own', update: 'own', delete: 'own' },
    resource:     { create: false, read: false, update: false, delete: false },
    report:       { create: false, read: true,  update: false, delete: false },
    custom_field: { create: false, read: true,  update: false, delete: false },
    status:       { create: false, read: true,  update: false, delete: false },
    sprint:       { create: false, read: true,  update: false, delete: false }
  },

  // reporter: creates tasks, sees only own. Jira-style issue submitter.
  reporter: {
    project:      { create: false, read: true,  update: false, delete: false },
    task:         { create: true,  read: 'own', update: 'own', delete: 'own', assign: false, archive: false },
    subtask:      { create: false, read: 'own', update: false, delete: false },
    comment:      { create: true,  read: true,  update: 'own', delete: 'own' },
    attachment:   { create: true,  read: true,  update: false, delete: 'own' },
    document:     { create: false, read: false, update: false, delete: false },
    whiteboard:   { create: false, read: false, update: false, delete: false },
    chat:         { create: false, read: true,  update: false, delete: false },
    budget:       { create: false, read: false, update: false, delete: false },
    time_log:     { create: false, read: false, update: false, delete: false },
    report:       { create: false, read: false, update: false, delete: false }
  },

  // reviewer: approves/rejects tasks. Cannot edit task details.
  reviewer: {
    project:      { create: false, read: true,  update: false, delete: false },
    task:         { create: false, read: true,  update: 'review_only', delete: false, assign: false, approve: true },
    subtask:      { create: false, read: true,  update: false, delete: false },
    comment:      { create: true,  read: true,  update: 'own', delete: 'own' },
    attachment:   { create: false, read: true,  update: false, delete: false },
    document:     { create: false, read: true,  update: false, delete: false },
    whiteboard:   { create: false, read: true,  update: false, delete: false },
    chat:         { create: false, read: true,  update: false, delete: false },
    budget:       { create: false, read: false, update: false, delete: false },
    time_log:     { create: false, read: false, update: false, delete: false },
    report:       { create: false, read: true,  update: false, delete: false }
  },

  commenter: {
    project:      { create: false, read: true,  update: false, delete: false },
    task:         { create: false, read: true,  update: false, delete: false },
    subtask:      { create: false, read: true,  update: false, delete: false },
    comment:      { create: true,  read: true,  update: 'own', delete: 'own' },
    attachment:   { create: false, read: true,  update: false, delete: false },
    document:     { create: false, read: true,  update: false, delete: false },
    whiteboard:   { create: false, read: true,  update: false, delete: false },
    chat:         { create: false, read: true,  update: false, delete: false },
    budget:       { create: false, read: false, update: false, delete: false },
    time_log:     { create: false, read: false, update: false, delete: false },
    report:       { create: false, read: false, update: false, delete: false }
  },

  viewer: {
    project:      { create: false, read: true,  update: false, delete: false },
    task:         { create: false, read: true,  update: false, delete: false },
    subtask:      { create: false, read: true,  update: false, delete: false },
    comment:      { create: false, read: true,  update: false, delete: false },
    attachment:   { create: false, read: true,  update: false, delete: false },
    document:     { create: false, read: true,  update: false, delete: false },
    whiteboard:   { create: false, read: true,  update: false, delete: false },
    chat:         { create: false, read: false, update: false, delete: false },
    budget:       { create: false, read: false, update: false, delete: false },
    time_log:     { create: false, read: false, update: false, delete: false },
    report:       { create: false, read: true,  update: false, delete: false }
  },

  // Legacy roles — mapped to nearest V2 equivalent for backward compat
  pm:        null,  // resolved → project_lead at project level
  super_admin: null // resolved before matrix lookup
};

// ─────────────────────────────────────────────────────────────────────────────
// CORE PERMISSION RESOLVER
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resolves whether a user has permission for a resource+action.
 *
 * @param {object} opts
 * @param {object} opts.user           - req.user from auth middleware
 * @param {string} opts.workspaceId    - from req.params or req.body
 * @param {string} [opts.projectId]    - present for project-scoped routes
 * @param {string} opts.resource       - e.g. 'task', 'comment', 'budget'
 * @param {string} opts.action         - e.g. 'create', 'read', 'delete'
 * @param {string} [opts.itemOwnerId]  - createdBy field of the target item
 * @param {string[]} [opts.assigneeIds] - assignee list of the target item
 * @returns {{ allowed: boolean, reason?: string, effectiveRole?: string }}
 */
async function resolvePermission ({
  user, workspaceId, projectId,
  resource, action,
  itemOwnerId, assigneeIds = [], loadItem
}) {
  const { WorkspaceMembers, ProjectMembers, GuestAccess, Workspace } = require('../models');

  try {
    // ── Step 1: Super admin bypasses all checks ──────────────────────────────
    if (user.role === 'super_admin') {
      return { allowed: true, effectiveRole: 'super_admin', scope: 'platform' };
    }

    // ── Step 2: Workspace existence + owner check ────────────────────────────
    if (!workspaceId) {
      return { allowed: false, reason: 'workspace_id_required' };
    }

    const workspace = await Workspace.findByPk(workspaceId);
    if (!workspace) {
      return { allowed: false, reason: 'workspace_not_found' };
    }

    if (workspace.ownerId === user.id) {
      return { allowed: true, effectiveRole: 'owner', scope: 'workspace' };
    }

    // ── Step 3: Workspace membership lookup ─────────────────────────────────
    const wsMember = await WorkspaceMembers.findOne({
      where: { workspaceId, userId: user.id }
    });

    if (!wsMember) {
      return { allowed: false, reason: 'not_a_workspace_member' };
    }

    // ── Step 4: billing_admin is isolated to billing-only resources ──────────
    if (wsMember.role === 'billing_admin') {
      const result = evaluateMatrix('billing_admin', resource, action, user.id, itemOwnerId, assigneeIds);
      return { ...result, effectiveRole: 'billing_admin' };
    }

    // ── Step 5: Determine effective role (project overrides workspace) ────────
    let effectiveRole = wsMember.role;

    if (projectId) {
      const projMember = await ProjectMembers.findOne({
        where: { projectId, userId: user.id }
      });
      if (projMember) {
        effectiveRole = projMember.role;
      }
      // Map legacy 'pm' workspace role → 'project_lead' if no project record
      if (effectiveRole === 'pm') effectiveRole = 'project_lead';
    }

    // ── Step 6: Guest — must have explicit guest_access record ───────────────
    if (effectiveRole === 'guest') {
      return resolveGuestPermission({ user, workspaceId, projectId, resource, action, GuestAccess });
    }

    // ── Step 7: Evaluate against permission matrix (plus the workspace / project permission scheme) ──
    // Ownership-scoped rules ('own', 'assigned', 'own_or_assigned') need the target item.
    let ownerId = itemOwnerId;
    let assignees = assigneeIds;
    let override;
    if (EDITABLE_ROLES.includes(effectiveRole)) {
      const scheme = await loadOverrides(workspaceId, projectId);
      override = scheme[effectiveRole] && scheme[effectiveRole][resource] ? scheme[effectiveRole][resource][action] : undefined;
    }
    const ruleValue = override !== undefined
      ? override
      : (PERMISSION_MATRIX[effectiveRole] && PERMISSION_MATRIX[effectiveRole][resource]
        ? PERMISSION_MATRIX[effectiveRole][resource][action]
        : undefined);
    if (loadItem && ownerId === undefined && ['own', 'assigned', 'own_or_assigned'].includes(ruleValue)) {
      const ctx = await loadItem();
      ownerId = ctx.itemOwnerId;
      assignees = ctx.assigneeIds;
    }
    const result = evaluateMatrix(effectiveRole, resource, action, user.id, ownerId, assignees, override);
    return { ...result, effectiveRole };

  } catch (err) {
    logger.error('Permission resolution error:', err);
    return { allowed: false, reason: 'internal_error' };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MATRIX EVALUATION HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function evaluateMatrix (role, resource, action, userId, itemOwnerId, assigneeIds, override) {
  let actionValue;
  if (override !== undefined) {
    // A permission scheme explicitly sets this rule
    actionValue = override;
  } else {
    const roleMatrix = PERMISSION_MATRIX[role];
    if (!roleMatrix) return { allowed: false, reason: `unknown_role:${role}` };

    const resourceMatrix = roleMatrix[resource];
    if (!resourceMatrix) return { allowed: false, reason: `resource_not_granted:${resource}` };

    actionValue = resourceMatrix[action];
  }

  if (actionValue === true)  return { allowed: true };
  if (!actionValue)          return { allowed: false, reason: `action_denied:${action}` };

  // Ownership-scoped checks
  if (actionValue === 'own') {
    return { allowed: itemOwnerId === userId, reason: itemOwnerId !== userId ? 'not_owner' : undefined };
  }
  if (actionValue === 'assigned') {
    return { allowed: assigneeIds.includes(userId), reason: !assigneeIds.includes(userId) ? 'not_assigned' : undefined };
  }
  if (actionValue === 'own_or_assigned') {
    const allowed = itemOwnerId === userId || assigneeIds.includes(userId);
    return { allowed, reason: !allowed ? 'not_owner_or_assigned' : undefined };
  }
  if (actionValue === 'review_only') {
    // Reviewer can only update the review/approval status field — enforced at controller level too
    return { allowed: action === 'update', reason: action !== 'update' ? 'reviewer_update_only' : undefined };
  }

  return { allowed: false, reason: 'unresolved_action_value' };
}

async function resolveGuestPermission ({ user, workspaceId, projectId, resource, action, GuestAccess }) {
  if (!projectId) return { allowed: false, reason: 'guest_requires_project_context', effectiveRole: 'guest' };

  const access = await GuestAccess.findOne({
    where: {
      userId: user.id,
      workspaceId,
      resourceType: 'project',
      resourceId: projectId,
      [Op.or]: [
        { expiresAt: null },
        { expiresAt: { [Op.gt]: new Date() } }
      ]
    }
  });

  if (!access)          return { allowed: false, reason: 'guest_no_access_record',  effectiveRole: 'guest' };
  if (!access.canView)  return { allowed: false, reason: 'guest_view_not_permitted', effectiveRole: 'guest' };

  if (action === 'read')                                    return { allowed: true, effectiveRole: 'guest', scope: 'guest_scoped' };
  if (action === 'create' && resource === 'comment' && access.canComment) return { allowed: true, effectiveRole: 'guest', scope: 'guest_scoped' };

  return { allowed: false, reason: 'guest_action_denied', effectiveRole: 'guest' };
}

// ─────────────────────────────────────────────────────────────────────────────
// EXPRESS MIDDLEWARE FACTORIES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Primary permission check middleware for project-scoped routes.
 *
 * Usage:
 *   router.post('/', authenticate, checkPermission({ resource: 'task', action: 'create' }), handler)
 *   router.delete('/:id', authenticate, checkPermission({ resource: 'task', action: 'delete', requireOwnership: true }), handler)
 *
 * @param {object} opts
 * @param {string} opts.resource         - resource key from PERMISSION_MATRIX
 * @param {string} opts.action           - action key
 * @param {boolean} [opts.requireOwnership] - if true, pass itemOwnerId via req.itemOwnerId in handler or preceding middleware
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Loads the item a request targets so 'own' / 'own_or_assigned' / 'assigned' rules can be evaluated.
 * Returns { itemOwnerId, assigneeIds, projectId } (projectId lets routes addressed by a comment /
 * attachment / time-log id resolve their workspace through the parent task).
 */
const loadItemContext = async (req, resource) => {
  const { Task, TaskAssignees, Subtask, Comment, Attachment, TimeLog } = require('../models');
  const p = req.params;
  const ok = (v) => typeof v === 'string' && UUID_RE.test(v);
  let itemOwnerId = null;
  let extraAssignee = null;
  let task = null;

  // Reuse the task the middleware already loaded for this request (avoids a second query)
  const taskById = (id) => (req._permTask || (ok(id) ? Task.findByPk(id, { attributes: ['id', 'projectId', 'createdBy'] }) : null));

  if (resource === 'task') {
    task = await taskById(p.taskId || p.id);
    if (task) itemOwnerId = task.createdBy;
  } else if (resource === 'subtask') {
    task = await taskById(p.taskId);
    if (task) itemOwnerId = task.createdBy;
    if (ok(p.subtaskId)) {
      const st = await Subtask.findByPk(p.subtaskId, { attributes: ['id', 'assigneeId'] });
      if (st && st.assigneeId) extraAssignee = st.assigneeId;
    }
  } else if (resource === 'comment' && ok(p.id)) {
    const c = await Comment.findByPk(p.id, { attributes: ['id', 'userId', 'taskId'] });
    if (c) { itemOwnerId = c.userId; task = await taskById(c.taskId); }
  } else if (resource === 'attachment' && ok(p.id)) {
    const a = await Attachment.findByPk(p.id, { attributes: ['id', 'uploadedBy', 'taskId'] });
    if (a) { itemOwnerId = a.uploadedBy; task = await taskById(a.taskId); }
  } else if (resource === 'time_log' && ok(p.id)) {
    const t = await TimeLog.findByPk(p.id, { attributes: ['id', 'userId', 'taskId'] });
    if (t) { itemOwnerId = t.userId; task = await taskById(t.taskId); }
  }

  let assigneeIds = [];
  if (task) {
    const rows = await TaskAssignees.findAll({ where: { task_id: task.id }, attributes: ['user_id'], raw: true });
    assigneeIds = rows.map((r) => r.user_id);
  }
  if (extraAssignee) assigneeIds.push(extraAssignee);
  return { itemOwnerId, assigneeIds, projectId: task ? task.projectId : null };
};

const checkPermission = ({ resource, action, requireOwnership = false }) => {
  return async (req, res, next) => {
    try {
      let   projectId   = req.params.projectId || req.params.id || req.body.projectId;
      let   workspaceId = req.params.workspaceId || req.body.workspaceId || req.query.workspaceId;

      // Auto-resolve workspaceId from project when not explicitly provided.
      // This covers project/task routes where the URL only contains /:id (the projectId)
      // and no workspaceId param exists in the path.
      if (!workspaceId) {
        try {
          const { Project, Task } = require('../models');
          if (projectId) {
            // Try project table first
            let proj = await Project.findByPk(projectId, { attributes: ['id', 'workspaceId'] });
            if (proj) {
              workspaceId = proj.workspaceId;
            } else {
              // projectId might actually be a taskId on task routes (req.params.id)
              const task = await Task.findByPk(projectId, { attributes: ['id', 'projectId', 'createdBy'] });
              if (task) {
                req._permTask = task;
                projectId = task.projectId;
                const taskProj = await Project.findByPk(task.projectId, { attributes: ['workspaceId'] });
                if (taskProj) workspaceId = taskProj.workspaceId;
              }
            }
          }
          // Also resolve via :taskId param (subtask/time-log nested routes)
          if (!workspaceId && req.params.taskId) {
            const task = await Task.findByPk(req.params.taskId, { attributes: ['id', 'projectId', 'createdBy'] });
            if (task) {
              req._permTask = task;
              projectId = task.projectId;
              const taskProj = await Project.findByPk(task.projectId, { attributes: ['workspaceId'] });
              if (taskProj) workspaceId = taskProj.workspaceId;
            }
          }
        } catch (_) { /* non-critical — continue without workspaceId */ }
      }

      // Owner / assignee of the targeted item — loaded lazily, only when a rule needs it
      let itemCtx = null;
      const loadItem = async () => {
        if (!itemCtx) {
          try { itemCtx = await loadItemContext(req, resource); }
          catch (_) { itemCtx = { itemOwnerId: null, assigneeIds: [], projectId: null }; }
        }
        return itemCtx;
      };

      // Routes addressed by a comment / attachment / time-log id carry no project or workspace,
      // so resolve them through the item's parent task.
      if (!workspaceId && req.user.role !== 'super_admin') {
        const ctx = await loadItem();
        if (ctx.projectId) {
          projectId = ctx.projectId;
          try {
            const { Project } = require('../models');
            const proj = await Project.findByPk(ctx.projectId, { attributes: ['id', 'workspaceId'] });
            if (proj) workspaceId = proj.workspaceId;
          } catch (_) { /* non-critical */ }
        }
      }

      const { allowed, reason, effectiveRole } = await resolvePermission({
        user:       req.user,
        workspaceId,
        projectId,
        resource,
        action,
        itemOwnerId:  req.itemOwnerId,
        assigneeIds:  req.assigneeIds,
        loadItem
      });

      if (!allowed) {
        logger.warn(`Permission denied | user=${req.user.id} | role=${effectiveRole} | ${resource}.${action} | reason=${reason}`);
        return res.status(403).json({
          success: false,
          error: 'You do not have permission to perform this action',
          code: reason
        });
      }

      // Attach resolved role so controllers can use it for scoped queries
      req.user.effectiveRole = effectiveRole;
      next();
    } catch (err) {
      logger.error('checkPermission middleware error:', err);
      res.status(500).json({ success: false, error: 'Permission check failed' });
    }
  };
};

/**
 * Workspace-level permission check.
 *
 * Usage:
 *   router.post('/members', authenticate, checkWorkspacePerm({ action: 'manage_members' }), handler)
 */
const checkWorkspacePerm = ({ action }) => {
  return async (req, res, next) => {
    try {
      const workspaceId = req.params.workspaceId || req.params.id;

      const { allowed, reason, effectiveRole } = await resolvePermission({
        user: req.user,
        workspaceId,
        resource: 'workspace',
        action
      });

      if (!allowed) {
        logger.warn(`Workspace permission denied | user=${req.user.id} | workspace.${action} | reason=${reason}`);
        return res.status(403).json({
          success: false,
          error: 'You do not have permission to perform this action',
          code: reason
        });
      }

      req.user.effectiveRole = effectiveRole;
      next();
    } catch (err) {
      logger.error('checkWorkspacePerm middleware error:', err);
      res.status(500).json({ success: false, error: 'Permission check failed' });
    }
  };
};

/**
 * Require exact role(s) — for platform-level or strict role gates.
 *
 * Usage:
 *   router.get('/users', authenticate, requireRole('super_admin'), handler)
 *   router.get('/billing', authenticate, requireAnyRole(['owner', 'billing_admin']), handler)
 */
const requireRole = (role) => {
  return (req, res, next) => {
    if (req.user && req.user.role === role) return next();
    logger.warn(`Role guard failed | user=${req.user?.id} | required=${role} | has=${req.user?.role}`);
    return res.status(403).json({ success: false, error: `${role} access required` });
  };
};

const requireAnyRole = (roles) => {
  return (req, res, next) => {
    if (req.user && roles.includes(req.user.role)) return next();
    logger.warn(`Role guard failed | user=${req.user?.id} | required=one of [${roles}] | has=${req.user?.role}`);
    return res.status(403).json({ success: false, error: 'Insufficient privileges' });
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────────────────────────────────────

module.exports = {
  checkPermission,
  checkWorkspacePerm,
  requireRole,
  requireAnyRole,
  resolvePermission,
  PERMISSION_MATRIX
};
