/**
 * Time Tracking endpoint tests
 * Runner : Jest + Supertest
 * DB     : Fully mocked — no real Postgres
 *
 * Endpoints covered (13 scenarios):
 *   GET    /api/v1/time-logs             (TIME-001, TIME-002)
 *   GET    /api/v1/time-logs/statistics  (TIME-003)
 *   POST   /api/v1/time-logs             (TIME-004, TIME-005, TIME-006, TIME-007)
 *   PUT    /api/v1/time-logs/:id         (TIME-008, TIME-009, TIME-010)
 *   DELETE /api/v1/time-logs/:id         (TIME-011, TIME-012, TIME-013)
 */

// ── Constants ─────────────────────────────────────────────────────────────────

const TIMELOG_ID = '00000000-0000-4000-8000-000000000050';
const TASK_ID    = '00000000-0000-4000-8000-000000000003';

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
  TimeLog:        { findAll: jest.fn(), findByPk: jest.fn(), create: jest.fn(), sum: jest.fn(), findAndCountAll: jest.fn() },
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
    literal: jest.fn((s) => s),
    fn:  jest.fn((...args) => args),
    col: jest.fn((c) => c),
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

// Mock activityLog controller used inside createTimeLog
jest.mock('../controllers/activityLog.controller', () => ({
  getActivityLogs:    jest.fn(),
  exportActivityLogs: jest.fn(),
  createActivityLog:  jest.fn().mockResolvedValue(undefined),
}));

// ── Dependencies ──────────────────────────────────────────────────────────────

const request = require('supertest');
const app     = require('../app');
const { User, Task, TimeLog } = require('../models');
const { authHeader, mockUsers } = require('./helpers/jwt');

// ── Builders ──────────────────────────────────────────────────────────────────

const buildUser = (overrides = {}) => ({
  ...mockUsers.super_admin,
  planId: 'pro',
  update: jest.fn().mockResolvedValue(true),
  toJSON: jest.fn().mockReturnThis(),
  ...overrides,
});

const buildTimeLog = (overrides = {}) => ({
  id:          TIMELOG_ID,
  taskId:      TASK_ID,
  userId:      mockUsers.super_admin.id,
  hours:       2.5,
  description: 'Feature development',
  loggedDate:  new Date().toISOString(),
  isBillable:  false,
  update:      jest.fn().mockResolvedValue(true),
  destroy:     jest.fn().mockResolvedValue(true),
  toJSON:      jest.fn().mockReturnThis(),
  ...overrides,
});

const setupSA = () => {
  const sa = buildUser();
  User.findByPk.mockResolvedValueOnce(sa);
  return sa;
};

// ── GET /api/v1/time-logs ─────────────────────────────────────────────────────

describe('GET /api/v1/time-logs — list time logs', () => {
  beforeEach(() => jest.clearAllMocks());

  it('TIME-001 — 200: returns time logs list', async () => {
    setupSA();
    const tl = buildTimeLog();
    TimeLog.findAndCountAll.mockResolvedValueOnce({ count: 1, rows: [tl] });

    const res = await request(app)
      .get('/api/v1/time-logs')
      .set('Authorization', authHeader('super_admin'));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('TIME-002 — 200: taskId filter narrows results', async () => {
    setupSA();
    TimeLog.findAndCountAll.mockResolvedValueOnce({ count: 0, rows: [] });

    const res = await request(app)
      .get(`/api/v1/time-logs?taskId=${TASK_ID}`)
      .set('Authorization', authHeader('super_admin'));

    expect(res.status).toBe(200);
    expect(TimeLog.findAndCountAll).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ taskId: TASK_ID }),
      })
    );
  });

  it('401 — unauthenticated request rejected', async () => {
    const res = await request(app).get('/api/v1/time-logs');
    expect(res.status).toBe(401);
  });
});

// ── GET /api/v1/time-logs/statistics ──────────────────────────────────────────

