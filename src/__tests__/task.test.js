/**
 * Task endpoint tests
 * Runner : Jest + Supertest
 * DB     : Fully mocked — no real Postgres connection needed
 *
 * Endpoints covered:
 *   GET    /api/v1/tasks
 *   POST   /api/v1/tasks
 *   GET    /api/v1/tasks/:id
 *   PUT    /api/v1/tasks/:id
 *   DELETE /api/v1/tasks/:id
 *   POST   /api/v1/tasks/bulk  (bulkCreate)
 *   POST   /api/v1/tasks/:taskId/subtasks
 *
 * NOTE — BUG-004: PUT /tasks/bulk and DELETE /tasks/bulk are shadowed by
 *   PUT /:id and DELETE /:id (defined earlier in task.routes.js).
 *   Tests for those routes are omitted here; see BUG_TRACKER.md.
 */

// ── Constants ──────────────────────────────────────────────────────────────────

const WS_ID     = '00000000-0000-4000-8000-000000000001';
const PRJ_ID    = '00000000-0000-4000-8000-000000000002';
const TASK_ID   = '00000000-0000-4000-8000-000000000003';
const STATUS_ID = '00000000-0000-4000-8000-000000000004';

// ── Mocks ──────────────────────────────────────────────────────────────────────

jest.mock('../models', () => ({
  User: {
    findAll: jest.fn(), findByPk: jest.fn(), findOne: jest.fn(),
    findAndCountAll: jest.fn(), create: jest.fn(), update: jest.fn(),
    destroy: jest.fn(), count: jest.fn(),
  },
  Workspace: {
    findAll: jest.fn(), findByPk: jest.fn(), findOne: jest.fn(),
    findAndCountAll: jest.fn(), create: jest.fn(), update: jest.fn(),
    destroy: jest.fn(), count: jest.fn(),
    unscoped: jest.fn(() => ({ findAll: jest.fn(), findByPk: jest.fn(), create: jest.fn(), count: jest.fn() })),
  },
  WorkspaceMembers: { findOne: jest.fn(), findAll: jest.fn(), create: jest.fn(), destroy: jest.fn() },
  ProjectMembers:   { findOne: jest.fn(), findAll: jest.fn(), create: jest.fn(), destroy: jest.fn() },
  GuestAccess:      { findOne: jest.fn() },
  Project: {
    findAll: jest.fn(), findByPk: jest.fn(), findOne: jest.fn(),
    findAndCountAll: jest.fn(), create: jest.fn(), update: jest.fn(),
    destroy: jest.fn(), count: jest.fn(),
  },
  Task: {
    findAll: jest.fn(), findByPk: jest.fn(), findOne: jest.fn(),
    findAndCountAll: jest.fn(), create: jest.fn(), update: jest.fn(),
    destroy: jest.fn(), count: jest.fn(),
    max: jest.fn(), bulkCreate: jest.fn(),
  },
  Subtask: {
    findAll: jest.fn(), findByPk: jest.fn(), create: jest.fn(),
    update: jest.fn(), destroy: jest.fn(), max: jest.fn(),
  },
  Status:       { findAll: jest.fn(), findByPk: jest.fn(), create: jest.fn() },
  List:         { findAll: jest.fn(), findByPk: jest.fn(), create: jest.fn() },
  Notification: { findAll: jest.fn(), findByPk: jest.fn(), create: jest.fn(), update: jest.fn(), count: jest.fn(), destroy: jest.fn() },
  ActivityLog:  { findAll: jest.fn(), findAndCountAll: jest.fn(), create: jest.fn() },
  Invite:       { findAll: jest.fn(), findByPk: jest.fn(), findOne: jest.fn(), create: jest.fn(), destroy: jest.fn() },
  Comment:      { findAll: jest.fn(), findByPk: jest.fn(), create: jest.fn() },
  Attachment:   { findAll: jest.fn(), findByPk: jest.fn(), create: jest.fn() },
  TimeLog:      { findAll: jest.fn(), findByPk: jest.fn(), create: jest.fn(), sum: jest.fn() },
  Budget:       { findAll: jest.fn(), findByPk: jest.fn(), create: jest.fn(), findOne: jest.fn() },
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
  getIO: jest.fn(() => ({ to: jest.fn(() => ({ emit: jest.fn() })) })),
}));

