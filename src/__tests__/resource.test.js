/**
 * Resource endpoint tests
 * Runner : Jest + Supertest
 * DB     : Fully mocked — no real Postgres
 *
 * Endpoints covered (8 scenarios):
 *   GET  /api/v1/resources/workload  (RES-001–004)
 *   POST /api/v1/resources           (RES-005–008)
 */

// ── Constants ─────────────────────────────────────────────────────────────────

const WS_ID   = '00000000-0000-4000-8000-000000000001';
const USER_ID = '00000000-0000-4000-8000-000000000099';

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

jest.mock('../controllers/activityLog.controller', () => ({
  getActivityLogs:    jest.fn(),
  exportActivityLogs: jest.fn(),
  createActivityLog:  jest.fn().mockResolvedValue(undefined),
}));

// ── Dependencies ──────────────────────────────────────────────────────────────

const request = require('supertest');
const app     = require('../app');
const { User, Resource, Task, TimeLog } = require('../models');
const { authHeader, mockUsers } = require('./helpers/jwt');

// ── Builders ──────────────────────────────────────────────────────────────────

const buildUser = (overrides = {}) => ({
  ...mockUsers.super_admin,
  planId: 'pro',
  update: jest.fn().mockResolvedValue(true),
  toJSON: jest.fn().mockReturnThis(),
  ...overrides,
});

const buildResource = (overrides = {}) => ({
  id:            '00000000-0000-4000-8000-000000000060',
  userId:        USER_ID,
  workspaceId:   WS_ID,
  capacityHours: 40,
  availability:  'available',
  skills:        [],
  hourlyRate:    null,
  user:          { id: USER_ID, firstName: 'Test', lastName: 'User', email: 'test@example.com', avatar: null },
  workspace:     { id: WS_ID, name: 'Test WS' },
  update:        jest.fn().mockResolvedValue(true),
  toJSON:        jest.fn().mockReturnThis(),
  ...overrides,
});

const setupSA = () => {
  const sa = buildUser();
  User.findByPk.mockResolvedValueOnce(sa);
  return sa;
};

// ── GET /api/v1/resources/workload ────────────────────────────────────────────

describe('GET /api/v1/resources/workload — get workload data', () => {
  beforeEach(() => jest.clearAllMocks());

  it('RES-001 — 200: returns empty workload when no resources exist', async () => {
    setupSA();
    Resource.findAll.mockResolvedValueOnce([]);  // no resources → no per-resource queries

    const res = await request(app)
      .get('/api/v1/resources/workload')
      .set('Authorization', authHeader('super_admin'));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.resources).toEqual([]);
    expect(res.body.data.totalResources).toBe(0);
  });

  it('RES-002 — 200: returns workload with utilization for a resource', async () => {
    setupSA();
    const resource = buildResource();
    Resource.findAll.mockResolvedValueOnce([resource]);
    // Per-resource queries: Task.findAll + TimeLog.findAll
    Task.findAll.mockResolvedValueOnce([]);
    TimeLog.findAll.mockResolvedValueOnce([]);

    const res = await request(app)
      .get('/api/v1/resources/workload')
      .set('Authorization', authHeader('super_admin'));

    expect(res.status).toBe(200);
    expect(res.body.data.totalResources).toBe(1);
    expect(res.body.data.resources[0].utilization).toBe(0);
  });

  it('RES-003 — 200: workspaceId filter applied', async () => {
    setupSA();
    Resource.findAll.mockResolvedValueOnce([]);

    const res = await request(app)
      .get(`/api/v1/resources/workload?workspaceId=${WS_ID}`)
      .set('Authorization', authHeader('super_admin'));

    expect(res.status).toBe(200);
    expect(Resource.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ workspaceId: WS_ID }),
      })
    );
  });

  it('RES-004 — 401: unauthenticated request rejected', async () => {
    const res = await request(app).get('/api/v1/resources/workload');
    expect(res.status).toBe(401);
  });
});

// ── POST /api/v1/resources ────────────────────────────────────────────────────

describe('POST /api/v1/resources — create or update resource', () => {
  beforeEach(() => jest.clearAllMocks());

  it('RES-005 — 200: admin creates a new resource', async () => {
    setupSA();
    Resource.findOne.mockResolvedValueOnce(null);  // doesn't exist yet
    const resource = buildResource();
    Resource.create.mockResolvedValueOnce(resource);

    const res = await request(app)
      .post('/api/v1/resources')
      .set('Authorization', authHeader('super_admin'))
      .send({ userId: USER_ID, workspaceId: WS_ID, capacityHours: 40 });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Resource.create).toHaveBeenCalledWith(
      expect.objectContaining({ userId: USER_ID })
    );
  });

  it('RES-006 — 200: updating an existing resource', async () => {
    setupSA();
    const resource = buildResource();
    Resource.findOne.mockResolvedValueOnce(resource);  // exists → update

    const res = await request(app)
      .post('/api/v1/resources')
      .set('Authorization', authHeader('super_admin'))
      .send({ userId: USER_ID, workspaceId: WS_ID, capacityHours: 30 });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(resource.update).toHaveBeenCalled();
    expect(Resource.create).not.toHaveBeenCalled();
  });

  it('RES-007 — 400: missing userId returns 400', async () => {
    setupSA();

    const res = await request(app)
      .post('/api/v1/resources')
      .set('Authorization', authHeader('super_admin'))
      .send({ workspaceId: WS_ID });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('RES-008 — 403: regular member blocked by authorize middleware', async () => {
    const member = buildUser({ ...mockUsers.member });
    User.findByPk.mockResolvedValueOnce(member);

    const res = await request(app)
      .post('/api/v1/resources')
      .set('Authorization', authHeader('member'))
      .send({ userId: USER_ID });

    expect(res.status).toBe(403);
  });
});
