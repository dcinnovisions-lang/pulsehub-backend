// RBAC V2 — STEP 12
const { Project, Workspace, List, Task, Status, WorkspaceMembers, ProjectMembers } = require('../models');
const { Op } = require('sequelize');
const logger = require('../utils/logger');

/**
 * Adds the caller's own roles to project responses so the UI can show or hide actions correctly:
 *   myProjectRole   - role in project_members (project_lead, contributor, reporter, ...)
 *   myWorkspaceRole - role in the project's workspace ('owner' for the workspace owner)
 */
const withMyRoles = async (input, user) => {
  try {
    const list = Array.isArray(input) ? input : [input];
    if (list.length === 0) return input;
    const projectIds = list.map((p) => p.id);
    const workspaceIds = [...new Set(list.map((p) => p.workspaceId))];
    const [pm, wm, owned] = await Promise.all([
      ProjectMembers.findAll({ where: { userId: user.id, projectId: { [Op.in]: projectIds } }, attributes: ['projectId', 'role'], raw: true }),
      WorkspaceMembers.findAll({ where: { userId: user.id, workspaceId: { [Op.in]: workspaceIds } }, attributes: ['workspaceId', 'role'], raw: true }),
      Workspace.findAll({ where: { ownerId: user.id, id: { [Op.in]: workspaceIds } }, attributes: ['id'], raw: true })
    ]);
    const pmMap = Object.fromEntries((pm || []).map((r) => [r.projectId, r.role]));
    const wmMap = Object.fromEntries((wm || []).map((r) => [r.workspaceId, r.role]));
    const ownedSet = new Set((owned || []).map((r) => r.id));
    const decorate = (p) => {
      const json = typeof p.toJSON === 'function' ? p.toJSON() : { ...p };
      json.myProjectRole = pmMap[p.id] || null;
      json.myWorkspaceRole = ownedSet.has(p.workspaceId) ? 'owner' : (wmMap[p.workspaceId] || null);
      return json;
    };
    return Array.isArray(input) ? list.map(decorate) : decorate(input);
  } catch (err) {
    logger.warn('Could not attach caller roles to project response:', err.message);
    return input;
  }
};

/**
 * @desc    Get all projects for current user
 * @route   GET /api/v1/projects
 * @access  Private
 */
const getProjects = async (req, res, next) => {
  try {
    const { workspaceId } = req.query;
    const page   = Math.max(1, parseInt(req.query.page)  || 1);
    const limit  = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const offset = (page - 1) * limit;
    const userId = req.user.id;
    const userRole = req.user.role;

    // Super admin can see all projects
    let whereClause = {};
    
    if (userRole !== 'super_admin') {
      // Get workspaces user has access to (owns or is member of)
      
      // Get workspace IDs user has access to
      const userWorkspaces = await WorkspaceMembers.findAll({
        where: { userId },
        attributes: ['workspaceId']
      });
      
      const accessibleWorkspaceIds = userWorkspaces.map(wm => wm.workspaceId);
      
      // Also include workspaces user owns
      const ownedWorkspaces = await Workspace.findAll({
        where: { ownerId: userId },
        attributes: ['id']
      });
      
      const ownedWorkspaceIds = ownedWorkspaces.map(ws => ws.id);
      const allAccessibleWorkspaceIds = [...new Set([...accessibleWorkspaceIds, ...ownedWorkspaceIds])];
      
      if (workspaceId) {
        // Verify user has access to this specific workspace
        if (!allAccessibleWorkspaceIds.includes(workspaceId)) {
          return res.status(403).json({
            success: false,
            error: 'You do not have access to this workspace'
          });
        }
        whereClause.workspaceId = workspaceId;
      } else {
        // Filter by accessible workspaces only
        if (allAccessibleWorkspaceIds.length === 0) {
          // User has no workspace access, return empty
          return res.status(200).json({
            success: true,
            count: 0,
            data: []
          });
        }
        whereClause.workspaceId = { [Op.in]: allAccessibleWorkspaceIds };
      }
    } else if (workspaceId) {
      // Super admin with workspace filter
      whereClause.workspaceId = workspaceId;
    }

    const { count, rows: projects } = await Project.findAndCountAll({
      where: whereClause,
      include: [
        {
          model: Workspace,
          as: 'workspace',
          attributes: ['id', 'name']
        }
      ],
      order: [['createdAt', 'DESC']],
      limit,
      offset,
      distinct: true
    });

    res.status(200).json({
      success: true,
      count: projects.length,
      total: count,
      pagination: {
        page,
        limit,
        totalPages: Math.ceil(count / limit),
        hasNextPage: page < Math.ceil(count / limit),
        hasPrevPage: page > 1
      },
      data: await withMyRoles(projects, req.user)
    });
  } catch (error) {
    logger.error('Get projects error:', error);
    next(error);
  }
};

