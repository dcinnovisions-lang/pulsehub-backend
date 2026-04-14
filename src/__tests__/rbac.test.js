/**
 * RBAC (Role-Based Access Control) tests
 * Runner : Jest + Supertest
 * DB     : Fully mocked — no real Postgres
 *
 * These tests verify the permission matrix enforcement across key roles.
 * Many individual role checks are already covered by workspace/task/comment tests;
 * this file focuses on scenarios unique to the RBAC layer:
 *   - Permission matrix endpoint
 *   - billing_admin isolation
 *   - project role overriding workspace role
 *   - Owner permissions without explicit member record
 *   - Non-member access denial
 *
 * Endpoints used:
 *   GET  /api/v1/permissions/matrix
 *   GET  /api/v1/workspaces/:id        (workspace permission checks)
 *   DELETE /api/v1/workspaces/:id      (admin cannot delete)
 *   PUT  /api/v1/workspaces/:id        (member cannot update)
 *   POST /api/v1/tasks                 (billing_admin blocked, contributor allowed)
 */

// ── Constants ─────────────────────────────────────────────────────────────────

const WS_ID  = '00000000-0000-4000-8000-000000000001';
const PRJ_ID = '00000000-0000-4000-8000-000000000002';
const TASK_ID = '00000000-0000-4000-8000-000000000003';

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock('../models', () => ({
  User:        { findAll: jest.fn(), findByPk: jest.fn(), findOne: jest.fn(), create: jest.fn() },
  Workspace:   {
    findAll: jest.fn(), findByPk: jest.fn(), findOne: jest.fn(), create: jest.fn(), count: jest.fn(),
    unscoped: jest.fn(() => ({ findAll: jest.fn(), findByPk: jest.fn(), create: jest.fn(), count: jest.fn() })),
  },
  WorkspaceMembers: { findOne: jest.fn(), findAll: jest.fn(), create: jest.fn(), destroy: jest.fn() },
  ProjectMembers:   { findOne: jest.fn(), findAll: jest.fn(), create: jest.fn(), destroy: jest.fn() },
  GuestAccess:      { findOne: jest.fn() },
  Project:     { findAll: jest.fn(), findByPk: jest.fn(), findOne: jest.fn(), create: jest.fn(), count: jest.fn() },
  Task:        {
    findAll: jest.fn(), findByPk: jest.fn(), findOne: jest.fn(),
    findAndCountAll: jest.fn(), create: jest.fn(), count: jest.fn(),
    max: jest.fn(), bulkCreate: jest.fn()
  },
  Subtask:     { findAll: jest.fn(), findByPk: jest.fn(), create: jest.fn(), max: jest.fn() },
  Status:      { findAll: jest.fn(), findByPk: jest.fn() },
  List:        { findAll: jest.fn(), findByPk: jest.fn() },
  Notification: {
    findAll: jest.fn(), findByPk: jest.fn(), findOne: jest.fn(),
    findAndCountAll: jest.fn(), create: jest.fn(),
    update: jest.fn(), count: jest.fn(), destroy: jest.fn()
  },
  ActivityLog:    { findAll: jest.fn(), findAndCountAll: jest.fn(), create: jest.fn() },
  Invite:         { findAll: jest.fn(), findByPk: jest.fn(), findOne: jest.fn(), create: jest.fn() },
  Comment:        { findAll: jest.fn(), findByPk: jest.fn(), create: jest.fn() },
  Attachment:     { findAll: jest.fn(), findByPk: jest.fn(), create: jest.fn() },
  TimeLog:        { findAll: jest.fn(), findByPk: jest.fn(), create: jest.fn(), sum: jest.fn() },
  Budget:         { findAll: jest.fn(), findByPk: jest.fn(), create: jest.fn(), findOne: jest.fn() },
  BudgetExpense:  { findAll: jest.fn(), findByPk: jest.fn(), create: jest.fn() },
  SavedView:      { findAll: jest.fn(), findByPk: jest.fn(), create: jest.fn(), findOne: jest.fn() },
  ChatRoom:       { findAll: jest.fn(), findByPk: jest.fn(), create: jest.fn(), findOne: jest.fn() },
  ChatMessage:    { findAll: jest.fn(), findByPk: jest.fn(), create: jest.fn() },
  Resource:       { findAll: jest.fn(), findByPk: jest.fn(), create: jest.fn(), findOne: jest.fn() },
  TaskAssignees:  { findAll: jest.fn(), findOne: jest.fn(), create: jest.fn(), destroy: jest.fn(), bulkCreate: jest.fn() },
  TaskDependency: { findAll: jest.fn(), findOne: jest.fn(), create: jest.fn(), destroy: jest.fn() },
  CustomField:    { findAll: jest.fn(), findByPk: jest.fn(), create: jest.fn() },
  TaskCustomField:{ findAll: jest.fn(), findOne: jest.fn(), create: jest.fn() },
  Workflow:       { findAll: jest.fn(), findByPk: jest.fn(), create: jest.fn() },
  Whiteboard:     { findAll: jest.fn(), findByPk: jest.fn(), create: jest.fn() },
  WhiteboardElement: { findAll: jest.fn(), findByPk: jest.fn(), create: jest.fn() },
  Document:       { findAll: jest.fn(), findByPk: jest.fn(), create: jest.fn() },
  sequelize: {
    transaction: jest.fn().mockResolvedValue({
      commit: jest.fn().mockResolvedValue(undefined),
      rollback: jest.fn().mockResolvedValue(undefined),
    }),
    query: jest.fn(), Op: {},
  },
}));

