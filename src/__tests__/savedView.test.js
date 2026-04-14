/**
 * SavedView endpoint tests
 * Runner : Jest + Supertest
 * DB     : Fully mocked — no real Postgres
 *
 * Endpoints covered:
 *   GET    /api/v1/saved-views         (SV-001, SV-002, SV-003)
 *   GET    /api/v1/saved-views/:id     (SV-004, SV-005)
 *   POST   /api/v1/saved-views         (SV-006, SV-007, SV-008, SV-009)
 *   PUT    /api/v1/saved-views/:id     (SV-010, SV-011, SV-012)
 *   DELETE /api/v1/saved-views/:id     (SV-013, SV-014)
 */

// ── Constants ─────────────────────────────────────────────────────────────────

const SV_ID  = '00000000-0000-4000-8000-000000000020';
const WS_ID  = '00000000-0000-4000-8000-000000000001';
const PRJ_ID = '00000000-0000-4000-8000-000000000002';

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
  SavedView:      { findAll: jest.fn(), findByPk: jest.fn(), create: jest.fn(), findOne: jest.fn(), update: jest.fn() },
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

// ── Dependencies ──────────────────────────────────────────────────────────────

const request = require('supertest');
const app     = require('../app');
const { User, SavedView } = require('../models');
const { authHeader, mockUsers } = require('./helpers/jwt');

// ── Builders ──────────────────────────────────────────────────────────────────

const buildUser = (overrides = {}) => ({
  ...mockUsers.super_admin,
  planId: 'pro',
  update: jest.fn().mockResolvedValue(true),
  toJSON: jest.fn().mockReturnThis(),
  ...overrides,
});

const buildView = (overrides = {}) => ({
  id:          SV_ID,
  name:        'Sprint View',
  userId:      mockUsers.super_admin.id,
  workspaceId: WS_ID,
  projectId:   PRJ_ID,
  viewType:    'list',
  filters:     null,
  sortBy:      null,
  groupBy:     null,
  columns:     null,
  isDefault:   false,
  isPublic:    false,
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

// ── GET /api/v1/saved-views ───────────────────────────────────────────────────

describe('GET /api/v1/saved-views — list saved views', () => {
  beforeEach(() => jest.clearAllMocks());

  it('SV-001 — 200: returns user\'s own and public views', async () => {
    setupSA();
    const view = buildView();
    SavedView.findAll.mockResolvedValueOnce([view]);

    const res = await request(app)
      .get('/api/v1/saved-views')
      .set('Authorization', authHeader('super_admin'));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.count).toBe(1);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('SV-002 — 200: empty list when no views exist', async () => {
    setupSA();
    SavedView.findAll.mockResolvedValueOnce([]);

    const res = await request(app)
      .get('/api/v1/saved-views')
      .set('Authorization', authHeader('super_admin'));

    expect(res.status).toBe(200);
    expect(res.body.count).toBe(0);
    expect(res.body.data).toEqual([]);
  });

  it('SV-003 — 200: workspaceId filter applied', async () => {
    setupSA();
    SavedView.findAll.mockResolvedValueOnce([buildView()]);

    const res = await request(app)
      .get(`/api/v1/saved-views?workspaceId=${WS_ID}`)
      .set('Authorization', authHeader('super_admin'));

    expect(res.status).toBe(200);
    expect(SavedView.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ workspaceId: WS_ID }),
      })
    );
  });

  it('401 — unauthenticated request rejected', async () => {
    const res = await request(app).get('/api/v1/saved-views');
    expect(res.status).toBe(401);
  });
});

// ── GET /api/v1/saved-views/:id ───────────────────────────────────────────────