// ── Dependencies ───────────────────────────────────────────────────────────────

const request = require('supertest');
const app     = require('../app');
const { User, Workspace, Project, WorkspaceMembers, ProjectMembers, Task, Subtask, Status, TaskAssignees } = require('../models');
const { authHeader, mockUsers } = require('./helpers/jwt');

// ── Builders ───────────────────────────────────────────────────────────────────

const buildUser = (overrides = {}) => ({
  ...mockUsers.member,
  planId: 'pro',
  update: jest.fn().mockResolvedValue(true),
  toJSON: jest.fn().mockReturnThis(),
  ...overrides,
});

const buildWorkspace = (ownerId = mockUsers.member.id) => ({
  id: WS_ID, name: 'Test WS', ownerId, isActive: true,
});

const buildProject = () => ({
  id: PRJ_ID, workspaceId: WS_ID, name: 'Test Project', status: 'active',
});

const buildTask = (overrides = {}) => ({
  id: TASK_ID,
  title: 'Test Task',
  description: 'A test task description',
  projectId: PRJ_ID,
  priority: 'medium',
  statusId: null,
  dueDate: null,
  createdBy: mockUsers.super_admin.id,
  update: jest.fn().mockResolvedValue(true),
  destroy: jest.fn().mockResolvedValue(true),
  reload: jest.fn().mockImplementation(function () { return Promise.resolve(this); }),
  setAssignees: jest.fn().mockResolvedValue(undefined),
  toJSON: jest.fn().mockReturnThis(),
  ...overrides,
});

const buildSubtask = () => ({
  id: '00000000-0000-4000-8000-000000000005',
  taskId: TASK_ID, title: 'A subtask', isCompleted: false, position: 1,
  reload: jest.fn().mockImplementation(function () { return Promise.resolve(this); }),
  toJSON: jest.fn().mockReturnThis(),
});

// ── Auth helpers ───────────────────────────────────────────────────────────────

/** Authenticate as super_admin (bypasses all permission DB lookups) */
const setupSA = () => {
  const sa = buildUser({ ...mockUsers.super_admin });
  User.findByPk.mockResolvedValueOnce(sa);
  return sa;
};

/**
 * Authenticate as workspace owner (member user who owns WS_ID).
 * For /:id task routes, caller must also mock the checkPermission auto-resolve
 * (Project.findByPk for task-as-project shortcut) and resolvePermission
 * (Workspace.findByPk showing ownerId === user.id).
 */
const setupOwner = () => {
  const user = buildUser({ ...mockUsers.member });
  User.findByPk.mockResolvedValueOnce(user);
  return user;
};

const setupViewer = () => {
  const user = buildUser({ ...mockUsers.viewer });
  User.findByPk.mockResolvedValueOnce(user);
  return user;
};

/**
 * Mock checkPermission middleware auto-resolve for task /:id routes.
 *
 * checkPermission uses req.params.id as projectId candidate. It calls
 * Project.findByPk(TASK_ID) — we shortcut by returning a project-like object so
 * the workspace is resolved without needing the Task table lookup path.
 */
const mockPermAutoResolve = () => {
  Project.findByPk.mockResolvedValueOnce({ id: PRJ_ID, workspaceId: WS_ID });
};

// ── GET /api/v1/tasks ──────────────────────────────────────────────────────────

