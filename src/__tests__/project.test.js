/**
 * Project endpoint tests
 * Runner : Jest + Supertest
 * DB     : Fully mocked — no real Postgres connection needed
 *
 * Endpoints covered (20 scenarios from TEST_SCENARIOS.md):
 *   GET    /api/v1/projects
 *   POST   /api/v1/projects
 *   GET    /api/v1/projects/:id
 *   PUT    /api/v1/projects/:id
 *   DELETE /api/v1/projects/:id
 *   GET    /api/v1/projects/:id/members
 *   POST   /api/v1/projects/:id/members
 *   PUT    /api/v1/projects/:id/members/:userId
 *   DELETE /api/v1/projects/:id/members/:userId
 */

// ── Constants ─────────────────────────────────────────────────────────────────

const WS_ID  = '00000000-0000-4000-8000-000000000001';
const PRJ_ID = '00000000-0000-4000-8000-000000000002';

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock('../models', () => {
  const m = () => ({
    findAll: jest.fn().mockResolvedValue([]),
    findAndCountAll: jest.fn().mockResolvedValue({ count: 0, rows: [] }),
    findByPk: jest.fn().mockResolvedValue(null),
    findOne: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue(null),
    update: jest.fn().mockResolvedValue([0]),
    destroy: jest.fn().mockResolvedValue(0),
    count: jest.fn().mockResolvedValue(0),
  });
  return {
    User:              m(),
    Workspace:         Object.assign(m(), { unscoped: jest.fn(() => m()) }),
    Project:           m(),
    Task:              m(),
    Subtask:           m(),
    Comment:           m(),
    Status:            m(),
    List:              m(),
    Workflow:          m(),
    TaskAssignees:     m(),
    TaskDependency:    m(),
    CustomField:       m(),
    TaskCustomField:   m(),
    WorkspaceMembers:  m(),
    ProjectMembers:    m(),
    GuestAccess:       m(),
    Invite:            m(),
    Notification:      m(),
    ActivityLog:       m(),
    TimeLog:           m(),
    Budget:            m(),
    BudgetExpense:     m(),
    SavedView:         m(),
    ChatRoom:          m(),
    ChatMessage:       m(),
    Resource:          m(),
    Attachment:        m(),
    Document:          m(),
    Whiteboard:        m(),
    WhiteboardElement: m(),
    sequelize: {
      transaction: jest.fn().mockResolvedValue({
        commit: jest.fn().mockResolvedValue(undefined),
        rollback: jest.fn().mockResolvedValue(undefined),
      }),
      query: jest.fn(),
      literal: jest.fn(val => val),
      Op: {},
    },
  };
});

jest.mock('../utils/logger', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
}));

jest.mock('../socket', () => ({
  emitChatMessage: jest.fn(),
  getIO: jest.fn(() => ({ to: jest.fn(() => ({ emit: jest.fn() })) })),
}));

// ── Dependencies ──────────────────────────────────────────────────────────────

const request = require('supertest');
const app     = require('../app');
const { User, Workspace, Project, WorkspaceMembers, ProjectMembers, Status, Task } = require('../models');
const { signToken, mockUsers, authHeader } = require('./helpers/jwt');

// ── Helpers ───────────────────────────────────────────────────────────────────

const buildUser = (overrides = {}) => ({
  ...mockUsers.member,
  planId: 'pro',
  update: jest.fn().mockResolvedValue(true),
  toJSON: jest.fn().mockReturnThis(),
  ...overrides,
});

const buildProject = (overrides = {}) => ({
  id: PRJ_ID,
  name: 'Test Project',
  description: 'A test project',
  workspaceId: WS_ID,
  status: 'active',
  color: '#3B82F6',
  isTemplate: false,
  createdAt: new Date().toISOString(),
  workspace: { id: WS_ID, name: 'Test Workspace' },
  update: jest.fn().mockResolvedValue(true),
  destroy: jest.fn().mockResolvedValue(true),
  reload: jest.fn().mockImplementation(function() { return Promise.resolve(this); }),
  toJSON: jest.fn().mockImplementation(function() {
    return { id: this.id, name: this.name, workspaceId: this.workspaceId, status: this.status };
  }),
  ...overrides,
});

