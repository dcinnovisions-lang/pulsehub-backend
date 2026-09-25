const { Op } = require('sequelize');
const { sequelize } = require('../config/database');
const { Task, Project, Status, User, Sprint, Release, ProjectMembers } = require('../models');
const { accessibleProjectIds } = require('../utils/projectAccess');
const { parse, QueryError } = require('../utils/issueQuery/parser');
const { compile, FROM_SQL } = require('../utils/issueQuery/compiler');
const logger = require('../utils/logger');

/**
 * @desc    Search issues with the query language
 * @route   GET /api/v1/issues/search?q=...&projectId=&page=&limit=
 * @access  Private
 */
const searchIssues = async (req, res, next) => {
  try {
    const q = String(req.query.q || '').slice(0, 2000);
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 25));

    let compiled;
    try {
      compiled = compile(parse(q), { userId: req.user.id });
    } catch (err) {
      if (err instanceof QueryError) {
        return res.status(400).json({ success: false, error: err.message, position: err.position });
      }
      throw err;
    }

    let projectIds = await accessibleProjectIds(req.user);
    if (req.query.projectId) {
      if (projectIds !== null && !projectIds.includes(req.query.projectId)) {
        return res.status(403).json({ success: false, error: 'You do not have access to this project' });
      }
      projectIds = [req.query.projectId];
    }
    if (projectIds !== null && projectIds.length === 0) {
      return res.json({ success: true, data: [], total: 0, page, limit, totalPages: 0 });
    }

    const guards = ['t.is_archived = false'];
    const replacements = { ...compiled.replacements, limit, offset: (page - 1) * limit };
    if (projectIds !== null) {
      guards.push('t.project_id IN (:accessibleProjects)');
      replacements.accessibleProjects = projectIds;
    }

    // Project 'reporter' members only see the issues they reported
    const reporterRows = await ProjectMembers.findAll({ where: { userId: req.user.id, role: 'reporter' }, attributes: ['projectId'], raw: true });
    if (reporterRows.length > 0) {
      guards.push('(t.project_id NOT IN (:reporterProjects) OR t.created_by = :callerId)');
      replacements.reporterProjects = reporterRows.map((r) => r.projectId);
      replacements.callerId = req.user.id;
    }

    const where = `WHERE ${guards.join(' AND ')} AND (${compiled.whereSql})`;

    const [countRows, idRows] = await Promise.all([
      sequelize.query(`SELECT COUNT(*)::int AS total ${FROM_SQL} ${where}`, { replacements, type: sequelize.QueryTypes.SELECT }),
      sequelize.query(`SELECT t.id ${FROM_SQL} ${where} ORDER BY ${compiled.orderSql} LIMIT :limit OFFSET :offset`, { replacements, type: sequelize.QueryTypes.SELECT })
    ]);

    const ids = idRows.map((r) => r.id);
    let tasks = [];
    if (ids.length > 0) {
      tasks = await Task.findAll({
        where: { id: { [Op.in]: ids } },
        include: [
          { model: Project, as: 'project', attributes: ['id', 'name', 'key'] },
          { model: Status, as: 'status', attributes: ['id', 'name', 'color'] },
          { model: User, as: 'assignees', attributes: ['id', 'email', 'firstName', 'lastName', 'avatar'], through: { attributes: [] } },
          { model: User, as: 'creator', attributes: ['id', 'email', 'firstName', 'lastName', 'avatar'] },
          { model: Sprint, as: 'sprint', attributes: ['id', 'name', 'status'] },
          { model: Release, as: 'release', attributes: ['id', 'name', 'status'] },
          { model: Task, as: 'epic', attributes: ['id', 'title', 'taskKey'] }
        ]
      });
      const byId = new Map(tasks.map((t) => [t.id, t]));
      tasks = ids.map((id) => byId.get(id)).filter(Boolean);
    }

    const total = countRows[0] ? countRows[0].total : 0;
    res.json({ success: true, data: tasks, total, page, limit, totalPages: Math.ceil(total / limit) });
  } catch (err) {
    logger.error('Issue search error:', err);
    next(err);
  }
};

module.exports = { searchIssues };
