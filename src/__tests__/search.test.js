/**
 * Search endpoint tests
 * Runner : Jest + Supertest
 * DB     : Fully mocked — no real Postgres
 *
 * Endpoints covered:
 *   GET /api/v1/search  — global search
 *
 * Scenarios: SRCH-001 through SRCH-010
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
    max: jest.fn(), bulkCreate: jest.fn(),
  },
  Subtask:     { findAll: jest.fn(), findByPk: jest.fn(), create: jest.fn(), max: jest.fn() },
  Status:      { findAll: jest.fn(), findByPk: jest.fn() },
  List:        { findAll: jest.fn(), findByPk: jest.fn() },
  Notification: {
    findAll: jest.fn(), findByPk: jest.fn(), findOne: jest.fn(),
    findAndCountAll: jest.fn(), create: jest.fn(),
    update: jest.fn(), count: jest.fn(), destroy: jest.fn(),
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
    query: jest.fn(), Op: { iLike: Symbol('iLike'), in: Symbol('in'), or: Symbol('or') },
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

jest.mock('../utils/automationEngine', () => ({
  runAutomations: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../controllers/notification.controller', () => ({
  createNotification:     jest.fn().mockResolvedValue({ id: 'notif-uuid' }),
  getNotifications:       jest.fn(),
  getUnreadCount:         jest.fn(),
  markAllAsRead:          jest.fn(),
  markAsRead:             jest.fn(),
  clearReadNotifications: jest.fn(),
  deleteNotification:     jest.fn(),
}));

// ── Dependencies ──────────────────────────────────────────────────────────────

const request = require('supertest');
const app     = require('../app');
const { User, WorkspaceMembers, Workspace, Project, Task } = require('../models');
const { authHeader, mockUsers } = require('./helpers/jwt');

// ── Builders ──────────────────────────────────────────────────────────────────

const buildUser = (overrides = {}) => ({
  ...mockUsers.super_admin,
  planId: 'pro',
  update: jest.fn().mockResolvedValue(true),
  toJSON: jest.fn().mockReturnThis(),
  ...overrides,
});

const setupSA = () => {
  const sa = buildUser();
  User.findByPk.mockResolvedValueOnce(sa);
  return sa;
};

const setupMember = () => {
  const user = buildUser({ ...mockUsers.member });
  User.findByPk.mockResolvedValueOnce(user);
  return user;
};

// Helper to mock super_admin search (no workspace scope queries)
// SA calls: Task.findAll, Project.findAll, Workspace.findAll, User.findAll
const mockSASearch = () => {
  Task.findAll.mockResolvedValueOnce([]);
  Project.findAll.mockResolvedValueOnce([]);
  Workspace.findAll.mockResolvedValueOnce([]);
  User.findAll.mockResolvedValueOnce([]);
};

// Helper to mock member search (workspace scope queries first)
const mockMemberSearch = () => {
  WorkspaceMembers.findAll.mockResolvedValueOnce([{ workspaceId: WS_ID }]);
  Workspace.findAll.mockResolvedValueOnce([{ id: WS_ID }]);
  // tasks path: Project.findAll to get accessible project IDs
  Project.findAll.mockResolvedValueOnce([{ id: PRJ_ID }]);
  Task.findAll.mockResolvedValueOnce([]);
  // projects path
  Project.findAll.mockResolvedValueOnce([]);
  // workspaces path
  Workspace.findAll.mockResolvedValueOnce([]);
  // users path
  User.findAll.mockResolvedValueOnce([]);
};

// ── GET /api/v1/search ────────────────────────────────────────────────────────

describe('GET /api/v1/search — global search', () => {
  beforeEach(() => jest.clearAllMocks());

  it('SRCH-001 — 200: super_admin returns results across all types', async () => {
    setupSA();
    mockSASearch();

    const res = await request(app)
      .get('/api/v1/search?q=test')
      .set('Authorization', authHeader('super_admin'));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeDefined();
    expect(res.body.data.tasks).toBeInstanceOf(Array);
    expect(res.body.data.projects).toBeInstanceOf(Array);
    expect(res.body.data.workspaces).toBeInstanceOf(Array);
    expect(res.body.data.users).toBeInstanceOf(Array);
  });

  it('SRCH-002 — 400: missing query parameter', async () => {
    setupSA();

    const res = await request(app)
      .get('/api/v1/search')
      .set('Authorization', authHeader('super_admin'));

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/2 characters/i);
  });

  it('SRCH-003 — 400: single-character query too short', async () => {
    setupSA();

    const res = await request(app)
      .get('/api/v1/search?q=a')
      .set('Authorization', authHeader('super_admin'));

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('SRCH-004 — 200: member search scoped to their workspaces', async () => {
    setupMember();
    mockMemberSearch();

    const res = await request(app)
      .get('/api/v1/search?q=sprint')
      .set('Authorization', authHeader('member'));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    // Member's workspace scope lookup is called
    expect(WorkspaceMembers.findAll).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ userId: mockUsers.member.id }) })
    );
  });

  it('SRCH-005 — 200: types=tasks filter limits search to tasks only', async () => {
    setupSA();
    Task.findAll.mockResolvedValueOnce([]);  // only tasks queried

    const res = await request(app)
      .get('/api/v1/search?q=deploy&types=tasks')
      .set('Authorization', authHeader('super_admin'));

    expect(res.status).toBe(200);
    expect(res.body.data.tasks).toBeInstanceOf(Array);
    // projects/workspaces/users not queried when types=tasks
    expect(Project.findAll).not.toHaveBeenCalled();
  });

  it('SRCH-006 — 200: workspaceId filter applied for super_admin', async () => {
    setupSA();
    Task.findAll.mockResolvedValueOnce([]);
    Project.findAll.mockResolvedValueOnce([]);
    Workspace.findAll.mockResolvedValueOnce([]);
    User.findAll.mockResolvedValueOnce([]);

    const res = await request(app)
      .get(`/api/v1/search?q=test&workspaceId=${WS_ID}`)
      .set('Authorization', authHeader('super_admin'));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('SRCH-007 — 200: member with no workspaces returns empty results', async () => {
    setupMember();
    // Member has no workspace memberships and no owned workspaces
    WorkspaceMembers.findAll.mockResolvedValueOnce([]);
    Workspace.findAll.mockResolvedValueOnce([]);
    // No accessible workspaces → tasks skipped
    // projects path (no accessible workspaceIds → empty)
    Project.findAll.mockResolvedValueOnce([]);
    // workspaces path
    Workspace.findAll.mockResolvedValueOnce([]);
    // users path
    User.findAll.mockResolvedValueOnce([]);

    const res = await request(app)
      .get('/api/v1/search?q=test')
      .set('Authorization', authHeader('member'));

    expect(res.status).toBe(200);
    expect(res.body.data.tasks).toEqual([]);
  });

  it('SRCH-008 — 200: whitespace-only query trimmed → 400', async () => {
    setupSA();

    const res = await request(app)
      .get('/api/v1/search?q=  ')
      .set('Authorization', authHeader('super_admin'));

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('SRCH-009 — 200: types=projects,workspaces only queries those types', async () => {
    setupSA();
    Project.findAll.mockResolvedValueOnce([]);
    Workspace.findAll.mockResolvedValueOnce([]);

    const res = await request(app)
      .get('/api/v1/search?q=design&types=projects,workspaces')
      .set('Authorization', authHeader('super_admin'));

    expect(res.status).toBe(200);
    expect(Task.findAll).not.toHaveBeenCalled();
    expect(User.findAll).not.toHaveBeenCalled();
  });

  it('SRCH-010 — 401: unauthenticated request rejected', async () => {
    const res = await request(app).get('/api/v1/search?q=test');
    expect(res.status).toBe(401);
  });
});