describe('GET /api/v1/tasks — list tasks', () => {
  beforeEach(() => jest.clearAllMocks());

  it('TASK-011 — 200: super_admin lists all tasks', async () => {
    setupSA();
    const task = buildTask();
    Task.findAndCountAll.mockResolvedValueOnce({ count: 1, rows: [task] });

    const res = await request(app)
      .get('/api/v1/tasks')
      .set('Authorization', authHeader('super_admin'));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.count).toBe(1);
  });

  it('200 — member with no workspace access returns empty list', async () => {
    setupOwner();
    // No workspace memberships and no owned workspaces
    WorkspaceMembers.findAll.mockResolvedValueOnce([]);
    Workspace.findAll.mockResolvedValueOnce([]);

    const res = await request(app)
      .get('/api/v1/tasks')
      .set('Authorization', authHeader('member'));

    expect(res.status).toBe(200);
    expect(res.body.count).toBe(0);
    expect(res.body.data).toEqual([]);
  });

  it('TASK-015 — 200: super_admin with pagination returns total and pagination meta', async () => {
    setupSA();
    Task.findAndCountAll.mockResolvedValueOnce({ count: 50, rows: [] });

    const res = await request(app)
      .get('/api/v1/tasks?page=2&limit=10')
      .set('Authorization', authHeader('super_admin'));

    expect(res.status).toBe(200);
    // controller returns total (DB count) and pagination meta; count = rows.length
    expect(res.body.total).toBe(50);
    expect(res.body.pagination.page).toBe(2);
    expect(res.body.pagination.limit).toBe(10);
  });

  it('401 — unauthenticated request rejected', async () => {
    const res = await request(app).get('/api/v1/tasks');
    expect(res.status).toBe(401);
  });
});

// ── POST /api/v1/tasks ─────────────────────────────────────────────────────────

describe('POST /api/v1/tasks — create task', () => {
  beforeEach(() => jest.clearAllMocks());

  it('TASK-001 — 201: super_admin creates a task', async () => {
    setupSA();
    // checkPermission auto-resolve: projectId comes from req.body
    Project.findByPk.mockResolvedValueOnce({ id: PRJ_ID, workspaceId: WS_ID }); // auto-resolve
    // controller
    Project.findByPk.mockResolvedValueOnce(buildProject());                       // verify project
    Task.max.mockResolvedValueOnce(5);
    const task = buildTask();
    Task.create.mockResolvedValueOnce(task);

    const res = await request(app)
      .post('/api/v1/tasks')
      .set('Authorization', authHeader('super_admin'))
      .send({ title: 'My Task', projectId: PRJ_ID });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(Task.create).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'My Task', projectId: PRJ_ID, createdBy: mockUsers.super_admin.id })
    );
  });

  it('TASK-001b — 201: workspace owner creates a task', async () => {
    setupOwner();
    // checkPermission: auto-resolve projectId from body → workspace owner bypass
    Project.findByPk.mockResolvedValueOnce({ id: PRJ_ID, workspaceId: WS_ID }); // auto-resolve
    Workspace.findByPk.mockResolvedValueOnce(buildWorkspace(mockUsers.member.id));// resolvePermission
    // controller
    Project.findByPk.mockResolvedValueOnce(buildProject());
    Task.max.mockResolvedValueOnce(0);
    const task = buildTask();
    Task.create.mockResolvedValueOnce(task);

    const res = await request(app)
      .post('/api/v1/tasks')
      .set('Authorization', authHeader('member'))
      .send({ title: 'Owner Task', projectId: PRJ_ID });

    expect(res.status).toBe(201);
  });

  it('TASK-002 — 400: missing title rejected by validator', async () => {
    setupSA();

    const res = await request(app)
      .post('/api/v1/tasks')
      .set('Authorization', authHeader('super_admin'))
      .send({ projectId: PRJ_ID });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('TASK-003 — 400: non-UUID projectId rejected by validator', async () => {
    setupSA();

    const res = await request(app)
      .post('/api/v1/tasks')
      .set('Authorization', authHeader('super_admin'))
      .send({ title: 'Task', projectId: 'not-a-uuid' });

    expect(res.status).toBe(400);
  });

  it('TASK-003b — 404: valid UUID but project does not exist', async () => {
    setupSA();
    Project.findByPk.mockResolvedValueOnce({ id: PRJ_ID, workspaceId: WS_ID }); // auto-resolve
    Project.findByPk.mockResolvedValueOnce(null);                                 // controller: project not found

    const res = await request(app)
      .post('/api/v1/tasks')
      .set('Authorization', authHeader('super_admin'))
      .send({ title: 'Ghost Task', projectId: PRJ_ID });

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/project not found/i);
  });

  it('TASK-004 — 403: user not in workspace cannot create task', async () => {
    setupOwner();
    // checkPermission: not owner, not member
    Project.findByPk.mockResolvedValueOnce({ id: PRJ_ID, workspaceId: WS_ID }); // auto-resolve
    Workspace.findByPk.mockResolvedValueOnce(buildWorkspace('uuid-other-owner'));  // not owner
    WorkspaceMembers.findOne.mockResolvedValueOnce(null);                          // not a member

    const res = await request(app)
      .post('/api/v1/tasks')
      .set('Authorization', authHeader('member'))
      .send({ title: 'Forbidden Task', projectId: PRJ_ID });

    expect(res.status).toBe(403);
  });

  it('TASK-005 — 403: viewer blocked from creating tasks', async () => {
    setupViewer();
    Project.findByPk.mockResolvedValueOnce({ id: PRJ_ID, workspaceId: WS_ID }); // auto-resolve
    Workspace.findByPk.mockResolvedValueOnce(buildWorkspace('uuid-other-owner'));  // not owner
    WorkspaceMembers.findOne.mockResolvedValueOnce({ role: 'viewer', workspaceId: WS_ID, userId: mockUsers.viewer.id });
    ProjectMembers.findOne.mockResolvedValueOnce(null); // no project-level override

    const res = await request(app)
      .post('/api/v1/tasks')
      .set('Authorization', authHeader('viewer'))
      .send({ title: 'Viewer Task', projectId: PRJ_ID });

    expect(res.status).toBe(403);
  });

  it('TASK-007 — 201: past dueDate is accepted (no validation restriction)', async () => {
    setupSA();
    Project.findByPk.mockResolvedValueOnce({ id: PRJ_ID, workspaceId: WS_ID });
    Project.findByPk.mockResolvedValueOnce(buildProject());
    Task.max.mockResolvedValueOnce(0);
    Task.create.mockResolvedValueOnce(buildTask({ dueDate: '2020-01-01' }));

    const res = await request(app)
      .post('/api/v1/tasks')
      .set('Authorization', authHeader('super_admin'))
      .send({ title: 'Overdue Task', projectId: PRJ_ID, dueDate: '2020-01-01' });

    expect(res.status).toBe(201);
  });
});

