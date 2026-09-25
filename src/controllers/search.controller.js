// Global search controller
// Searches across tasks, projects, workspaces, and users within the caller's access scope.
// Returns grouped results with entity type labels for the frontend.

'use strict';

const { Op } = require('sequelize');
const { sequelize, Task, Project, Workspace, User, WorkspaceMembers, List, Status } = require('../models');
const logger = require('../utils/logger');

/**
 * @desc    Global search across tasks, projects, workspaces, users
 * @route   GET /api/v1/search?q=<query>&types=tasks,projects,workspaces,users&workspaceId=<id>
 * @access  Private
 */
const globalSearch = async (req, res, next) => {
  try {
    const { q, types, workspaceId } = req.query;
    const userId = req.user.id;
    const userRole = req.user.role;

    if (!q || q.trim().length < 2) {
      return res.status(400).json({ success: false, error: 'Query must be at least 2 characters' });
    }

    const query = q.trim();
    const searchTypes = types
      ? types.split(',').map(t => t.trim())
      : ['tasks', 'projects', 'workspaces', 'users'];

    // Determine accessible workspace IDs (for scoping results)
    let accessibleWorkspaceIds = [];
    if (userRole === 'super_admin') {
      // Super admin can see everything — no workspace scope filter
    } else {
      const memberRows = await WorkspaceMembers.findAll({
        where: { userId },
        attributes: ['workspaceId']
      });
      accessibleWorkspaceIds = memberRows.map(r => r.workspaceId);

      const ownedRows = await Workspace.findAll({
        where: { ownerId: userId },
        attributes: ['id']
      });
      const ownedIds = ownedRows.map(r => r.id);
      accessibleWorkspaceIds = [...new Set([...accessibleWorkspaceIds, ...ownedIds])];
    }

    // Optionally restrict to a single workspace
    if (workspaceId) {
      accessibleWorkspaceIds = userRole === 'super_admin'
        ? [workspaceId]
        : accessibleWorkspaceIds.filter(id => id === workspaceId);
    }

    const results = { tasks: [], projects: [], workspaces: [], users: [] };
    const likeOp = Op.iLike;
    const pattern = `%${query}%`;

    // ── Tasks ─────────────────────────────────────────────────────────────────
    if (searchTypes.includes('tasks')) {
      let skipTasks = false;
      const taskWhere = {
        [Op.or]: [
          { title:       { [likeOp]: pattern } },
          { description: { [likeOp]: pattern } }
        ]
      };

      if (userRole !== 'super_admin' && accessibleWorkspaceIds.length > 0) {
        const accessibleProjects = await Project.findAll({
          where: { workspaceId: { [Op.in]: accessibleWorkspaceIds } },
          attributes: ['id']
        });
        const projectIds = accessibleProjects.map(p => p.id);
        if (projectIds.length > 0) {
          taskWhere.projectId = { [Op.in]: projectIds };
        } else {
          skipTasks = true;
        }
      } else if (userRole !== 'super_admin') {
        skipTasks = true;
      }

      if (!skipTasks) {
        const tasks = await Task.findAll({
          where: taskWhere,
          include: [
            { model: Project, as: 'project', attributes: ['id', 'name', 'color', 'workspaceId'] },
            { model: List,    as: 'list',    attributes: ['id', 'name'], required: false },
            { model: Status,  as: 'status',  attributes: ['id', 'name', 'color'], required: false }
          ],
          attributes: ['id', 'title', 'description', 'priority', 'dueDate', 'projectId'],
          limit: 15,
          order: [['updatedAt', 'DESC']]
        });

        results.tasks = tasks.map(t => ({
          id:           t.id,
          title:        t.title,
          description:  t.description ? t.description.substring(0, 120) : null,
          status:       t.status?.name || null,
          priority:     t.priority,
          dueDate:      t.dueDate,
          projectId:    t.projectId,
          projectName:  t.project?.name,
          projectColor: t.project?.color,
          listName:     t.list?.name,
          workspaceId:  t.project?.workspaceId,
          url:          `/app/tasks/${t.id}`
        }));
      }
    }

    // ── Projects ──────────────────────────────────────────────────────────────
    if (searchTypes.includes('projects')) {
      let skipProjects = false;
      const projectWhere = {
        [Op.or]: [
          { name:        { [likeOp]: pattern } },
          { description: { [likeOp]: pattern } }
        ],
        isTemplate: false
      };

      if (userRole !== 'super_admin' && accessibleWorkspaceIds.length > 0) {
        projectWhere.workspaceId = { [Op.in]: accessibleWorkspaceIds };
      } else if (userRole !== 'super_admin') {
        skipProjects = true;
      }

      if (!skipProjects) {
        const projects = await Project.findAll({
          where: projectWhere,
          include: [{ model: Workspace, as: 'workspace', attributes: ['id', 'name'] }],
          attributes: ['id', 'name', 'description', 'status', 'color', 'workspaceId'],
          limit: 10,
          order: [['updatedAt', 'DESC']]
        });

        results.projects = projects.map(p => ({
          id:            p.id,
          name:          p.name,
          description:   p.description ? p.description.substring(0, 100) : null,
          status:        p.status,
          color:         p.color,
          workspaceId:   p.workspaceId,
          workspaceName: p.workspace?.name,
          url:           `/app/projects/${p.id}`
        }));
      }
    }

    // ── Workspaces ─────────────────────────────────────────────────────────────
    if (searchTypes.includes('workspaces')) {
      const whereClause = {
        [Op.or]: [
          { name:        { [likeOp]: pattern } },
          { description: { [likeOp]: pattern } }
        ]
      };

      if (userRole !== 'super_admin' && accessibleWorkspaceIds.length > 0) {
        whereClause.id = { [Op.in]: accessibleWorkspaceIds };
      }

      const workspaces = await Workspace.findAll({
        where: whereClause,
        attributes: ['id', 'name', 'description'],
        limit: 5,
        order: [['updatedAt', 'DESC']]
      });

      results.workspaces = workspaces.map(w => ({
        id:          w.id,
        name:        w.name,
        description: w.description ? w.description.substring(0, 100) : null,
        url:         `/app/workspaces/${w.id}`
      }));
    }

    // ── Users ─────────────────────────────────────────────────────────────────
    if (searchTypes.includes('users')) {
      const users = await User.findAll({
        where: {
          [Op.or]: [
            { firstName: { [likeOp]: pattern } },
            { lastName:  { [likeOp]: pattern } },
            { email:     { [likeOp]: pattern } }
          ],
          isActive: true
        },
        attributes: ['id', 'firstName', 'lastName', 'email', 'avatar', 'role'],
        limit: 8,
        order: [['firstName', 'ASC']]
      });

      results.users = users.map(u => ({
        id:        u.id,
        firstName: u.firstName,
        lastName:  u.lastName,
        email:     u.email,
        avatar:    u.avatar,
        role:      u.role
      }));
    }

    const totalCount =
      results.tasks.length +
      results.projects.length +
      results.workspaces.length +
      results.users.length;

    res.status(200).json({
      success: true,
      query,
      totalCount,
      data: results
    });
  } catch (error) {
    logger.error('globalSearch error:', error);
    next(error);
  }
};

module.exports = { globalSearch };