jest.mock('../utils/logger', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
}));

jest.mock('../socket', () => ({
  emitChatMessage: jest.fn(),
  emitTaskUpdated: jest.fn(),
  getIO:       jest.fn(() => ({ to: jest.fn(() => ({ emit: jest.fn() })) })),
  userSockets: new Map(),
}));

jest.mock('../controllers/notification.controller', () => ({
  createNotification:       jest.fn().mockResolvedValue({ id: 'notif-uuid' }),
  getNotifications:         jest.fn(),
  getUnreadCount:           jest.fn(),
  markAllAsRead:            jest.fn(),
  markAsRead:               jest.fn(),
  clearReadNotifications:   jest.fn(),
  deleteNotification:       jest.fn(),
}));

jest.mock('../utils/automationEngine', () => ({
  runAutomations: jest.fn().mockResolvedValue(undefined),
}));

// ── Dependencies ──────────────────────────────────────────────────────────────

const request = require('supertest');
const app     = require('../app');
const { User, Workspace, WorkspaceMembers, ProjectMembers, Project, Task, TaskAssignees } = require('../models');
const { authHeader, mockUsers } = require('./helpers/jwt');

// ── Builders ──────────────────────────────────────────────────────────────────

const buildUser = (overrides = {}) => ({
  ...mockUsers.member,
  planId: 'pro',
  update: jest.fn().mockResolvedValue(true),
  toJSON: jest.fn().mockReturnThis(),
  ...overrides,
});

const buildWorkspace = (ownerId = 'someone-else-id') => ({
  id: WS_ID, name: 'Test WS', ownerId, isActive: true,
  update: jest.fn().mockResolvedValue(true),
  destroy: jest.fn().mockResolvedValue(true),
  toJSON: jest.fn().mockReturnThis(),
});

const buildProject = () => ({
  id: PRJ_ID, workspaceId: WS_ID, name: 'Test Project', status: 'active',
});

const buildTask = (overrides = {}) => ({
  id: TASK_ID, title: 'New Task', projectId: PRJ_ID, priority: 'medium',
  createdBy: mockUsers.member.id,
  update: jest.fn().mockResolvedValue(true),
  destroy: jest.fn().mockResolvedValue(true),
  reload: jest.fn().mockImplementation(function () { return Promise.resolve(this); }),
  setAssignees: jest.fn().mockResolvedValue(undefined),
  toJSON: jest.fn().mockReturnThis(),
  ...overrides,
});

// ── Permission Matrix ─────────────────────────────────────────────────────────

