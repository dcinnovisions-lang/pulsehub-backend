const { Op } = require('sequelize');
const { sequelize } = require('../config/database');
const {
  Project, Status, Sprint, Release, Task, TaskAssignees, User, Workspace, WorkspaceMembers, ProjectMembers
} = require('../models');
const { buildImportPlan } = require('../utils/issueImport');
const logger = require('../utils/logger');

const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();

const STATUS_GROUPS = [
  { target: /^(to do|todo|open|backlog|new)$/i, names: ['to do', 'todo', 'open', 'backlog', 'new', 'reported', 'created', 'selected for development', 'ready for development'] },
  { target: /^(in progress)$/i, names: ['in progress', 'in development', 'in dev', 'doing', 'started', 'wip', 'in review', 'review', 'code review'] },
  { target: /^(ready for retest)$/i, names: ['ready for retest', 'ready for test', 'ready for testing', 'ready for qa', 'in testing', 'testing', 'in qa', 'qa', 'to verify', 'verify'] },
  { target: /^(reopened)$/i, names: ['reopened', 're-opened', 'reopen'] },
  { target: /^(done|closed|completed|resolved)$/i, names: ['done', 'closed', 'resolved', 'complete', 'completed', 'fixed', 'released', 'won\'t do', 'wont do', 'cancelled', 'canceled'] },
];

const isDoneName = (n) => /^(done|closed|completed|resolved)$/i.test(String(n || ''));

// ── shared: parse the file and resolve every reference against the project ──────────────────
const prepare = async (req) => {
  const { projectId } = req.params;
  const csvData = req.body.csvData;
  if (typeof csvData !== 'string' || !csvData.trim()) {
    const e = new Error('csvData is required');
    e.status = 400;
    throw e;
  }
  if (csvData.length > 6 * 1024 * 1024) {
    const e = new Error('The file is larger than 6 MB');
    e.status = 400;
    throw e;
  }

  let plan;
  try {
    plan = buildImportPlan(csvData, req.body.mapping);
  } catch (err) {
    if (err.code && String(err.code).startsWith('CSV_')) { err.status = 400; }
    throw err;
  }

  const project = await Project.findByPk(projectId, { attributes: ['id', 'name', 'key', 'workspaceId'] });
  if (!project) { const e = new Error('Project not found'); e.status = 404; throw e; }

  const [statuses, sprints, releases, epics, wsMembers, projMembers, workspace] = await Promise.all([
    Status.findAll({ where: { projectId }, order: [['position', 'ASC']] }),
    Sprint.findAll({ where: { projectId } }),
    Release.findAll({ where: { projectId } }),
    Task.findAll({ where: { projectId, issueType: 'epic', isArchived: false }, attributes: ['id', 'title', 'taskKey'] }),
    WorkspaceMembers.findAll({ where: { workspaceId: project.workspaceId }, attributes: ['userId'], raw: true }),
    ProjectMembers.findAll({ where: { projectId }, attributes: ['userId'], raw: true }),
    Workspace.findByPk(project.workspaceId, { attributes: ['ownerId'] })
  ]);

  const userIds = [...new Set([...wsMembers.map((m) => m.userId), ...projMembers.map((m) => m.userId), workspace && workspace.ownerId].filter(Boolean))];
  const users = userIds.length ? await User.findAll({ where: { id: userIds }, attributes: ['id', 'email', 'firstName', 'lastName'] }) : [];

  const userIndex = { email: new Map(), full: new Map(), first: new Map() };
  const firstCount = {};
  users.forEach((u) => {
    userIndex.email.set(norm(u.email), u.id);
    userIndex.full.set(norm(`${u.firstName} ${u.lastName}`), u.id);
    const f = norm(u.firstName);
    firstCount[f] = (firstCount[f] || 0) + 1;
    userIndex.first.set(f, u.id);
  });
  const findUser = (label) => {
    const n = norm(label);
    if (!n) return null;
    return userIndex.email.get(n) || userIndex.full.get(n) || (firstCount[n] === 1 ? userIndex.first.get(n) : null) || null;
  };

  return { plan, project, statuses, sprints, releases, epics, findUser, options: req.body.options || {} };
};

// Which project status does an imported status name land in?
const resolveStatus = (name, statuses, options, toCreate) => {
  if (!name) return { statusId: (statuses.find((s) => s.isDefault) || statuses[0] || {}).id || null };
  const n = norm(name);
  const exact = statuses.find((s) => norm(s.name) === n);
  if (exact) return { statusId: exact.id };
  for (const g of STATUS_GROUPS) {
    if (g.names.includes(n)) {
      const target = statuses.find((s) => g.target.test(s.name));
      if (target) return { statusId: target.id, mappedTo: target.name };
    }
  }
  if (options.createMissingStatuses) {
    toCreate.add(name.trim());
    return { createStatus: name.trim() };
  }
  const fallback = statuses.find((s) => s.isDefault) || statuses[0];
  return { statusId: fallback ? fallback.id : null, fallback: fallback ? fallback.name : null };
};