/**
 * @desc    Get project by ID
 * @route   GET /api/v1/projects/:id
 * @access  Private
 */
const getProjectById = async (req, res, next) => {
  try {
    const project = await Project.findByPk(req.params.id, {
      include: [
        {
          model: Workspace,
          as: 'workspace',
          attributes: ['id', 'name']
        },
        {
          model: List,
          as: 'lists',
          order: [['position', 'ASC']]
        },
        {
          model: Status,
          as: 'statuses',
          order: [['position', 'ASC']]
        }
      ]
    });

    if (!project) {
      return res.status(404).json({
        success: false,
        error: 'Project not found'
      });
    }

    res.status(200).json({
      success: true,
      data: await withMyRoles(project, req.user)
    });
  } catch (error) {
    logger.error('Get project by ID error:', error);
    next(error);
  }
};

/**
 * @desc    Create project
 * @route   POST /api/v1/projects
 * @access  Private
 */
const createProject = async (req, res, next) => {
  try {
    const { name, description, workspaceId, color, templateId, key } = req.body;

    // Verify workspace exists and user has access
    const workspace = await Workspace.findByPk(workspaceId);
    if (!workspace) {
      return res.status(404).json({
        success: false,
        error: 'Workspace not found'
      });
    }

    // Check if user can create projects
    // Super admin can create in any workspace
    if (req.user.role === 'super_admin') {
      // Allow creation
    } else if (workspace.ownerId === req.user.id) {
      // Owner can create projects
    } else {
      // Check if user is a member with appropriate role
      const { WorkspaceMembers } = require('../models');
      const member = await WorkspaceMembers.findOne({
        where: { workspaceId: workspace.id, userId: req.user.id }
      });

      if (!member) {
        return res.status(403).json({
          success: false,
          error: 'You are not a member of this workspace'
        });
      }

      // Only super_admin, admin, owner, and pm can create projects
      if (!['super_admin', 'admin', 'owner', 'pm'].includes(member.role)) {
        return res.status(403).json({
          success: false,
          error: 'You do not have permission to create projects. Only Super Admins, Admins, Owners, and Project Managers can create projects.'
        });
      }
    }

    const project = await Project.create({
      name,
      description,
      workspaceId,
      color: color || '#3B82F6',
      templateId,
      key
    });

    // Create default statuses (similar to Jira/ClickUp workflow)
    const defaultStatuses = [
      { name: 'To Do', color: '#94A3B8', position: 0, isDefault: true },
      { name: 'In Progress', color: '#3B82F6', position: 1, isDefault: false },
      { name: 'Ready for Retest', color: '#F59E0B', position: 2, isDefault: false },
      { name: 'Reopened', color: '#EF4444', position: 3, isDefault: false },
      { name: 'Done', color: '#10B981', position: 4, isDefault: false }
    ];

    await Promise.all(
      defaultStatuses.map(status => 
        Status.create({
          ...status,
          projectId: project.id
        })
      )
    );

    // RBAC V2 — STEP 12
    // Auto-assign the project creator as 'project_lead' in project_members.
    // This is the core fix: without this, the creator has no project-level role
    // and falls back to their workspace role for all permission checks.
    try {
      await ProjectMembers.create({
        projectId: project.id,
        userId: req.user.id,
        role: 'project_lead',
        invitedBy: null,   // creator, not invited
        joinedAt: new Date()
      });
    } catch (pmErr) {
      // Non-fatal — project is created, just log the issue
      logger.warn('Failed to auto-assign project_lead role to project creator:', pmErr);
    }

    // Reload with associations
    await project.reload({
      include: [
        {
          model: Workspace,
          as: 'workspace',
          attributes: ['id', 'name']
        }
      ]
    });

    res.status(201).json({
      success: true,
      data: project
    });
  } catch (error) {
    logger.error('Create project error:', error);
    next(error);
  }
};

/**
 * @desc    Update project
 * @route   PUT /api/v1/projects/:id
 * @access  Private
 */