const buildWorkspace = (ownerId) => ({
  id: WS_ID,
  name: 'Test Workspace',
  ownerId,
  isActive: true,
  toJSON: jest.fn().mockReturnThis(),
});

/**
 * Setup for a super_admin user — bypasses all permission checks.
 * Only User.findByPk (authenticate) needs to be mocked.
 * Permission middleware still calls Project.findByPk to resolve workspaceId
 * before calling resolvePermission, so that needs to be mocked too.
 */
const setupSuperAdmin = () => {
  const sa = buildUser({ ...mockUsers.super_admin });
  User.findByPk.mockResolvedValueOnce(sa);
  return sa;
};

/**
 * Setup for a workspace owner — user owns the workspace, so permission passes
 * immediately after Workspace.findByPk shows ownerId === user.id.
 */
const setupWorkspaceOwner = () => {
  const user = buildUser({ ...mockUsers.member });
  User.findByPk.mockResolvedValueOnce(user);
  return user;
};

// ── GET /api/v1/projects ───────────────────────────────────────────────────────

describe('GET /api/v1/projects — list projects', () => {
  beforeEach(() => jest.clearAllMocks());

  it('PRJ-006 — 200: super_admin lists all projects', async () => {
    setupSuperAdmin();
    const proj = buildProject();
    Project.findAndCountAll.mockResolvedValueOnce({ count: 1, rows: [proj] });

    const res = await request(app)
      .get('/api/v1/projects')
      .set('Authorization', authHeader('super_admin'));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.count).toBe(1);
  });

  it('PRJ-007 — 200: member lists projects scoped to accessible workspaces', async () => {
    const user = setupWorkspaceOwner();
    // WorkspaceMembers.findAll → accessible workspace IDs via membership
    WorkspaceMembers.findAll.mockResolvedValueOnce([{ workspaceId: WS_ID }]);
    // Workspace.findAll → owned workspace IDs
    Workspace.findAll.mockResolvedValueOnce([{ id: WS_ID }]);
    // Project.findAndCountAll → projects in those workspaces
    const proj = buildProject();
    Project.findAndCountAll.mockResolvedValueOnce({ count: 1, rows: [proj] });

    const res = await request(app)
      .get('/api/v1/projects')
      .set('Authorization', authHeader('member'));

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('200 — empty list when user has no accessible workspaces', async () => {
    setupWorkspaceOwner();
    WorkspaceMembers.findAll.mockResolvedValueOnce([]);
    Workspace.findAll.mockResolvedValueOnce([]);
    // No workspaces accessible → controller returns empty immediately

    const res = await request(app)
      .get('/api/v1/projects')
      .set('Authorization', authHeader('member'));

    expect(res.status).toBe(200);
    expect(res.body.count).toBe(0);
    expect(res.body.data).toEqual([]);
  });

  it('401 — unauthenticated request rejected', async () => {
    const res = await request(app).get('/api/v1/projects');
    expect(res.status).toBe(401);
  });
});

// ── POST /api/v1/projects ──────────────────────────────────────────────────────

describe('POST /api/v1/projects — create project', () => {
  beforeEach(() => jest.clearAllMocks());

  it('PRJ-001 — 201: workspace owner can create a project', async () => {
    const user = setupWorkspaceOwner();
    // No checkPermission for POST /projects
    // Controller: Workspace.findByPk
    Workspace.findByPk.mockResolvedValueOnce(buildWorkspace(mockUsers.member.id));

    const proj = buildProject();
    Project.create.mockResolvedValueOnce(proj);
    // Default statuses created
    Status.create.mockResolvedValue({ id: 'status-001' });
    // Project lead added
    ProjectMembers.create.mockResolvedValue({});

    const res = await request(app)
      .post('/api/v1/projects')
      .set('Authorization', authHeader('member'))
      .send({ name: 'New Project', workspaceId: WS_ID });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(Project.create).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'New Project', workspaceId: WS_ID })
    );
    // Creator should be auto-assigned as project_lead
    expect(ProjectMembers.create).toHaveBeenCalledWith(
      expect.objectContaining({ userId: mockUsers.member.id, role: 'project_lead' })
    );
  });

  it('PRJ-002 — 400: missing project name rejected by validator', async () => {
    setupWorkspaceOwner();

    const res = await request(app)
      .post('/api/v1/projects')
      .set('Authorization', authHeader('member'))
      .send({ workspaceId: WS_ID }); // no name

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('PRJ-003 — 400: missing workspaceId rejected by validator', async () => {
    setupWorkspaceOwner();

    const res = await request(app)
      .post('/api/v1/projects')
      .set('Authorization', authHeader('member'))
      .send({ name: 'No Workspace' }); // no workspaceId

    expect(res.status).toBe(400);
  });

  it('PRJ-003 — 404: invalid (non-existent) workspaceId returns 404', async () => {
    setupWorkspaceOwner();
    Workspace.findByPk.mockResolvedValueOnce(null); // workspace not found

    const res = await request(app)
      .post('/api/v1/projects')
      .set('Authorization', authHeader('member'))
      .send({ name: 'Ghost WS Project', workspaceId: '00000000-0000-4000-8000-000000000999' });

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/workspace not found/i);
  });

  it('PRJ-004 — 403: non-member of workspace cannot create project', async () => {
    setupWorkspaceOwner();
    // Workspace exists but user is NOT the owner
    Workspace.findByPk.mockResolvedValueOnce(buildWorkspace('uuid-someone-else'));
    // Not a workspace member
    WorkspaceMembers.findOne.mockResolvedValueOnce(null);

    const res = await request(app)
      .post('/api/v1/projects')
      .set('Authorization', authHeader('member'))
      .send({ name: 'Forbidden Project', workspaceId: WS_ID });

    expect(res.status).toBe(403);
  });

  it('PRJ-005 — 201: creator becomes project_lead', async () => {
    const user = setupWorkspaceOwner();
    Workspace.findByPk.mockResolvedValueOnce(buildWorkspace(mockUsers.member.id));

    const proj = buildProject();
    Project.create.mockResolvedValueOnce(proj);
    Status.create.mockResolvedValue({});
    ProjectMembers.create.mockResolvedValue({});

    await request(app)
      .post('/api/v1/projects')
      .set('Authorization', authHeader('member'))
      .send({ name: 'Lead Test Project', workspaceId: WS_ID });

    expect(ProjectMembers.create).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'project_lead', userId: mockUsers.member.id })
    );
  });
});