describe('GET /api/v1/permissions/matrix — permission matrix endpoint', () => {
  beforeEach(() => jest.clearAllMocks());

  it('200: returns role and resource matrix for authenticated user', async () => {
    User.findByPk.mockResolvedValueOnce(buildUser({ ...mockUsers.super_admin }));

    const res = await request(app)
      .get('/api/v1/permissions/matrix')
      .set('Authorization', authHeader('super_admin'));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.roles).toBeDefined();
    expect(res.body.data.resources).toBeDefined();
    expect(res.body.data.roles.super_admin.read).toBe(true);
    expect(res.body.data.roles.viewer.create).toBe(false);
  });

  it('401 — unauthenticated request rejected', async () => {
    const res = await request(app).get('/api/v1/permissions/matrix');
    expect(res.status).toBe(401);
  });
});

// ── RBAC-003: Admin cannot delete workspace ───────────────────────────────────

describe('RBAC-003 — admin role cannot delete workspace', () => {
  beforeEach(() => jest.clearAllMocks());

  it('403: admin workspace role is denied workspace.delete', async () => {
    User.findByPk.mockResolvedValueOnce(buildUser({ ...mockUsers.admin }));
    // checkWorkspacePerm calls resolvePermission:
    Workspace.findByPk.mockResolvedValueOnce(buildWorkspace());  // existence + ownerId check
    WorkspaceMembers.findOne.mockResolvedValueOnce({ role: 'admin' });

    const res = await request(app)
      .delete(`/api/v1/workspaces/${WS_ID}`)
      .set('Authorization', authHeader('admin'));

    expect(res.status).toBe(403);
  });
});

// ── RBAC-006: Member cannot update workspace ──────────────────────────────────

describe('RBAC-006 — member role cannot update workspace', () => {
  beforeEach(() => jest.clearAllMocks());

  it('403: member is denied workspace.update', async () => {
    User.findByPk.mockResolvedValueOnce(buildUser({ ...mockUsers.member }));
    Workspace.findByPk.mockResolvedValueOnce(buildWorkspace());
    WorkspaceMembers.findOne.mockResolvedValueOnce({ role: 'member' });

    const res = await request(app)
      .put(`/api/v1/workspaces/${WS_ID}`)
      .set('Authorization', authHeader('member'))
      .send({ name: 'Hacked Name' });

    expect(res.status).toBe(403);
  });
});

// ── RBAC-015: Workspace owner bypasses member record check ────────────────────

