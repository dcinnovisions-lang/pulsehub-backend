// RBAC V2 — STEP 11
// Project routes updated to use resource-aware V2 permission checks.
// Added project-level member management endpoints (Steps 15–18 from the tracker).

const express = require('express');
const router = express.Router();
const projectController        = require('../controllers/project.controller');
const projectMembersController = require('../controllers/projectMembers.controller');
const projectHealthController  = require('../controllers/projectHealth.controller');
const kanbanController         = require('../controllers/kanban.controller');
const { authenticate }         = require('../middleware/auth');
const { checkPermission } = require('../middleware/permissions');
const {
  validateCreateProject, validateUpdateProject, validateProjectFromTemplate,
  validateAddProjectMember, validateUpdateProjectMemberRole
} = require('../validators/project.validator');

// All routes require authentication
router.use(authenticate);

// ── Project CRUD ─────────────────────────────────────────────────────────────

// List projects (workspace-level access checked inside controller)
router.get('/', projectController.getProjects);

// Templates (no permission guard — public within workspace)
router.get('/templates', projectController.getTemplates);

// Create project (workspace permission checked inside controller — createProject)
router.post('/', validateCreateProject, projectController.createProject);

// Create project from template
router.post('/from-template', validateProjectFromTemplate, projectController.createProjectFromTemplate);

// Get project detail
router.get(
  '/:id',
  checkPermission({ resource: 'project', action: 'read' }),
  projectController.getProjectById
);

// Update project settings
router.put(
  '/:id',
  checkPermission({ resource: 'project', action: 'update' }),
  validateUpdateProject,
  projectController.updateProject
);

// Archive / soft-delete project
router.delete(
  '/:id',
  checkPermission({ resource: 'project', action: 'archive' }),
  projectController.deleteProject
);

// ── Project views ─────────────────────────────────────────────────────────────

router.get(
  '/:id/health',
  checkPermission({ resource: 'project', action: 'read' }),
  projectHealthController.getProjectHealth
);

router.get(
  '/:id/kanban',
  checkPermission({ resource: 'project', action: 'read' }),
  kanbanController.getKanbanBoard
);

// ── Project Members (RBAC V2 — project-level roles) ───────────────────────────

// GET  /projects/:id/members  — list project members + eligible workspace members to add
router.get(
  '/:id/members',
  checkPermission({ resource: 'project', action: 'read' }),
  projectMembersController.getProjectMembers
);

// GET  /projects/:id/members/roles  — list available project roles with metadata
router.get(
  '/:id/members/roles',
  checkPermission({ resource: 'project', action: 'read' }),
  projectMembersController.getProjectRoles
);

// POST /projects/:id/members  — add a workspace member to this project with a project role
router.post(
  '/:id/members',
  checkPermission({ resource: 'project', action: 'manage_members' }),
  validateAddProjectMember,
  projectMembersController.addProjectMember
);

// PUT  /projects/:id/members/:userId  — change a member's project role
router.put(
  '/:id/members/:userId',
  checkPermission({ resource: 'project', action: 'manage_members' }),
  validateUpdateProjectMemberRole,
  projectMembersController.updateProjectMemberRole
);

// DELETE /projects/:id/members/:userId  — remove member from project
router.delete(
  '/:id/members/:userId',
  checkPermission({ resource: 'project', action: 'manage_members' }),
  projectMembersController.removeProjectMember
);

module.exports = router;