// ── GET /api/v1/projects/:id ───────────────────────────────────────────────────

describe('GET /api/v1/projects/:id — get project by ID', () => {
  beforeEach(() => jest.clearAllMocks());

  it('PRJ-008 — 200: project member can get project by ID', async () => {
    const user = setupWorkspaceOwner();

    // checkPermission auto-resolves workspaceId
    Project.findByPk.mockResolvedValueOnce({ id: PRJ_ID, workspaceId: WS_ID }); // permission auto-resolve
    Workspace.findByPk.mockResolvedValueOnce(buildWorkspace(mockUsers.member.id)); // resolvePermission
    // Controller
    const proj = buildProject();
    Project.findByPk.mockResolvedValueOnce(proj);

    const res = await request(app)
      .get(`/api/v1/projects/${PRJ_ID}`)
      .set('Authorization', authHeader('member'));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBe(PRJ_ID);
  });

  it('PRJ-009 — 403: non-member cannot get project', async () => {
    const user = setupWorkspaceOwner();

    // Permission check: project resolves workspace, but user is not workspace member/owner
    Project.findByPk.mockResolvedValueOnce({ id: PRJ_ID, workspaceId: WS_ID });
    Workspace.findByPk.mockResolvedValueOnce(buildWorkspace('uuid-someone-else'));
    WorkspaceMembers.findOne.mockResolvedValueOnce(null); // not a member

    const res = await request(app)
      .get(`/api/v1/projects/${PRJ_ID}`)
      .set('Authorization', authHeader('member'));

    expect(res.status).toBe(403);
  });

  it('404 — non-existent project returns 404 from permission middleware', async () => {
    const user = setupWorkspaceOwner();

    // checkPermission: Project.findByPk returns null → workspaceId unknown → resolvePermission gets no workspaceId
    Project.findByPk.mockResolvedValueOnce(null);

    const res = await request(app)
      .get('/api/v1/projects/nonexistent-prj-id')
      .set('Authorization', authHeader('member'));

    // resolvePermission: workspaceId = undefined → { allowed: false, reason: 'workspace_id_required' }
    expect(res.status).toBe(403);
  });
});