describe('RBAC-015 — workspace owner has implicit full access', () => {
  beforeEach(() => jest.clearAllMocks());

  it('200: owner can read workspace even without explicit WorkspaceMembers record', async () => {
    const ownerUser = buildUser({ ...mockUsers.member, id: 'uuid-owner' });
    User.findByPk.mockResolvedValueOnce(ownerUser);
    // checkWorkspacePerm: workspace.ownerId matches user → allowed immediately
    Workspace.findByPk.mockResolvedValueOnce(buildWorkspace('uuid-owner'));

    // Controller: Workspace.findByPk (again for the actual controller lookup)
    const ws = buildWorkspace('uuid-owner');
    ws.members = [];
    Workspace.findByPk.mockResolvedValueOnce(ws);
    WorkspaceMembers.findAll.mockResolvedValueOnce([]);

    const token = require('./helpers/jwt').signToken({ id: 'uuid-owner' });
    const res = await request(app)
      .get(`/api/v1/workspaces/${WS_ID}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
  });
});

// ── RBAC-016: Non-member cannot access workspace ──────────────────────────────

describe('RBAC-016 — non-member blocked from workspace data', () => {
  beforeEach(() => jest.clearAllMocks());

  it('403: user with no workspace membership cannot read workspace', async () => {
    User.findByPk.mockResolvedValueOnce(buildUser({ ...mockUsers.member }));
    Workspace.findByPk.mockResolvedValueOnce(buildWorkspace('other-owner-not-member'));
    WorkspaceMembers.findOne.mockResolvedValueOnce(null);  // not a member

    const res = await request(app)
      .get(`/api/v1/workspaces/${WS_ID}`)
      .set('Authorization', authHeader('member'));

    expect(res.status).toBe(403);
  });
});

// ── RBAC-025: billing_admin blocked from task routes ──────────────────────────

describe('RBAC-025 — billing_admin cannot create tasks', () => {
  beforeEach(() => jest.clearAllMocks());

  it('403: billing_admin has no task resource access', async () => {
    const billingAdmin = buildUser({ ...mockUsers.admin, id: 'uuid-billing-admin' });
    User.findByPk.mockResolvedValueOnce(billingAdmin);
    // checkPermission auto-resolve: Project.findByPk → project with workspaceId
    Project.findByPk.mockResolvedValueOnce({ id: PRJ_ID, workspaceId: WS_ID });
    // resolvePermission: workspace exists, not owner, has WS member record with billing_admin role
    Workspace.findByPk.mockResolvedValueOnce(buildWorkspace('someone-else'));
    WorkspaceMembers.findOne.mockResolvedValueOnce({ role: 'billing_admin' });

    const token = require('./helpers/jwt').signToken({ id: 'uuid-billing-admin' });
    const res = await request(app)
      .post('/api/v1/tasks')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Billing task', projectId: PRJ_ID });

    expect(res.status).toBe(403);
  });
});

// ── RBAC-014: Project role overrides workspace role ───────────────────────────

describe('RBAC-014 — contributor project role overrides member workspace role', () => {
  beforeEach(() => jest.clearAllMocks());

  it('201: workspace member with contributor project role can create tasks', async () => {
    const memberUser = buildUser({ ...mockUsers.member });
    User.findByPk.mockResolvedValueOnce(memberUser);

    // checkPermission auto-resolve: Project.findByPk → project
    Project.findByPk.mockResolvedValueOnce({ id: PRJ_ID, workspaceId: WS_ID });
    // resolvePermission:
    Workspace.findByPk.mockResolvedValueOnce(buildWorkspace('someone-else'));  // not owner
    WorkspaceMembers.findOne.mockResolvedValueOnce({ role: 'member' });  // workspace role: member (can't create tasks)
    ProjectMembers.findOne.mockResolvedValueOnce({ role: 'contributor' }); // project role OVERRIDES

    // contributor.task.create = true → allowed, controller runs
    const task = buildTask();
    Project.findByPk.mockResolvedValueOnce(buildProject());  // controller project lookup
    Task.max.mockResolvedValueOnce(0);
    Task.create.mockResolvedValueOnce(task);
    Task.findByPk.mockResolvedValueOnce(task);
    TaskAssignees.findAll.mockResolvedValueOnce([]);

    const res = await request(app)
      .post('/api/v1/tasks')
      .set('Authorization', authHeader('member'))
      .send({ title: 'New Task', projectId: PRJ_ID });

    expect(res.status).toBe(201);
  });
});

// ── RBAC-008: Viewer cannot create comments ───────────────────────────────────

describe('RBAC-008 — viewer cannot create comments', () => {
  beforeEach(() => jest.clearAllMocks());

  it('403: viewer.comment.create = false', async () => {
    User.findByPk.mockResolvedValueOnce(buildUser({ ...mockUsers.viewer }));
    // checkPermission auto-resolve: projectId from body
    Project.findByPk.mockResolvedValueOnce({ id: PRJ_ID, workspaceId: WS_ID });
    Workspace.findByPk.mockResolvedValueOnce(buildWorkspace('other-owner'));
    WorkspaceMembers.findOne.mockResolvedValueOnce({ role: 'viewer' });

    const res = await request(app)
      .post(`/api/v1/tasks/${TASK_ID}/comments`)
      .set('Authorization', authHeader('viewer'))
      .send({ content: 'I am a viewer', projectId: PRJ_ID });

    expect(res.status).toBe(403);
  });
});

// ── RBAC-026: billing_admin can view permission matrix ────────────────────────

describe('RBAC-026 — billing_admin can access billing-level resources', () => {
  beforeEach(() => jest.clearAllMocks());

  it('200: billing_admin can access GET /permissions/matrix', async () => {
    User.findByPk.mockResolvedValueOnce(buildUser({ ...mockUsers.admin, id: 'uuid-billing' }));

    const token = require('./helpers/jwt').signToken({ id: 'uuid-billing' });
    const res = await request(app)
      .get('/api/v1/permissions/matrix')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
  });
});
