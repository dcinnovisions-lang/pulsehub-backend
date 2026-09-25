const { Op } = require('sequelize');
const { sequelize } = require('../config/database');
const { Sprint, Release, Task, Project, Status, User } = require('../models');
const { createActivityLog } = require('./activityLog.controller');
const logger = require('../utils/logger');

const DONE_NAMES = "('done','closed','completed','resolved')";

// Per-group issue statistics: total / done issues and story points (epics themselves are excluded).
const statsBy = async (projectId, column) => {
  const [rows] = await sequelize.query(
    `SELECT t.${column} AS group_id,
            COUNT(*)::int AS total,
            COALESCE(SUM(t.story_points), 0)::float AS points,
            COUNT(*) FILTER (WHERE lower(s.name) IN ${DONE_NAMES})::int AS done,
            COALESCE(SUM(t.story_points) FILTER (WHERE lower(s.name) IN ${DONE_NAMES}), 0)::float AS done_points
       FROM tasks t LEFT JOIN statuses s ON s.id = t.status_id
      WHERE t.project_id = :projectId AND t.is_archived = false
        AND t.${column} IS NOT NULL AND t.issue_type <> 'epic'
      GROUP BY t.${column}`,
    { replacements: { projectId } }
  );
  const map = {};
  rows.forEach((r) => {
    map[r.group_id] = { total: r.total, done: r.done, points: r.points, donePoints: r.done_points };
  });
  return map;
};

const emptyStats = { total: 0, done: 0, points: 0, donePoints: 0 };

const taskListInclude = [
  { model: Status, as: 'status', attributes: ['id', 'name', 'color'] },
  { model: User, as: 'assignees', attributes: ['id', 'firstName', 'lastName', 'email', 'avatar'], through: { attributes: [] } },
  { model: Task, as: 'epic', attributes: ['id', 'title', 'taskKey'] }
];

// Loads the sprint/release for /sprints/:id and /releases/:id routes and exposes its project
// as req.params.projectId so the RBAC middleware can resolve the workspace.
const loadSprint = async (req, res, next) => {
  try {
    const sprint = await Sprint.findByPk(req.params.id);
    if (!sprint) return res.status(404).json({ success: false, error: 'Sprint not found' });
    req.sprint = sprint;
    req.params.projectId = sprint.projectId;
    next();
  } catch (err) { next(err); }
};

const loadRelease = async (req, res, next) => {
  try {
    const release = await Release.findByPk(req.params.id);
    if (!release) return res.status(404).json({ success: false, error: 'Release not found' });
    req.release = release;
    req.params.projectId = release.projectId;
    next();
  } catch (err) { next(err); }
};

// ── Sprints ──────────────────────────────────────────────────────────────────

const listSprints = async (req, res, next) => {
  try {
    const { projectId } = req.params;
    const [sprints, stats] = await Promise.all([
      Sprint.findAll({ where: { projectId }, order: [['createdAt', 'DESC']] }),
      statsBy(projectId, 'sprint_id')
    ]);
    const rank = { active: 0, planned: 1, completed: 2 };
    const data = sprints
      .map((s) => ({ ...s.toJSON(), stats: stats[s.id] || emptyStats }))
      .sort((a, b) => rank[a.status] - rank[b.status]);
    res.json({ success: true, data });
  } catch (err) { logger.error('List sprints error:', err); next(err); }
};

const createSprint = async (req, res, next) => {
  try {
    const { projectId } = req.params;
    const name = String(req.body.name || '').trim();
    if (!name) return res.status(400).json({ success: false, error: 'Sprint name is required' });
    const { startDate, endDate } = req.body;
    if (startDate && endDate && new Date(endDate) < new Date(startDate)) {
      return res.status(400).json({ success: false, error: 'End date must be after the start date' });
    }
    const sprint = await Sprint.create({
      projectId,
      name: name.slice(0, 120),
      goal: req.body.goal || null,
      startDate: startDate || null,
      endDate: endDate || null,
      createdBy: req.user.id
    });
    await createActivityLog('project', projectId, 'updated', req.user.id, null, { description: `Created sprint "${sprint.name}"` });
    res.status(201).json({ success: true, data: { ...sprint.toJSON(), stats: emptyStats } });
  } catch (err) { logger.error('Create sprint error:', err); next(err); }
};

const updateSprint = async (req, res, next) => {
  try {
    const sprint = req.sprint;
    if (sprint.status === 'completed') {
      return res.status(400).json({ success: false, error: 'A completed sprint cannot be edited' });
    }
    const patch = {};
    if (req.body.name !== undefined) {
      const name = String(req.body.name).trim();
      if (!name) return res.status(400).json({ success: false, error: 'Sprint name cannot be empty' });
      patch.name = name.slice(0, 120);
    }
    if (req.body.goal !== undefined) patch.goal = req.body.goal || null;
    if (req.body.startDate !== undefined) patch.startDate = req.body.startDate || null;
    if (req.body.endDate !== undefined) patch.endDate = req.body.endDate || null;
    const start = patch.startDate !== undefined ? patch.startDate : sprint.startDate;
    const end = patch.endDate !== undefined ? patch.endDate : sprint.endDate;
    if (start && end && new Date(end) < new Date(start)) {
      return res.status(400).json({ success: false, error: 'End date must be after the start date' });
    }
    await sprint.update(patch);
    res.json({ success: true, data: sprint });
  } catch (err) { logger.error('Update sprint error:', err); next(err); }
};