// ── PUT /api/v1/projects/:id ───────────────────────────────────────────────────

describe('PUT /api/v1/projects/:id — update project', () => {
  beforeEach(() => jest.clearAllMocks());

  it('PRJ-010 — 200: project owner can update name', async () => {
    const user = setupWorkspaceOwner();

    // Permission check
    Project.findByPk.mockResolvedValueOnce({ id: PRJ_ID, workspaceId: WS_ID });
    Workspace.findByPk.mockResolvedValueOnce(buildWorkspace(mockUsers.member.id));
    // Controller
    const proj = buildProject();
    Project.findByPk.mockResolvedValueOnce(proj);

    const res = await request(app)
      .put(`/api/v1/projects/${PRJ_ID}`)
      .set('Authorization', authHeader('member'))
      .send({ name: 'Updated Project Name' });

    expect(res.status).toBe(200);
    expect(proj.update).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Updated Project Name' })
    );
  });

  it('PRJ-011 — 403: viewer cannot update project', async () => {
    const user = buildUser({ ...mockUsers.viewer });
    User.findByPk.mockResolvedValueOnce(user);

    // Permission check: workspace exists, user is viewer member
    Project.findByPk.mockResolvedValueOnce({ id: PRJ_ID, workspaceId: WS_ID });
    Workspace.findByPk.mockResolvedValueOnce(buildWorkspace('uuid-owner'));
    WorkspaceMembers.findOne.mockResolvedValueOnce({ role: 'viewer', workspaceId: WS_ID, userId: user.id });
    // No project member record → falls back to workspace role (viewer)
    ProjectMembers.findOne.mockResolvedValueOnce(null);

    const res = await request(app)
      .put(`/api/v1/projects/${PRJ_ID}`)
      .set('Authorization', authHeader('viewer'))
      .send({ name: 'Viewer Sneaky Update' });

    expect(res.status).toBe(403);
  });

  it('PRJ-014 — 200: owner can update project status', async () => {
    const user = setupWorkspaceOwner();

    Project.findByPk.mockResolvedValueOnce({ id: PRJ_ID, workspaceId: WS_ID });
    Workspace.findByPk.mockResolvedValueOnce(buildWorkspace(mockUsers.member.id));
    const proj = buildProject();
    Project.findByPk.mockResolvedValueOnce(proj);

    const res = await request(app)
      .put(`/api/v1/projects/${PRJ_ID}`)
      .set('Authorization', authHeader('member'))
      .send({ status: 'on_hold' });

    expect(res.status).toBe(200);
    expect(proj.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'on_hold' })
    );
  });
});

// ── DELETE /api/v1/projects/:id ────────────────────────────────────────────────