// Resolves the whole plan and returns everything the preview (and the import) needs.
const resolvePlan = (ctx) => {
  const { plan, statuses, sprints, releases, epics, findUser, options } = ctx;
  const warnings = [];
  const toCreate = { statuses: new Set(), sprints: new Map(), releases: new Set() };
  const unmatchedUsers = new Set();
  const unresolvedEpics = new Set();
  const fallbackStatuses = new Map();
  const mappedStatuses = new Map();

  const byExternalKey = new Map();
  const epicTitles = new Map();
  plan.issues.forEach((i) => {
    if (i.externalKey) byExternalKey.set(norm(i.externalKey), i);
    if (i.issueType === 'epic') epicTitles.set(norm(i.title), i);
  });
  const existingEpicByRef = new Map();
  epics.forEach((e) => { existingEpicByRef.set(norm(e.title), e); if (e.taskKey) existingEpicByRef.set(norm(e.taskKey), e); });

  const items = plan.issues.map((i) => {
    const item = { ...i };

    const st = resolveStatus(i.statusName, statuses, options, toCreate.statuses);
    item.status = st;
    if (st.mappedTo) mappedStatuses.set(`${i.statusName} → ${st.mappedTo}`, true);
    if (st.fallback) fallbackStatuses.set(i.statusName, st.fallback);

    item.assigneeId = null;
    if (i.assignee) {
      item.assigneeId = findUser(i.assignee);
      if (!item.assigneeId) unmatchedUsers.add(i.assignee);
    }
    item.reporterId = i.reporter ? findUser(i.reporter) : null;

    item.sprint = null;
    if (i.sprintName && i.issueType !== 'epic') {
      const existing = sprints.find((s) => norm(s.name) === norm(i.sprintName));
      if (existing) item.sprint = { id: existing.id };
      else if (options.createMissingSprints) {
        item.sprint = { create: i.sprintName };
        if (!toCreate.sprints.has(i.sprintName)) toCreate.sprints.set(i.sprintName, []);
        toCreate.sprints.get(i.sprintName).push(i);
      } else warnings.push(`Sprint "${i.sprintName}" does not exist in this project — issues were placed in the backlog. Enable "Create missing sprints" to import them.`);
    }

    item.release = null;
    if (i.releaseName) {
      const existing = releases.find((r) => norm(r.name) === norm(i.releaseName));
      if (existing) item.release = { id: existing.id };
      else if (options.createMissingReleases) { item.release = { create: i.releaseName }; toCreate.releases.add(i.releaseName); }
      else warnings.push(`Release "${i.releaseName}" does not exist in this project — issues were imported without a release. Enable "Create missing releases" to import them.`);
    }

    item.epic = null;
    if (i.epicRef && i.issueType !== 'epic') {
      const ref = norm(i.epicRef);
      const inFile = byExternalKey.get(ref) || epicTitles.get(ref);
      if (inFile && inFile.issueType === 'epic') item.epic = { fileRow: inFile.rowNumber };
      else if (existingEpicByRef.get(ref)) item.epic = { id: existingEpicByRef.get(ref).id };
      else unresolvedEpics.add(i.epicRef);
    }
    return item;
  });

  if (unmatchedUsers.size) warnings.push(`${unmatchedUsers.size} assignee(s) were not found among this workspace's members and were left unassigned: ${[...unmatchedUsers].slice(0, 8).join(', ')}${unmatchedUsers.size > 8 ? '…' : ''}`);
  if (unresolvedEpics.size) warnings.push(`${unresolvedEpics.size} epic reference(s) could not be resolved: ${[...unresolvedEpics].slice(0, 6).join(', ')}${unresolvedEpics.size > 6 ? '…' : ''}`);
  fallbackStatuses.forEach((fallback, name) => warnings.push(`Status "${name}" does not exist — issues were set to "${fallback}". Enable "Create missing statuses" to keep it.`));

  const summary = {
    totalRows: plan.rowCount,
    importable: items.length,
    skipped: plan.errors.length,
    byType: items.reduce((m, i) => { m[i.issueType] = (m[i.issueType] || 0) + 1; return m; }, {}),
    willCreate: {
      statuses: [...toCreate.statuses],
      sprints: [...toCreate.sprints.keys()],
      releases: [...toCreate.releases],
    },
    statusMapping: [...mappedStatuses.keys()],
  };
  return { items, warnings: [...new Set(warnings)], summary, toCreate };
};

const toPreviewRow = (i) => ({
  row: i.rowNumber, key: i.externalKey, type: i.issueType, title: i.title, status: i.statusName,
  priority: i.priority, assignee: i.assignee, sprint: i.sprintName, epic: i.epicRef, points: i.storyPoints,
  release: i.releaseName, due: i.dueDate,
});

const handleError = (err, res, next) => {
  if (err.status) return res.status(err.status).json({ success: false, error: err.message });
  logger.error('Issue import error:', err);
  return next(err);
};

/**
 * @route POST /api/v1/projects/:projectId/import/preview
 * Dry run: shows how the file will be interpreted, without writing anything.
 */