const deleteSprint = async (req, res, next) => {
  try {
    const sprint = req.sprint;
    if (sprint.status === 'active') {
      return res.status(400).json({ success: false, error: 'Complete the active sprint before deleting it' });
    }
    await Task.update({ sprintId: null }, { where: { sprintId: sprint.id } });
    await sprint.destroy();
    await createActivityLog('project', sprint.projectId, 'updated', req.user.id, null, { description: `Deleted sprint "${sprint.name}"` });
    res.json({ success: true, message: 'Sprint deleted. Its issues were moved back to the backlog.' });
  } catch (err) { logger.error('Delete sprint error:', err); next(err); }
};

const startSprint = async (req, res, next) => {
  try {
    const sprint = req.sprint;
    if (sprint.status !== 'planned') {
      return res.status(400).json({ success: false, error: 'Only a planned sprint can be started' });
    }
    const active = await Sprint.findOne({ where: { projectId: sprint.projectId, status: 'active' } });
    if (active) {
      return res.status(400).json({ success: false, error: `"${active.name}" is already active. Complete it before starting another sprint.` });
    }
    const startDate = req.body.startDate || sprint.startDate || new Date();
    let endDate = req.body.endDate || sprint.endDate;
    if (!endDate) endDate = new Date(new Date(startDate).getTime() + 14 * 24 * 60 * 60 * 1000);
    if (new Date(endDate) < new Date(startDate)) {
      return res.status(400).json({ success: false, error: 'End date must be after the start date' });
    }
    await sprint.update({ status: 'active', startDate, endDate });
    await createActivityLog('project', sprint.projectId, 'updated', req.user.id, null, { description: `Started sprint "${sprint.name}"` });
    res.json({ success: true, data: sprint });
  } catch (err) { logger.error('Start sprint error:', err); next(err); }
};

const completeSprint = async (req, res, next) => {
  try {
    const sprint = req.sprint;
    if (sprint.status !== 'active') {
      return res.status(400).json({ success: false, error: 'Only an active sprint can be completed' });
    }
    const { moveTo } = req.body; // 'backlog' (default) or the id of a planned sprint
    let target = null;
    if (moveTo && moveTo !== 'backlog') {
      target = await Sprint.findOne({ where: { id: moveTo, projectId: sprint.projectId, status: 'planned' } });
      if (!target) return res.status(400).json({ success: false, error: 'moveTo must be "backlog" or a planned sprint of this project' });
    }

    const [doneStatuses] = await sequelize.query(
      `SELECT id FROM statuses WHERE project_id = :projectId AND lower(name) IN ${DONE_NAMES}`,
      { replacements: { projectId: sprint.projectId } }
    );
    const doneIds = doneStatuses.map((r) => r.id);

    const unfinished = await Task.findAll({
      where: {
        sprintId: sprint.id,
        isArchived: false,
        [Op.or]: [{ statusId: { [Op.is]: null } }, { statusId: { [Op.notIn]: doneIds.length ? doneIds : ['00000000-0000-0000-0000-000000000000'] } }]
      },
      attributes: ['id']
    });
    if (unfinished.length > 0) {
      await Task.update({ sprintId: target ? target.id : null }, { where: { id: unfinished.map((t) => t.id) } });
    }

    const stats = (await statsBy(sprint.projectId, 'sprint_id'))[sprint.id] || emptyStats;
    await sprint.update({ status: 'completed', completedAt: new Date() });
    await createActivityLog('project', sprint.projectId, 'updated', req.user.id, null, { description: `Completed sprint "${sprint.name}"` });
    res.json({
      success: true,
      data: sprint,
      summary: {
        completedIssues: stats.done,
        completedPoints: stats.donePoints,
        movedIssues: unfinished.length,
        movedTo: target ? target.name : 'Backlog'
      }
    });
  } catch (err) { logger.error('Complete sprint error:', err); next(err); }
};

// Move issues between backlog and sprints: { taskIds: [...], sprintId: <uuid>|null }
const assignToSprint = async (req, res, next) => {
  try {
    const { projectId } = req.params;
    const { taskIds, sprintId } = req.body;
    if (!Array.isArray(taskIds) || taskIds.length === 0) {
      return res.status(400).json({ success: false, error: 'taskIds must be a non-empty array' });
    }
    if (sprintId) {
      const sprint = await Sprint.findOne({ where: { id: sprintId, projectId } });
      if (!sprint) return res.status(400).json({ success: false, error: 'Sprint not found in this project' });
      if (sprint.status === 'completed') return res.status(400).json({ success: false, error: 'Cannot add issues to a completed sprint' });
    }
    const [count] = await Task.update(
      { sprintId: sprintId || null },
      { where: { id: taskIds, projectId, issueType: { [Op.ne]: 'epic' } } }
    );
    res.json({ success: true, updated: count });
  } catch (err) { logger.error('Assign to sprint error:', err); next(err); }
};