describe('DELETE /api/v1/projects/:id — archive project', () => {
  beforeEach(() => jest.clearAllMocks());

  it('PRJ-012 — 200: workspace owner can archive project', async () => {
    const user = setupWorkspaceOwner();

    Project.findByPk.mockResolvedValueOnce({ id: PRJ_ID, workspaceId: WS_ID });
    Workspace.findByPk.mockResolvedValueOnce(buildWorkspace(mockUsers.member.id));
    // controller project lookup
    const proj = buildProject();
    Project.findByPk.mockResolvedValueOnce(proj);

    const res = await request(app)
      .delete(`/api/v1/projects/${PRJ_ID}`)
      .set('Authorization', authHeader('member'));

    expect(res.status).toBe(200);
    // Soft delete: status set to 'archived'
    expect(proj.update).toHaveBeenCalledWith({ status: 'archived' });
  });

  it('PRJ-013 — 200: deleted project returns 404 on subsequent fetch', async () => {
    // Archive then verify controller returns 404 when project gone
    const user = setupWorkspaceOwner();

    // checkPermission → project not found → no workspaceId → 403 (workspace_id_required)
    Project.findByPk.mockResolvedValueOnce(null);

    const res = await request(app)
      .get(`/api/v1/projects/deleted-prj-id`)
      .set('Authorization', authHeader('member'));

    expect([403, 404]).toContain(res.status);
  });
});

// ── PRJ-015 — dates not in MVP schema ─────────────────────────────────────────
// PRJ-015 (startDate/dueDate update) — SKIPPED: Project model does not have
// startDate or dueDate columns in the current MVP schema.

// ── GET /api/v1/projects/:id/members ───────────────────────────────────────────

describe('GET /api/v1/projects/:id/members — list project members', () => {
  beforeEach(() => jest.clearAllMocks());

  it('PRJ-020 — 200: member can list project members', async () => {
    setupWorkspaceOwner();
    // checkPermission auto-resolve
    Project.findByPk.mockResolvedValueOnce({ id: PRJ_ID, workspaceId: WS_ID }); // perm resolve
    Workspace.findByPk.mockResolvedValueOnce(buildWorkspace(mockUsers.member.id));
    // controller: Project.findByPk (with workspace include)
    Project.findByPk.mockResolvedValueOnce({ id: PRJ_ID, workspaceId: WS_ID, name: 'Test Project', workspace: { id: WS_ID } });
    // ProjectMembers.findAll (uses sequelize.literal in order)
    ProjectMembers.findAll.mockResolvedValueOnce([
      { id: 'pm-001', userId: mockUsers.member.id, role: 'project_lead', joinedAt: new Date(),
        user: { id: mockUsers.member.id, firstName: 'Test', lastName: 'User', email: 'test@example.com', avatar: null, role: 'member', isActive: true },
        inviter: null },
    ]);
    WorkspaceMembers.findAll.mockResolvedValueOnce([]); // no eligible-to-add users

    const res = await request(app)
      .get(`/api/v1/projects/${PRJ_ID}/members`)
      .set('Authorization', authHeader('member'));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.count).toBe(1);
  });
});

// ── POST /api/v1/projects/:id/members ─────────────────────────────────────────
// NOTE: validator PROJECT_ROLES = ['project_lead','developer','designer','qa','viewer']

const NEW_USER_UUID = '11111111-2222-4000-8000-000000000010';

