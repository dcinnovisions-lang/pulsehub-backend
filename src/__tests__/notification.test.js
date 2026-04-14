/**
 * Notification endpoint tests
 * Runner : Jest + Supertest
 * DB     : Fully mocked — no real Postgres
 *
 * Endpoints covered:
 *   GET    /api/v1/notifications                    (NOTIF-007, NOTIF-013, NOTIF-019)
 *   GET    /api/v1/notifications/unread-count       (NOTIF-011)
 *   PUT    /api/v1/notifications/read-all           (NOTIF-010)
 *   PUT    /api/v1/notifications/:id/read           (NOTIF-009)
 *   DELETE /api/v1/notifications/:id               (NOTIF-012)
 *   DELETE /api/v1/notifications                   (clear read)
 *
 * Notes:
 *   - NOTIF-001 through -006, -008, -014–-018, -020 are triggered by other
 *     controllers (createNotification helper). Covered indirectly via comment
 *     and task tests where createNotification is mocked.
 */

// ── Constants ─────────────────────────────────────────────────────────────────

const NOTIF_ID = '00000000-0000-4000-8000-000000000010';

// ── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../models', () => ({
  User:        { findAll: jest.fn(), findByPk: jest.fn(), findOne: jest.fn() },
  Workspace:   {
    findAll: jest.fn(), findByPk: jest.fn(), findOne: jest.fn(), create: jest.fn(), count: jest.fn(),
    unscoped: jest.fn(() => ({ findAll: jest.fn(), findByPk: jest.fn(), create: jest.fn(), count: jest.fn() })),
  },
  WorkspaceMembers: { findOne: jest.fn(), findAll: jest.fn() },
  ProjectMembers:   { findOne: jest.fn(), findAll: jest.fn() },
  GuestAccess:      { findOne: jest.fn() },
  Project:     { findAll: jest.fn(), findByPk: jest.fn(), findOne: jest.fn(), create: jest.fn() },
  Task:        { findAll: jest.fn(), findByPk: jest.fn(), findOne: jest.fn(), create: jest.fn(), max: jest.fn() },
  Subtask:     { findAll: jest.fn(), findByPk: jest.fn(), create: jest.fn(), max: jest.fn() },
  Status:      { findAll: jest.fn(), findByPk: jest.fn() },
  List:        { findAll: jest.fn(), findByPk: jest.fn() },
  Notification: {
    findAll: jest.fn(), findByPk: jest.fn(), findOne: jest.fn(),
    findAndCountAll: jest.fn(), create: jest.fn(),
    update: jest.fn(), count: jest.fn(), destroy: jest.fn()
  },
  ActivityLog: { findAll: jest.fn(), findAndCountAll: jest.fn(), create: jest.fn() },
  Invite:      { findAll: jest.fn(), findByPk: jest.fn(), findOne: jest.fn(), create: jest.fn(), destroy: jest.fn() },
  Comment:     { findAll: jest.fn(), findByPk: jest.fn(), findAndCountAll: jest.fn(), create: jest.fn() },
  Attachment:  { findAll: jest.fn(), findByPk: jest.fn(), create: jest.fn() },
  TimeLog:     { findAll: jest.fn(), findByPk: jest.fn(), create: jest.fn(), sum: jest.fn() },
  Budget:      { findAll: jest.fn(), findByPk: jest.fn(), create: jest.fn(), findOne: jest.fn() },
  BudgetExpense:  { findAll: jest.fn(), findByPk: jest.fn(), create: jest.fn() },
  SavedView:      { findAll: jest.fn(), findByPk: jest.fn(), create: jest.fn(), findOne: jest.fn() },
  ChatRoom:       { findAll: jest.fn(), findByPk: jest.fn(), create: jest.fn(), findOne: jest.fn() },
  ChatMessage:    { findAll: jest.fn(), findByPk: jest.fn(), create: jest.fn() },
  Resource:       { findAll: jest.fn(), findByPk: jest.fn(), create: jest.fn(), findOne: jest.fn() },
  TaskAssignees:  { findAll: jest.fn(), findOne: jest.fn(), create: jest.fn(), destroy: jest.fn() },
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