describe('GET /api/v1/time-logs/statistics — time statistics', () => {
  beforeEach(() => jest.clearAllMocks());

  it('TIME-003 — 200: returns statistics object', async () => {
    setupSA();
    // getTimeStatistics calls TimeLog.findAll and TimeLog.sum
    TimeLog.findAll.mockResolvedValueOnce([]);
    TimeLog.sum.mockResolvedValueOnce(10);

    const res = await request(app)
      .get('/api/v1/time-logs/statistics')
      .set('Authorization', authHeader('super_admin'));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

// ── POST /api/v1/time-logs ────────────────────────────────────────────────────

describe('POST /api/v1/time-logs — create time log', () => {
  beforeEach(() => jest.clearAllMocks());

  it('TIME-004 — 201: creates time log with hours', async () => {
    setupSA();
    Task.findByPk.mockResolvedValueOnce({ id: TASK_ID, projectId: 'prj-01' });
    const tl = buildTimeLog();
    TimeLog.create.mockResolvedValueOnce(tl);
    ActivityLog_mock_noop();

    const res = await request(app)
      .post('/api/v1/time-logs')
      .set('Authorization', authHeader('super_admin'))
      .send({ taskId: TASK_ID, hours: 2, description: 'Feature dev' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(TimeLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ taskId: TASK_ID, hours: 2 })
    );
  });

  it('TIME-005 — 201: creates time log with minutes', async () => {
    setupSA();
    Task.findByPk.mockResolvedValueOnce({ id: TASK_ID });
    const tl = buildTimeLog({ hours: 0.5 });
    TimeLog.create.mockResolvedValueOnce(tl);

    const res = await request(app)
      .post('/api/v1/time-logs')
      .set('Authorization', authHeader('super_admin'))
      .send({ taskId: TASK_ID, minutes: 30 });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
  });

  it('TIME-006 — 400: missing taskId rejected by validator', async () => {
    setupSA();

    const res = await request(app)
      .post('/api/v1/time-logs')
      .set('Authorization', authHeader('super_admin'))
      .send({ hours: 2 });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('TIME-007 — 404: unknown taskId returns 404', async () => {
    setupSA();
    Task.findByPk.mockResolvedValueOnce(null);

    const res = await request(app)
      .post('/api/v1/time-logs')
      .set('Authorization', authHeader('super_admin'))
      .send({ taskId: TASK_ID, hours: 1 });

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  it('401 — unauthenticated request rejected', async () => {
    const res = await request(app)
      .post('/api/v1/time-logs')
      .send({ taskId: TASK_ID, hours: 1 });

    expect(res.status).toBe(401);
  });
});

// Helper — ActivityLog mock is already set up via jest.mock above; no-op here
function ActivityLog_mock_noop() {}

// ── PUT /api/v1/time-logs/:id ─────────────────────────────────────────────────

describe('PUT /api/v1/time-logs/:id — update time log', () => {
  beforeEach(() => jest.clearAllMocks());

  it('TIME-008 — 200: owner updates own time log', async () => {
    setupSA();
    const tl = buildTimeLog({ userId: mockUsers.super_admin.id });
    TimeLog.findByPk.mockResolvedValueOnce(tl);

    const res = await request(app)
      .put(`/api/v1/time-logs/${TIMELOG_ID}`)
      .set('Authorization', authHeader('super_admin'))
      .send({ hours: 3, description: 'Updated' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(tl.update).toHaveBeenCalledWith(
      expect.objectContaining({ hours: 3 })
    );
  });

  it('TIME-009 — 403: non-owner cannot update another user\'s log', async () => {
    const member = buildUser({ ...mockUsers.member });
    User.findByPk.mockResolvedValueOnce(member);
    // timelog belongs to super_admin, not member
    const tl = buildTimeLog({ userId: 'someone-else' });
    TimeLog.findByPk.mockResolvedValueOnce(tl);

    const res = await request(app)
      .put(`/api/v1/time-logs/${TIMELOG_ID}`)
      .set('Authorization', authHeader('member'))
      .send({ hours: 3 });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  it('TIME-010 — 404: updating unknown time log returns 404', async () => {
    setupSA();
    TimeLog.findByPk.mockResolvedValueOnce(null);

    const res = await request(app)
      .put(`/api/v1/time-logs/${TIMELOG_ID}`)
      .set('Authorization', authHeader('super_admin'))
      .send({ hours: 3 });

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });
});

// ── DELETE /api/v1/time-logs/:id ──────────────────────────────────────────────

describe('DELETE /api/v1/time-logs/:id — delete time log', () => {
  beforeEach(() => jest.clearAllMocks());

  it('TIME-011 — 200: owner deletes own time log', async () => {
    setupSA();
    const tl = buildTimeLog({ userId: mockUsers.super_admin.id });
    TimeLog.findByPk.mockResolvedValueOnce(tl);

    const res = await request(app)
      .delete(`/api/v1/time-logs/${TIMELOG_ID}`)
      .set('Authorization', authHeader('super_admin'));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(tl.destroy).toHaveBeenCalled();
  });

  it('TIME-012 — 403: non-owner cannot delete another user\'s log', async () => {
    const member = buildUser({ ...mockUsers.member });
    User.findByPk.mockResolvedValueOnce(member);
    const tl = buildTimeLog({ userId: 'someone-else' });
    TimeLog.findByPk.mockResolvedValueOnce(tl);

    const res = await request(app)
      .delete(`/api/v1/time-logs/${TIMELOG_ID}`)
      .set('Authorization', authHeader('member'));

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  it('TIME-013 — 404: deleting unknown time log returns 404', async () => {
    setupSA();
    TimeLog.findByPk.mockResolvedValueOnce(null);

    const res = await request(app)
      .delete(`/api/v1/time-logs/${TIMELOG_ID}`)
      .set('Authorization', authHeader('super_admin'));

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });
});