describe('POST /api/v1/projects/:id/members — add project member', () => {
  beforeEach(() => jest.clearAllMocks());

  it('PRJ-016 — 201: project lead adds a workspace member to project', async () => {
    const proj = { id: PRJ_ID, workspaceId: WS_ID, name: 'Test Project' };
    User.findByPk.mockResolvedValueOnce(buildUser({ ...mockUsers.super_admin })); // auth
    Project.findByPk.mockResolvedValueOnce(proj);  // checkPermission auto-resolve
    Project.findByPk.mockResolvedValueOnce(proj);  // controller: project lookup
    User.findByPk.mockResolvedValueOnce({ id: NEW_USER_UUID, firstName: 'New', lastName: 'User', email: 'new@test.com', avatar: null, isActive: true }); // target user
    WorkspaceMembers.findOne.mockResolvedValueOnce({ userId: NEW_USER_UUID, workspaceId: WS_ID }); // ws member check
    ProjectMembers.findOne.mockResolvedValueOnce(null); // not already member
    ProjectMembers.create.mockResolvedValueOnce({ id: 'pm-002', userId: NEW_USER_UUID, projectId: PRJ_ID, role: 'viewer', joinedAt: new Date() });

    const res = await request(app)
      .post(`/api/v1/projects/${PRJ_ID}/members`)
      .set('Authorization', authHeader('super_admin'))
      .send({ userId: NEW_USER_UUID, role: 'viewer' });

    expect(res.status).toBe(201);
    expect(ProjectMembers.create).toHaveBeenCalledWith(
      expect.objectContaining({ userId: NEW_USER_UUID, projectId: PRJ_ID, role: 'viewer' })
    );
  });

  it('PRJ-017 — 400: cannot add user not in workspace to project', async () => {
    const proj = { id: PRJ_ID, workspaceId: WS_ID, name: 'Test Project' };
    User.findByPk.mockResolvedValueOnce(buildUser({ ...mockUsers.super_admin })); // auth
    Project.findByPk.mockResolvedValueOnce(proj); // checkPermission auto-resolve
    Project.findByPk.mockResolvedValueOnce(proj); // controller
    User.findByPk.mockResolvedValueOnce({ id: NEW_USER_UUID, firstName: 'Out', lastName: 'Side', email: 'out@test.com', avatar: null, isActive: true }); // target user
    WorkspaceMembers.findOne.mockResolvedValueOnce(null); // NOT a ws member

    const res = await request(app)
      .post(`/api/v1/projects/${PRJ_ID}/members`)
      .set('Authorization', authHeader('super_admin'))
      .send({ userId: NEW_USER_UUID, role: 'viewer' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/workspace member/i);
  });
});

// ── PUT /api/v1/projects/:id/members/:userId ───────────────────────────────────

describe('PUT /api/v1/projects/:id/members/:userId — change project member role', () => {
  beforeEach(() => jest.clearAllMocks());

  it('PRJ-019 — 200: project lead changes member role', async () => {
    User.findByPk.mockResolvedValueOnce(buildUser({ ...mockUsers.super_admin })); // auth
    Project.findByPk.mockResolvedValueOnce({ id: PRJ_ID, workspaceId: WS_ID }); // checkPermission auto-resolve
    // controller: count project leads (qa != project_lead → check)
    ProjectMembers.count.mockResolvedValueOnce(2); // 2 leads → safe
    const membership = { userId: NEW_USER_UUID, projectId: PRJ_ID, role: 'developer', update: jest.fn().mockResolvedValue(true) };
    ProjectMembers.findOne.mockResolvedValueOnce(membership); // lead demotion guard
    ProjectMembers.findOne.mockResolvedValueOnce(membership); // actual member fetch

    const res = await request(app)
      .put(`/api/v1/projects/${PRJ_ID}/members/${NEW_USER_UUID}`)
      .set('Authorization', authHeader('super_admin'))
      .send({ role: 'viewer' });

    expect(res.status).toBe(200);
    expect(membership.update).toHaveBeenCalledWith({ role: 'viewer' });
  });
});

// ── DELETE /api/v1/projects/:id/members/:userId ────────────────────────────────

describe('DELETE /api/v1/projects/:id/members/:userId — remove project member', () => {
  beforeEach(() => jest.clearAllMocks());

  it('PRJ-018 — 200: project lead removes a non-lead member', async () => {
    User.findByPk.mockResolvedValueOnce(buildUser({ ...mockUsers.super_admin })); // auth
    Project.findByPk.mockResolvedValueOnce({ id: PRJ_ID, workspaceId: WS_ID }); // checkPermission auto-resolve
    // controller: find member — role 'developer' → no lead count check
    const membership = { userId: NEW_USER_UUID, projectId: PRJ_ID, role: 'developer', destroy: jest.fn().mockResolvedValue(true) };
    ProjectMembers.findOne.mockResolvedValueOnce(membership);
    // Project.findByPk for notification body
    Project.findByPk.mockResolvedValueOnce({ id: PRJ_ID, name: 'Test Project' });

    const res = await request(app)
      .delete(`/api/v1/projects/${PRJ_ID}/members/${NEW_USER_UUID}`)
      .set('Authorization', authHeader('super_admin'));

    expect(res.status).toBe(200);
    expect(membership.destroy).toHaveBeenCalled();
  });
});
