const { Op } = require('sequelize');
const { sequelize } = require('../config/database');
const { Task, Project, Status, User, Sprint, Release, Workspace } = require('../models');
const { toCSV } = require('../utils/csv');
const { buildImportPlan } = require('../utils/issueImport');
const { accessibleProjectIds } = require('../utils/projectAccess');
const logger = require('../utils/logger');

const fmtDate = (d) => (d ? new Date(d).toISOString().slice(0, 10) : '');
const fmtDateTime = (d) => (d ? new Date(d).toISOString() : '');
const fullName = (u) => (u ? `${u.firstName || ''} ${u.lastName || ''}`.trim() : '');

/**
 * @desc    Export issues to CSV (columns are compatible with the importer and with Jira/Excel)
 * @route   GET /api/v1/tasks/export?projectId=&workspaceId=
 * @access  Private — limited to projects the caller can access
 */
const exportTasksToCSV = async (req, res, next) => {
  try {
    const { projectId, workspaceId } = req.query;

    const allowed = await accessibleProjectIds(req.user);
    if (projectId && allowed !== null && !allowed.includes(projectId)) {
      return res.status(403).json({ success: false, error: 'You do not have access to this project' });
    }

    const where = { isArchived: false };
    let scopeIds = allowed; // null = every project
    if (workspaceId) {
      const inWorkspace = (await Project.findAll({ where: { workspaceId }, attributes: ['id'], raw: true })).map((p) => p.id);
      scopeIds = scopeIds === null ? inWorkspace : inWorkspace.filter((id) => scopeIds.includes(id));
    }
    if (projectId) scopeIds = scopeIds === null || scopeIds.includes(projectId) ? [projectId] : [];
    if (scopeIds !== null) {
      where.projectId = { [Op.in]: scopeIds.length ? scopeIds : ['00000000-0000-0000-0000-000000000000'] };
    }

    const tasks = await Task.findAll({
      where,
      include: [
        { model: Project, as: 'project', attributes: ['id', 'name', 'key', 'workspaceId'], required: true },
        { model: Status, as: 'status', attributes: ['id', 'name'] },
        { model: User, as: 'creator', attributes: ['id', 'firstName', 'lastName', 'email'] },
        { model: User, as: 'assignees', attributes: ['id', 'firstName', 'lastName', 'email'], through: { attributes: [] } },
        { model: Sprint, as: 'sprint', attributes: ['name'] },
        { model: Release, as: 'release', attributes: ['name'] },
        { model: Task, as: 'epic', attributes: ['title', 'taskKey'] }
      ],
      order: [['createdAt', 'DESC']],
      limit: 20000
    });

    const workspaceIds = [...new Set(tasks.map((t) => t.project && t.project.workspaceId).filter(Boolean))];
    const workspaces = workspaceIds.length
      ? await Workspace.findAll({ where: { id: { [Op.in]: workspaceIds } }, attributes: ['id', 'name'], raw: true })
      : [];
    const workspaceName = Object.fromEntries(workspaces.map((w) => [w.id, w.name]));

    const headers = [
      'Issue key', 'Summary', 'Description', 'Issue Type', 'Status', 'Priority', 'Assignee', 'Reporter',
      'Project', 'Workspace', 'Sprint', 'Epic Link', 'Fix Version/s', 'Story Points', 'Labels', 'Severity',
      'Due Date', 'Progress', 'Original Estimate', 'Created', 'Updated'
    ];
    const rows = tasks.map((t) => [
      t.taskKey || '',
      t.title || '',
      t.description || '',
      t.issueType || 'task',
      t.status ? t.status.name : '',
      t.priority || '',
      (t.assignees || []).map(fullName).join('; '),
      fullName(t.creator),
      t.project ? t.project.name : '',
      t.project ? (workspaceName[t.project.workspaceId] || '') : '',
      t.sprint ? t.sprint.name : '',
      t.epic ? (t.epic.taskKey || t.epic.title) : '',
      t.release ? t.release.name : '',
      t.storyPoints === null || t.storyPoints === undefined ? '' : String(+Number(t.storyPoints).toFixed(1)),
      (Array.isArray(t.labels) ? t.labels : []).map((l) => (typeof l === 'string' ? l : l && l.text)).filter(Boolean).join(', '),
      t.severity || '',
      fmtDate(t.dueDate),
      `${Math.round(Number(t.progress) || 0)}`,
      t.estimatedHours === null || t.estimatedHours === undefined ? '' : String(t.estimatedHours),
      fmtDateTime(t.createdAt),
      fmtDateTime(t.updatedAt)
    ]);

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=issues-${Date.now()}.csv`);
    res.status(200).send('﻿' + toCSV([headers, ...rows]));
  } catch (error) {
    logger.error('Export tasks to CSV error:', error);
    next(error);
  }
};

/**
 * @desc    Simple CSV import (title, description, type, priority, points, dates ...). For the full
 *          Jira-style import with sprints, epics and releases use POST /projects/:id/import.
 * @route   POST /api/v1/tasks/import
 * @access  Private
 */
const importTasksFromCSV = async (req, res, next) => {
  try {
    const { csvData, projectId } = req.body;
    if (!csvData || !projectId) {
      return res.status(400).json({ success: false, error: 'CSV data and projectId are required' });
    }

    const project = await Project.findByPk(projectId);
    if (!project) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }

    let plan;
    try {
      plan = buildImportPlan(csvData);
    } catch (err) {
      if (err.code && String(err.code).startsWith('CSV_')) {
        return res.status(400).json({ success: false, error: err.message });
      }
      throw err;
    }
    if (plan.issues.length === 0) {
      return res.status(400).json({ success: false, error: 'Import failed', details: plan.errors.map((e) => `Row ${e.row}: ${e.reason}`) });
    }

    const defaultStatus = await Status.findOne({ where: { projectId, isDefault: true } });
    const created = await sequelize.transaction(async (transaction) => {
      const out = [];
      for (const i of plan.issues) {
        out.push(await Task.create({
          title: i.title,
          description: i.description,
          projectId,
          statusId: defaultStatus ? defaultStatus.id : null,
          priority: i.priority,
          issueType: i.issueType === 'epic' ? 'epic' : i.issueType,
          storyPoints: i.storyPoints,
          dueDate: i.dueDate,
          estimatedHours: i.estimatedHours,
          progress: i.progress || 0,
          createdBy: req.user.id
        }, { transaction }));
      }
      return out;
    });

    res.status(201).json({
      success: true,
      count: created.length,
      data: created,
      errors: plan.errors.length > 0 ? plan.errors.map((e) => `Row ${e.row}: ${e.reason}`) : undefined
    });
  } catch (error) {
    logger.error('Import tasks from CSV error:', error);
    next(error);
  }
};

module.exports = {
  exportTasksToCSV,
  importTasksFromCSV
};