// ── Dependencies ──────────────────────────────────────────────────────────────

const request = require('supertest');
const app     = require('../app');
const { User, Notification } = require('../models');
const { authHeader, mockUsers } = require('./helpers/jwt');

// ── Builders ──────────────────────────────────────────────────────────────────

const buildUser = (overrides = {}) => ({
  ...mockUsers.super_admin,
  planId: 'pro',
  update: jest.fn().mockResolvedValue(true),
  toJSON: jest.fn().mockReturnThis(),
  ...overrides,
});

const buildNotif = (overrides = {}) => ({
  id: NOTIF_ID,
  userId: mockUsers.super_admin.id,
  type: 'task_assigned',
  title: 'Task assigned to you',
  body: 'You have been assigned "Build tests"',
  entityType: 'task',
  entityId: '00000000-0000-4000-8000-000000000003',
  isRead: false,
  createdAt: new Date().toISOString(),
  toJSON: jest.fn().mockReturnThis(),
  update:  jest.fn().mockResolvedValue(true),
  destroy: jest.fn().mockResolvedValue(true),
  ...overrides,
});

const setupSA = () => {
  const sa = buildUser();
  User.findByPk.mockResolvedValueOnce(sa);
  return sa;
};

// ── GET /api/v1/notifications ─────────────────────────────────────────────────

describe('GET /api/v1/notifications — list notifications', () => {
  beforeEach(() => jest.clearAllMocks());

  it('NOTIF-007 — 200: returns own notifications', async () => {
    setupSA();
    const notif = buildNotif();
    Notification.findAndCountAll.mockResolvedValueOnce({ count: 1, rows: [notif] });
    Notification.count.mockResolvedValueOnce(1);  // unreadCount

    const res = await request(app)
      .get('/api/v1/notifications')
      .set('Authorization', authHeader('super_admin'));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.count).toBe(1);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.unreadCount).toBe(1);
  });

  it('NOTIF-013 — 200: pagination meta returned', async () => {
    setupSA();
    Notification.findAndCountAll.mockResolvedValueOnce({ count: 30, rows: [] });
    Notification.count.mockResolvedValueOnce(5);

    const res = await request(app)
      .get('/api/v1/notifications?page=2&limit=10')
      .set('Authorization', authHeader('super_admin'));

    expect(res.status).toBe(200);
    expect(res.body.page).toBe(2);
    expect(res.body.totalPages).toBe(3);
  });

  it('NOTIF-019 — 200: unreadOnly filter applied', async () => {
    setupSA();
    Notification.findAndCountAll.mockResolvedValueOnce({ count: 2, rows: [] });
    Notification.count.mockResolvedValueOnce(2);

    const res = await request(app)
      .get('/api/v1/notifications?unreadOnly=true')
      .set('Authorization', authHeader('super_admin'));

    expect(res.status).toBe(200);
    // Verify findAndCountAll was called with isRead: false in where clause
    expect(Notification.findAndCountAll).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ isRead: false }),
      })
    );
  });

  it('401 — unauthenticated request rejected', async () => {
    const res = await request(app).get('/api/v1/notifications');
    expect(res.status).toBe(401);
  });
});

// ── GET /api/v1/notifications/unread-count ────────────────────────────────────

describe('GET /api/v1/notifications/unread-count — unread count', () => {
  beforeEach(() => jest.clearAllMocks());

  it('NOTIF-011 — 200: returns accurate unread count', async () => {
    setupSA();
    Notification.count.mockResolvedValueOnce(7);

    const res = await request(app)
      .get('/api/v1/notifications/unread-count')
      .set('Authorization', authHeader('super_admin'));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.count).toBe(7);
  });

  it('200 — returns 0 when all notifications read', async () => {
    setupSA();
    Notification.count.mockResolvedValueOnce(0);

    const res = await request(app)
      .get('/api/v1/notifications/unread-count')
      .set('Authorization', authHeader('super_admin'));

    expect(res.status).toBe(200);
    expect(res.body.count).toBe(0);
  });
});