const updateProject = async (req, res, next) => {
  try {
    const project = await Project.findByPk(req.params.id);

    if (!project) {
      return res.status(404).json({
        success: false,
        error: 'Project not found'
      });
    }

    const { name, description, status, color, key } = req.body;

    // Changing the project key re-labels every issue (SE-1 -> SCH-1). Keys are unique across projects.
    let newKey = null;
    if (key !== undefined && String(key).toUpperCase().replace(/[^A-Z0-9]/g, '') !== project.key) {
      newKey = String(key).toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (newKey.length < 2 || newKey.length > 10) {
        return res.status(400).json({ success: false, error: 'Project key must be 2-10 letters or numbers' });
      }
      const clash = await Project.findOne({ where: { key: newKey }, attributes: ['id'] });
      if (clash) {
        return res.status(400).json({ success: false, error: `The key ${newKey} is already used by another project` });
      }
    }

    await project.update({
      name: name || project.name,
      description: description !== undefined ? description : project.description,
      status: status || project.status,
      color: color || project.color,
      ...(newKey ? { key: newKey } : {})
    });

    if (newKey) {
      const { sequelize } = require('../config/database');
      await sequelize.query(
        "UPDATE tasks SET task_key = :key || '-' || task_number WHERE project_id = :id AND task_number IS NOT NULL",
        { replacements: { key: newKey, id: project.id } }
      );
    }

    // Reload with associations
    await project.reload({
      include: [
        {
          model: Workspace,
          as: 'workspace',
          attributes: ['id', 'name']
        }
      ]
    });

    res.status(200).json({
      success: true,
      data: project
    });
  } catch (error) {
    logger.error('Update project error:', error);
    next(error);
  }
};

/**
 * @desc    Delete project
 * @route   DELETE /api/v1/projects/:id
 * @access  Private
 */
const deleteProject = async (req, res, next) => {
  try {
    const project = await Project.findByPk(req.params.id);

    if (!project) {
      return res.status(404).json({
        success: false,
        error: 'Project not found'
      });
    }

    // Soft delete
    await project.update({ status: 'archived' });

    res.status(200).json({
      success: true,
      message: 'Project archived successfully'
    });
  } catch (error) {
    logger.error('Delete project error:', error);
    next(error);
  }
};

/**
 * @desc    Get all project templates
 * @route   GET /api/v1/projects/templates
 * @access  Private
 */
const getTemplates = async (req, res, next) => {
  try {
    const templates = await Project.findAll({
      where: { isTemplate: true },
      include: [
        {
          model: Workspace,
          as: 'workspace',
          attributes: ['id', 'name']
        }
      ],
      order: [['createdAt', 'DESC']]
    });

    res.status(200).json({
      success: true,
      count: templates.length,
      data: templates
    });
  } catch (error) {
    logger.error('Get templates error:', error);
    next(error);
  }
};

/**
 * @desc    Create project from template
 * @route   POST /api/v1/projects/from-template
 * @access  Private
 */
const createProjectFromTemplate = async (req, res, next) => {
  try {
    const { templateId, workspaceId, name, description } = req.body;

    if (!templateId || !workspaceId || !name) {
      return res.status(400).json({
        success: false,
        error: 'Template ID, workspace ID, and name are required'
      });
    }

    // Get template
    const template = await Project.findByPk(templateId, {
      include: [
        {
          model: List,
          as: 'lists'
        },
        {
          model: Status,
          as: 'statuses'
        }
      ]
    });

    if (!template || !template.isTemplate) {
      return res.status(404).json({
        success: false,
        error: 'Template not found'
      });
    }

    // Create project from template
    const project = await Project.create({
      name,
      description: description || template.description,
      workspaceId,
      status: 'active',
      color: template.color,
      isTemplate: false,
      templateId: template.id
    });

    // Copy lists from template
    if (template.lists && template.lists.length > 0) {
      await Promise.all(
        template.lists.map(list =>
          List.create({
            name: list.name,
            projectId: project.id,
            position: list.position
          })
        )
      );
    }

    // Copy statuses from template
    if (template.statuses && template.statuses.length > 0) {
      await Promise.all(
        template.statuses.map(status =>
          Status.create({
            name: status.name,
            projectId: project.id,
            color: status.color,
            position: status.position,
            isDefault: status.isDefault
          })
        )
      );
    }

    const createdProject = await Project.findByPk(project.id, {
      include: [
        {
          model: Workspace,
          as: 'workspace',
          attributes: ['id', 'name']
        }
      ]
    });

    res.status(201).json({
      success: true,
      data: createdProject
    });
  } catch (error) {
    logger.error('Create project from template error:', error);
    next(error);
  }
};

module.exports = {
  getProjects,
  getProjectById,
  createProject,
  updateProject,
  deleteProject,
  getTemplates,
  createProjectFromTemplate
};