const previewImport = async (req, res, next) => {
  try {
    const ctx = await prepare(req);
    const { items, warnings, summary } = resolvePlan(ctx);
    res.json({
      success: true,
      data: {
        headers: ctx.plan.headers,
        mapping: ctx.plan.mapping,
        unmappedColumns: ctx.plan.unmapped,
        summary,
        warnings,
        errors: ctx.plan.errors.slice(0, 50),
        sample: items.slice(0, 8).map(toPreviewRow),
      },
    });
  } catch (err) { handleError(err, res, next); }
};

/**
 * @route POST /api/v1/projects/:projectId/import
 * Creates the issues in a single transaction (all or nothing).
 */
const runImport = async (req, res, next) => {
  try {
    const ctx = await prepare(req);
    const { items, warnings, summary, toCreate } = resolvePlan(ctx);
    if (items.length === 0) {
      return res.status(400).json({ success: false, error: 'Nothing to import — no rows have a summary/title', details: ctx.plan.errors.slice(0, 50) });
    }
    const { project, statuses } = ctx;
    const actorId = req.user.id;

    const result = await sequelize.transaction(async (transaction) => {
      // 1) new statuses / sprints / releases
      const statusByName = new Map(statuses.map((s) => [norm(s.name), s.id]));
      let position = statuses.reduce((m, s) => Math.max(m, s.position), -1) + 1;
      for (const name of toCreate.statuses) {
        const created = await Status.create({ name, color: '#64748B', position: position++, isDefault: false, projectId: project.id }, { transaction });
        statusByName.set(norm(name), created.id);
      }

      const sprintByName = new Map(ctx.sprints.map((s) => [norm(s.name), s.id]));
      for (const [name, sprintIssues] of toCreate.sprints) {
        const allDone = sprintIssues.every((i) => isDoneName(i.statusName));
        const created = await Sprint.create({
          projectId: project.id, name: name.slice(0, 120), status: allDone ? 'completed' : 'planned',
          completedAt: allDone ? new Date() : null, createdBy: actorId,
        }, { transaction });
        sprintByName.set(norm(name), created.id);
      }

      const releaseByName = new Map(ctx.releases.map((r) => [norm(r.name), r.id]));
      for (const name of toCreate.releases) {
        const created = await Release.create({ projectId: project.id, name: name.slice(0, 120) }, { transaction });
        releaseByName.set(norm(name), created.id);
      }

      // 2) epics first so children can point at them
      const idByRow = new Map();
      const keyMap = [];
      const createIssue = async (item) => {
        const statusId = item.status.statusId || statusByName.get(norm(item.status.createStatus)) || null;
        const labels = [{ text: 'imported', color: '#94a3b8' }, ...item.labels.map((l) => ({ text: l, color: '#6366f1' }))];
        let description = item.description || '';
        if (item.externalKey) description += `${description ? '\n\n' : ''}Imported from ${item.externalKey}`;
        const task = await Task.create({
          title: item.title,
          description: description || null,
          projectId: project.id,
          statusId,
          priority: item.priority,
          issueType: item.issueType,
          storyPoints: item.storyPoints,
          dueDate: item.dueDate,
          startDate: item.startDate,
          estimatedHours: item.estimatedHours,
          progress: item.progress || 0,
          severity: item.issueType === 'bug' ? item.severity : null,
          environment: item.environment,
          stepsToReproduce: item.stepsToReproduce,
          expectedResult: item.expectedResult,
          actualResult: item.actualResult,
          labels,
          createdBy: item.reporterId || actorId,
          sprintId: item.sprint ? (item.sprint.id || sprintByName.get(norm(item.sprint.create)) || null) : null,
          releaseId: item.release ? (item.release.id || releaseByName.get(norm(item.release.create)) || null) : null,
          epicId: item.epic ? (item.epic.id || idByRow.get(item.epic.fileRow) || null) : null,
        }, { transaction });
        if (item.assigneeId) {
          await TaskAssignees.create({ taskId: task.id, userId: item.assigneeId }, { transaction });
        }
        if (item.createdAt) {
          await sequelize.query('UPDATE tasks SET created_at = :d WHERE id = :id', { replacements: { d: item.createdAt, id: task.id }, transaction });
        }
        idByRow.set(item.rowNumber, task.id);
        keyMap.push({ from: item.externalKey, to: task.taskKey, title: item.title });
        return task;
      };

      for (const item of items.filter((i) => i.issueType === 'epic')) await createIssue(item);
      for (const item of items.filter((i) => i.issueType !== 'epic')) await createIssue(item);

      return {
        created: items.length,
        epics: items.filter((i) => i.issueType === 'epic').length,
        statusesCreated: toCreate.statuses.size,
        sprintsCreated: toCreate.sprints.size,
        releasesCreated: toCreate.releases.size,
        keyMap: keyMap.slice(0, 200),
      };
    });

    res.status(201).json({ success: true, data: { ...result, skipped: ctx.plan.errors.slice(0, 50), warnings, summary } });
  } catch (err) { handleError(err, res, next); }
};

module.exports = { previewImport, runImport };