// ── GET /api/v1/tasks/:id ──────────────────────────────────────────────────────

describe('GET /api/v1/tasks/:id — get task by ID', () => {
  beforeEach(() => jest.clearAllMocks());

  it('TASK-017 — 200: super_admin gets task by ID', async () => {
    setupSA();
    mockPermAutoResolve(); // checkPermission: Project.findByPk(TASK_ID) returns project-like obj
    Task.findByPk.mockResolvedValueOnce(buildTask());

    const res = await request(app)
      .get(`/api/v1/tasks/${TASK_ID}`)
      .set('Authorization', authHeader('super_admin'));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBe(TASK_ID);
  });

  it('TASK-019 — 404: task not found returns 404', async () => {
    setupSA();
    mockPermAutoResolve();
    Task.findByPk.mockResolvedValueOnce(null);

    const res = await request(app)
      .get(`/api/v1/tasks/${TASK_ID}`)
      .set('Authorization', authHeader('super_admin'));

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/task not found/i);
  });

  it('TASK-018 — 403: non-workspace-member cannot get task', async () => {
    setupViewer();
    Project.findByPk.mockResolvedValueOnce({ id: PRJ_ID, workspaceId: WS_ID }); // auto-resolve
    Workspace.findByPk.mockResolvedValueOnce(buildWorkspace('uuid-other-owner'));  // not owner
    WorkspaceMembers.findOne.mockResolvedValueOnce(null);                          // not a member

    const res = await request(app)
      .get(`/api/v1/tasks/${TASK_ID}`)
      .set('Authorization', authHeader('viewer'));

    expect(res.status).toBe(403);
  });

  it('401 — unauthenticated request rejected', async () => {
    const res = await request(app).get(`/api/v1/tasks/${TASK_ID}`);
    expect(res.status).toBe(401);
  });
});

// ── PUT /api/v1/tasks/:id ──────────────────────────────────────────────────────