// ── PUT /api/v1/notifications/read-all ────────────────────────────────────────

describe('PUT /api/v1/notifications/read-all — mark all as read', () => {
  beforeEach(() => jest.clearAllMocks());

  it('NOTIF-010 — 200: marks all unread as read', async () => {
    setupSA();
    Notification.update.mockResolvedValueOnce([5]);  // [affectedCount]

    const res = await request(app)
      .put('/api/v1/notifications/read-all')
      .set('Authorization', authHeader('super_admin'));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.marked).toBe(5);
  });

  it('200 — returns 0 when nothing to mark', async () => {
    setupSA();
    Notification.update.mockResolvedValueOnce([0]);

    const res = await request(app)
      .put('/api/v1/notifications/read-all')
      .set('Authorization', authHeader('super_admin'));

    expect(res.status).toBe(200);
    expect(res.body.marked).toBe(0);
  });
});

// ── PUT /api/v1/notifications/:id/read ────────────────────────────────────────

describe('PUT /api/v1/notifications/:id/read — mark single as read', () => {
  beforeEach(() => jest.clearAllMocks());

  it('NOTIF-009 — 200: marks notification as read', async () => {
    setupSA();
    const notif = buildNotif({ isRead: false });
    Notification.findOne.mockResolvedValueOnce(notif);

    const res = await request(app)
      .put(`/api/v1/notifications/${NOTIF_ID}/read`)
      .set('Authorization', authHeader('super_admin'));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(notif.update).toHaveBeenCalledWith(
      expect.objectContaining({ isRead: true })
    );
  });

  it('200 — already-read notification is a no-op', async () => {
    setupSA();
    const notif = buildNotif({ isRead: true });
    Notification.findOne.mockResolvedValueOnce(notif);

    const res = await request(app)
      .put(`/api/v1/notifications/${NOTIF_ID}/read`)
      .set('Authorization', authHeader('super_admin'));

    expect(res.status).toBe(200);
    expect(notif.update).not.toHaveBeenCalled();  // no-op if already read
  });

  it('404 — notification not found or belongs to another user', async () => {
    setupSA();
    Notification.findOne.mockResolvedValueOnce(null);

    const res = await request(app)
      .put(`/api/v1/notifications/${NOTIF_ID}/read`)
      .set('Authorization', authHeader('super_admin'));

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });
});

// ── DELETE /api/v1/notifications/:id ─────────────────────────────────────────

describe('DELETE /api/v1/notifications/:id — delete notification', () => {
  beforeEach(() => jest.clearAllMocks());

  it('NOTIF-012 — 200: deletes own notification', async () => {
    setupSA();
    const notif = buildNotif();
    Notification.findOne.mockResolvedValueOnce(notif);

    const res = await request(app)
      .delete(`/api/v1/notifications/${NOTIF_ID}`)
      .set('Authorization', authHeader('super_admin'));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(notif.destroy).toHaveBeenCalled();
  });

  it('404 — notification not found', async () => {
    setupSA();
    Notification.findOne.mockResolvedValueOnce(null);

    const res = await request(app)
      .delete(`/api/v1/notifications/${NOTIF_ID}`)
      .set('Authorization', authHeader('super_admin'));

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });
});

// ── DELETE /api/v1/notifications — clear read ────────────────────────────────

describe('DELETE /api/v1/notifications — clear read notifications', () => {
  beforeEach(() => jest.clearAllMocks());

  it('200: deletes all read notifications', async () => {
    setupSA();
    Notification.destroy.mockResolvedValueOnce(3);  // 3 deleted

    const res = await request(app)
      .delete('/api/v1/notifications')
      .set('Authorization', authHeader('super_admin'));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.deleted).toBe(3);
  });

  it('200: returns 0 when no read notifications exist', async () => {
    setupSA();
    Notification.destroy.mockResolvedValueOnce(0);

    const res = await request(app)
      .delete('/api/v1/notifications')
      .set('Authorization', authHeader('super_admin'));

    expect(res.status).toBe(200);
    expect(res.body.deleted).toBe(0);
  });
});