describe('GET /api/v1/saved-views/:id — get saved view by ID', () => {
  beforeEach(() => jest.clearAllMocks());

  it('SV-004 — 200: returns own saved view', async () => {
    setupSA();
    SavedView.findOne.mockResolvedValueOnce(buildView());

    const res = await request(app)
      .get(`/api/v1/saved-views/${SV_ID}`)
      .set('Authorization', authHeader('super_admin'));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('SV-005 — 404: unknown ID returns 404', async () => {
    setupSA();
    SavedView.findOne.mockResolvedValueOnce(null);

    const res = await request(app)
      .get(`/api/v1/saved-views/${SV_ID}`)
      .set('Authorization', authHeader('super_admin'));

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });
});

// ── POST /api/v1/saved-views ──────────────────────────────────────────────────

describe('POST /api/v1/saved-views — create saved view', () => {
  beforeEach(() => jest.clearAllMocks());

  it('SV-006 — 201: creates view with valid data', async () => {
    setupSA();
    const view = buildView();
    SavedView.create.mockResolvedValueOnce(view);

    const res = await request(app)
      .post('/api/v1/saved-views')
      .set('Authorization', authHeader('super_admin'))
      .send({ name: 'Sprint View', workspaceId: WS_ID });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(SavedView.create).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Sprint View' })
    );
  });

  it('SV-007 — 400: missing name rejected by validator', async () => {
    setupSA();

    const res = await request(app)
      .post('/api/v1/saved-views')
      .set('Authorization', authHeader('super_admin'))
      .send({ workspaceId: WS_ID });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('SV-008 — 201: isDefault=true first unsets other defaults then creates', async () => {
    setupSA();
    SavedView.update.mockResolvedValueOnce([1]);  // unset other defaults
    const view = buildView({ isDefault: true });
    SavedView.create.mockResolvedValueOnce(view);

    const res = await request(app)
      .post('/api/v1/saved-views')
      .set('Authorization', authHeader('super_admin'))
      .send({ name: 'Default View', projectId: PRJ_ID, isDefault: true });

    expect(res.status).toBe(201);
    expect(SavedView.update).toHaveBeenCalledWith(
      { isDefault: false },
      expect.any(Object)
    );
  });

  it('SV-009 — 400: invalid projectId UUID rejected', async () => {
    setupSA();

    const res = await request(app)
      .post('/api/v1/saved-views')
      .set('Authorization', authHeader('super_admin'))
      .send({ name: 'Bad View', projectId: 'not-a-uuid' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('401 — unauthenticated request rejected', async () => {
    const res = await request(app)
      .post('/api/v1/saved-views')
      .send({ name: 'View' });

    expect(res.status).toBe(401);
  });
});

// ── PUT /api/v1/saved-views/:id ───────────────────────────────────────────────

describe('PUT /api/v1/saved-views/:id — update saved view', () => {
  beforeEach(() => jest.clearAllMocks());

  it('SV-010 — 200: owner can rename their view', async () => {
    setupSA();
    const view = buildView({ name: 'Old Name' });
    SavedView.findOne.mockResolvedValueOnce(view);

    const res = await request(app)
      .put(`/api/v1/saved-views/${SV_ID}`)
      .set('Authorization', authHeader('super_admin'))
      .send({ name: 'New Name' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(view.update).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'New Name' })
    );
  });

  it('SV-011 — 404: view not found returns 404', async () => {
    setupSA();
    SavedView.findOne.mockResolvedValueOnce(null);

    const res = await request(app)
      .put(`/api/v1/saved-views/${SV_ID}`)
      .set('Authorization', authHeader('super_admin'))
      .send({ name: 'Name' });

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  it('SV-012 — 400: empty name string rejected by validator', async () => {
    setupSA();

    const res = await request(app)
      .put(`/api/v1/saved-views/${SV_ID}`)
      .set('Authorization', authHeader('super_admin'))
      .send({ name: '' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });
});

// ── DELETE /api/v1/saved-views/:id ────────────────────────────────────────────

describe('DELETE /api/v1/saved-views/:id — delete saved view', () => {
  beforeEach(() => jest.clearAllMocks());

  it('SV-013 — 200: owner deletes their view', async () => {
    setupSA();
    const view = buildView();
    SavedView.findOne.mockResolvedValueOnce(view);

    const res = await request(app)
      .delete(`/api/v1/saved-views/${SV_ID}`)
      .set('Authorization', authHeader('super_admin'));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(view.destroy).toHaveBeenCalled();
  });

  it('SV-014 — 404: non-owner / unknown view returns 404', async () => {
    setupSA();
    SavedView.findOne.mockResolvedValueOnce(null);  // not found or not owner

    const res = await request(app)
      .delete(`/api/v1/saved-views/${SV_ID}`)
      .set('Authorization', authHeader('super_admin'));

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  it('401 — unauthenticated request rejected', async () => {
    const res = await request(app).delete(`/api/v1/saved-views/${SV_ID}`);
    expect(res.status).toBe(401);
  });
});