describe('PUT /api/v1/tasks/:id — update task', () => {
  beforeEach(() => jest.clearAllMocks());

  it('TASK-020 — 200: super_admin updates task title', async () => {
    setupSA();
    mockPermAutoResolve();
    const task = buildTask();
    Task.findByPk.mockResolvedValueOnce(task);

    const res = await request(app)
      .put(`/api/v1/tasks/${TASK_ID}`)
      .set('Authorization', authHeader('super_admin'))
      .send({ title: 'Updated Title' });

    expect(res.status).toBe(200);
    expect(task.update).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Updated Title' })
    );
  });

  it('TASK-021 — 200: super_admin updates task statusId', async () => {
    setupSA();
    mockPermAutoResolve();
    const task = buildTask({ statusId: null });
    Task.findByPk.mockResolvedValueOnce(task);
    // Status name lookups return null (fine — guard handles it)

    const res = await request(app)
      .put(`/api/v1/tasks/${TASK_ID}`)
      .set('Authorization', authHeader('super_admin'))
      .send({ statusId: STATUS_ID });

    expect(res.status).toBe(200);
    expect(task.update).toHaveBeenCalledWith(
      expect.objectContaining({ statusId: STATUS_ID })
    );
  });

  it('TASK-022 — 200: super_admin updates task priority', async () => {
    setupSA();
    mockPermAutoResolve();
    const task = buildTask({ priority: 'low' });
    Task.findByPk.mockResolvedValueOnce(task);

    const res = await request(app)
      .put(`/api/v1/tasks/${TASK_ID}`)
      .set('Authorization', authHeader('super_admin'))
      .send({ priority: 'high' });

    expect(res.status).toBe(200);
    expect(task.update).toHaveBeenCalledWith(
      expect.objectContaining({ priority: 'high' })
    );
  });

  it('TASK-025 — 403: viewer cannot update task', async () => {
    setupViewer();
    Project.findByPk.mockResolvedValueOnce({ id: PRJ_ID, workspaceId: WS_ID });
    Workspace.findByPk.mockResolvedValueOnce(buildWorkspace('uuid-other-owner'));
    WorkspaceMembers.findOne.mockResolvedValueOnce({ role: 'viewer', workspaceId: WS_ID, userId: mockUsers.viewer.id });
    ProjectMembers.findOne.mockResolvedValueOnce(null);

    const res = await request(app)
      .put(`/api/v1/tasks/${TASK_ID}`)
      .set('Authorization', authHeader('viewer'))
      .send({ title: 'Sneaky Update' });

    expect(res.status).toBe(403);
  });

  it('400 — empty title rejected by validator', async () => {
    setupSA();
    mockPermAutoResolve();

    const res = await request(app)
      .put(`/api/v1/tasks/${TASK_ID}`)
      .set('Authorization', authHeader('super_admin'))
      .send({ title: '' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });
});

// ── DELETE /api/v1/tasks/:id ───────────────────────────────────────────────────

describe('DELETE /api/v1/tasks/:id — archive task', () => {
  beforeEach(() => jest.clearAllMocks());

  it('200: super_admin can archive a task', async () => {
    setupSA();
    mockPermAutoResolve();
    const task = buildTask();
    Task.findByPk.mockResolvedValueOnce(task);

    const res = await request(app)
      .delete(`/api/v1/tasks/${TASK_ID}`)
      .set('Authorization', authHeader('super_admin'));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(task.update).toHaveBeenCalledWith({ isArchived: true });
  });

  it('404: task not found returns 404', async () => {
    setupSA();
    mockPermAutoResolve();
    Task.findByPk.mockResolvedValueOnce(null);

    const res = await request(app)
      .delete(`/api/v1/tasks/${TASK_ID}`)
      .set('Authorization', authHeader('super_admin'));

    expect(res.status).toBe(404);
  });
});

// ── POST /api/v1/tasks/bulk ────────────────────────────────────────────────────

describe('POST /api/v1/tasks/bulk — bulk create tasks', () => {
  beforeEach(() => jest.clearAllMocks());

  it('201: super_admin bulk-creates tasks', async () => {
    setupSA();
    // checkPermission: projectId from body tasks[0].projectId — but checkPermission
    // reads req.body.projectId (top-level), which is absent for bulk. workspaceId
    // stays undefined → super_admin bypasses.
    const tasks = [buildTask(), buildTask({ id: '00000000-0000-4000-8000-000000000009', title: 'Task 2' })];
    Task.bulkCreate.mockResolvedValueOnce(tasks);

    const res = await request(app)
      .post('/api/v1/tasks/bulk')
      .set('Authorization', authHeader('super_admin'))
      .send({
        tasks: [
          { title: 'Task 1', projectId: PRJ_ID },
          { title: 'Task 2', projectId: PRJ_ID },
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body.count).toBe(2);
  });

  it('TASK-041 — 400: empty tasks array rejected by validator', async () => {
    setupSA();

    const res = await request(app)
      .post('/api/v1/tasks/bulk')
      .set('Authorization', authHeader('super_admin'))
      .send({ tasks: [] });

    expect(res.status).toBe(400);
  });
});

// ── POST /api/v1/tasks/:taskId/subtasks ────────────────────────────────────────

describe('POST /api/v1/tasks/:taskId/subtasks — create subtask', () => {
  beforeEach(() => jest.clearAllMocks());

  it('TASK-028 — 201: super_admin creates a subtask', async () => {
    setupSA();
    // checkPermission uses req.params.taskId as projectId candidate
    Project.findByPk.mockResolvedValueOnce({ id: PRJ_ID, workspaceId: WS_ID }); // auto-resolve
    // controller
    Task.findByPk.mockResolvedValueOnce(buildTask());
    Subtask.max.mockResolvedValueOnce(0);
    const subtask = buildSubtask();
    Subtask.create.mockResolvedValueOnce(subtask);

    const res = await request(app)
      .post(`/api/v1/tasks/${TASK_ID}/subtasks`)
      .set('Authorization', authHeader('super_admin'))
      .send({ title: 'A Subtask' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(Subtask.create).toHaveBeenCalledWith(
      expect.objectContaining({ taskId: TASK_ID, title: 'A Subtask', isCompleted: false })
    );
  });

  it('400: missing subtask title rejected by validator', async () => {
    setupSA();
    Project.findByPk.mockResolvedValueOnce({ id: PRJ_ID, workspaceId: WS_ID });

    const res = await request(app)
      .post(`/api/v1/tasks/${TASK_ID}/subtasks`)
      .set('Authorization', authHeader('super_admin'))
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });
});

// ── TASK-006: Commenter blocked from creating tasks ────────────────────────────

describe('POST /api/v1/tasks — commenter permission check', () => {
  beforeEach(() => jest.clearAllMocks());

  it('TASK-006 — 403: commenter workspace role cannot create tasks', async () => {
    setupOwner(); // authenticates as 'member' system role
    Project.findByPk.mockResolvedValueOnce({ id: PRJ_ID, workspaceId: WS_ID }); // auto-resolve
    Workspace.findByPk.mockResolvedValueOnce({ id: WS_ID, ownerId: 'uuid-other-owner', isActive: true }); // not owner
    WorkspaceMembers.findOne.mockResolvedValueOnce({ role: 'commenter', workspaceId: WS_ID, userId: mockUsers.member.id });
    ProjectMembers.findOne.mockResolvedValueOnce(null); // no project-level override

    const res = await request(app)
      .post('/api/v1/tasks')
      .set('Authorization', authHeader('member'))
      .send({ title: 'Commenter Task', projectId: PRJ_ID });

    expect(res.status).toBe(403);
  });
});

// ── TASK-012 to TASK-016: List filters ────────────────────────────────────────

describe('GET /api/v1/tasks — list filters and sorting', () => {
  beforeEach(() => jest.clearAllMocks());

  it('TASK-012 — 200: status filter returns filtered tasks', async () => {
    setupSA();
    Task.findAndCountAll.mockResolvedValueOnce({ count: 1, rows: [buildTask()] });

    const res = await request(app)
      .get('/api/v1/tasks?status=in_progress')
      .set('Authorization', authHeader('super_admin'));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('TASK-013 — 200: priority filter returns filtered tasks', async () => {
    setupSA();
    Task.findAndCountAll.mockResolvedValueOnce({ count: 2, rows: [buildTask({ priority: 'high' }), buildTask({ id: '00000000-0000-4000-8000-000000000099', priority: 'high' })] });

    const res = await request(app)
      .get('/api/v1/tasks?priority=high')
      .set('Authorization', authHeader('super_admin'));

    expect(res.status).toBe(200);
    expect(res.body.count).toBe(2);
  });

  it('TASK-014 — 200: assignee filter returns tasks for that user', async () => {
    setupSA();
    Task.findAndCountAll.mockResolvedValueOnce({ count: 1, rows: [buildTask()] });

    const res = await request(app)
      .get(`/api/v1/tasks?assignee=${mockUsers.member.id}`)
      .set('Authorization', authHeader('super_admin'));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('TASK-016 — 200: sort by dueDate returns 200', async () => {
    setupSA();
    Task.findAndCountAll.mockResolvedValueOnce({ count: 1, rows: [buildTask({ dueDate: '2026-04-01' })] });

    const res = await request(app)
      .get('/api/v1/tasks?sort=dueDate&order=asc')
      .set('Authorization', authHeader('super_admin'));

    expect(res.status).toBe(200);
  });
});

// ── TASK-023 to TASK-024: Update dueDate ──────────────────────────────────────

describe('PUT /api/v1/tasks/:id — dueDate updates', () => {
  beforeEach(() => jest.clearAllMocks());

  it('TASK-023 — 200: super_admin sets dueDate on a task', async () => {
    setupSA();
    mockPermAutoResolve();
    const task = buildTask({ dueDate: null });
    Task.findByPk.mockResolvedValueOnce(task);

    const res = await request(app)
      .put(`/api/v1/tasks/${TASK_ID}`)
      .set('Authorization', authHeader('super_admin'))
      .send({ dueDate: '2026-06-30' });

    expect(res.status).toBe(200);
    expect(task.update).toHaveBeenCalledWith(
      expect.objectContaining({ dueDate: '2026-06-30' })
    );
  });

  it('TASK-024 — 200: super_admin clears dueDate (set to null)', async () => {
    setupSA();
    mockPermAutoResolve();
    const task = buildTask({ dueDate: '2026-04-01' });
    Task.findByPk.mockResolvedValueOnce(task);

    const res = await request(app)
      .put(`/api/v1/tasks/${TASK_ID}`)
      .set('Authorization', authHeader('super_admin'))
      .send({ dueDate: null });

    expect(res.status).toBe(200);
    expect(task.update).toHaveBeenCalledWith(
      expect.objectContaining({ dueDate: null })
    );
  });
});

// ── TASK-026 to TASK-027: Update assignees ─────────────────────────────────────

describe('PUT /api/v1/tasks/:id — assignee updates', () => {
  beforeEach(() => jest.clearAllMocks());

  it('TASK-026 — 200: super_admin updates task assignees', async () => {
    setupSA();
    mockPermAutoResolve();
    const task = buildTask();
    Task.findByPk.mockResolvedValueOnce(task);
    // destroy old assignees (returns undefined — fine)
    // find valid user IDs
    User.findAll.mockResolvedValueOnce([{ id: mockUsers.member.id }]);
    // bulkCreate new assignees (returns undefined — fine)
    // findAll for change tracking
    TaskAssignees.findAll.mockResolvedValueOnce([{ user_id: mockUsers.member.id }]);

    const res = await request(app)
      .put(`/api/v1/tasks/${TASK_ID}`)
      .set('Authorization', authHeader('super_admin'))
      .send({ assigneeIds: [mockUsers.member.id] });

    expect(res.status).toBe(200);
    expect(User.findAll).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: [mockUsers.member.id] } })
    );
    expect(TaskAssignees.bulkCreate).toHaveBeenCalled();
  });

  it('TASK-027 — 200: super_admin removes all assignees (empty array)', async () => {
    setupSA();
    mockPermAutoResolve();
    const task = buildTask();
    Task.findByPk.mockResolvedValueOnce(task);
    // destroy existing assignees (returns undefined — fine)
    // assigneeIds is [], skip bulkCreate
    // findAll for change tracking
    TaskAssignees.findAll.mockResolvedValueOnce([]);

    const res = await request(app)
      .put(`/api/v1/tasks/${TASK_ID}`)
      .set('Authorization', authHeader('super_admin'))
      .send({ assigneeIds: [] });

    expect(res.status).toBe(200);
    expect(TaskAssignees.destroy).toHaveBeenCalled();
  });
});