const getBacklog = async (req, res, next) => {
  try {
    const { projectId } = req.params;
    const tasks = await Task.findAll({
      where: { projectId, isArchived: false, sprintId: { [Op.is]: null }, issueType: { [Op.ne]: 'epic' } },
      include: taskListInclude,
      order: [['position', 'ASC'], ['createdAt', 'DESC']]
    });
    res.json({ success: true, data: tasks });
  } catch (err) { logger.error('Get backlog error:', err); next(err); }
};

const getSprintIssues = async (req, res, next) => {
  try {
    const tasks = await Task.findAll({
      where: { sprintId: req.params.id, isArchived: false },
      include: taskListInclude,
      order: [['position', 'ASC'], ['createdAt', 'ASC']]
    });
    res.json({ success: true, data: tasks });
  } catch (err) { next(err); }
};

// ── Epics ────────────────────────────────────────────────────────────────────

const listEpics = async (req, res, next) => {
  try {
    const { projectId } = req.params;
    const [epics, stats] = await Promise.all([
      Task.findAll({
        where: { projectId, issueType: 'epic', isArchived: false },
        include: [{ model: Status, as: 'status', attributes: ['id', 'name', 'color'] }],
        order: [['createdAt', 'DESC']]
      }),
      statsBy(projectId, 'epic_id')
    ]);
    res.json({ success: true, data: epics.map((e) => ({ ...e.toJSON(), stats: stats[e.id] || emptyStats })) });
  } catch (err) { logger.error('List epics error:', err); next(err); }
};

// ── Releases (fix versions) ──────────────────────────────────────────────────

const listReleases = async (req, res, next) => {
  try {
    const { projectId } = req.params;
    const [releases, stats] = await Promise.all([
      Release.findAll({ where: { projectId }, order: [['status', 'DESC'], ['releaseDate', 'ASC'], ['createdAt', 'DESC']] }),
      statsBy(projectId, 'release_id')
    ]);
    res.json({ success: true, data: releases.map((r) => ({ ...r.toJSON(), stats: stats[r.id] || emptyStats })) });
  } catch (err) { logger.error('List releases error:', err); next(err); }
};

const createRelease = async (req, res, next) => {
  try {
    const name = String(req.body.name || '').trim();
    if (!name) return res.status(400).json({ success: false, error: 'Release name is required' });
    const release = await Release.create({
      projectId: req.params.projectId,
      name: name.slice(0, 120),
      description: req.body.description || null,
      releaseDate: req.body.releaseDate || null
    });
    res.status(201).json({ success: true, data: { ...release.toJSON(), stats: emptyStats } });
  } catch (err) { logger.error('Create release error:', err); next(err); }
};

const updateRelease = async (req, res, next) => {
  try {
    const patch = {};
    if (req.body.name !== undefined) {
      const name = String(req.body.name).trim();
      if (!name) return res.status(400).json({ success: false, error: 'Release name cannot be empty' });
      patch.name = name.slice(0, 120);
    }
    if (req.body.description !== undefined) patch.description = req.body.description || null;
    if (req.body.releaseDate !== undefined) patch.releaseDate = req.body.releaseDate || null;
    await req.release.update(patch);
    res.json({ success: true, data: req.release });
  } catch (err) { logger.error('Update release error:', err); next(err); }
};

const markReleased = async (req, res, next) => {
  try {
    const release = req.release;
    if (release.status === 'released') {
      return res.status(400).json({ success: false, error: 'This release is already released' });
    }
    await release.update({ status: 'released', releasedAt: new Date() });
    res.json({ success: true, data: release });
  } catch (err) { logger.error('Mark released error:', err); next(err); }
};

const deleteRelease = async (req, res, next) => {
  try {
    await Task.update({ releaseId: null }, { where: { releaseId: req.release.id } });
    await req.release.destroy();
    res.json({ success: true, message: 'Release deleted' });
  } catch (err) { logger.error('Delete release error:', err); next(err); }
};

const getReleaseIssues = async (req, res, next) => {
  try {
    const tasks = await Task.findAll({
      where: { releaseId: req.params.id, isArchived: false },
      include: taskListInclude,
      order: [['createdAt', 'ASC']]
    });
    res.json({ success: true, data: tasks });
  } catch (err) { next(err); }
};

module.exports = {
  loadSprint, loadRelease,
  listSprints, createSprint, updateSprint, deleteSprint, startSprint, completeSprint,
  assignToSprint, getBacklog, getSprintIssues,
  listEpics,
  listReleases, createRelease, updateRelease, markReleased, deleteRelease, getReleaseIssues
};
