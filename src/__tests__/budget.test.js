/**
 * Budget endpoint tests
 * Runner : Jest + Supertest
 * DB     : Fully mocked — no real Postgres
 *
 * Endpoints covered (13 scenarios):
 *   GET  /api/v1/budgets                          (BUD-001, BUD-002)
 *   POST /api/v1/budgets                          (BUD-003, BUD-004, BUD-005)
 *   PUT  /api/v1/budgets/:budgetId               (BUD-006, BUD-007)
 *   GET  /api/v1/budgets/:budgetId/expenses       (BUD-008)
 *   POST /api/v1/budgets/:budgetId/expenses       (BUD-009, BUD-010, BUD-011)
 *   PUT  /api/v1/budgets/:budgetId/expenses/:id   (BUD-012, BUD-013)
 */

// ── Constants ─────────────────────────────────────────────────────────────────

const BUDGET_ID  = '00000000-0000-4000-8000-000000000040';
const EXPENSE_ID = '00000000-0000-4000-8000-000000000041';
const PRJ_ID     = '00000000-0000-4000-8000-000000000002';

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
  BudgetExpense:  { findAll: jest.fn(), findByPk: jest.fn(), create: jest.fn(), findOne: jest.fn(), sum: jest.fn() },
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

// ── Dependencies ──────────────────────────────────────────────────────────────

const request = require('supertest');
const app     = require('../app');
const { User, Budget, BudgetExpense, Project } = require('../models');
const { authHeader, mockUsers } = require('./helpers/jwt');

// ── Builders ──────────────────────────────────────────────────────────────────

const buildUser = (overrides = {}) => ({
  ...mockUsers.super_admin,
  planId: 'pro',
  update: jest.fn().mockResolvedValue(true),
  toJSON: jest.fn().mockReturnThis(),
  ...overrides,
});

const buildBudget = (overrides = {}) => ({
  id:           BUDGET_ID,
  projectId:    PRJ_ID,
  name:         'Sprint Budget',
  budgetAmount: '5000.00',
  spentAmount:  '0.00',
  currency:     'USD',
  status:       'active',
  expenses:     [],
  update:       jest.fn().mockResolvedValue(true),
  destroy:      jest.fn().mockResolvedValue(true),
  toJSON:       jest.fn().mockReturnThis(),
  ...overrides,
});

const buildExpense = (overrides = {}) => ({
  id:          EXPENSE_ID,
  budgetId:    BUDGET_ID,
  category:    'labor',
  description: 'Dev hours',
  amount:      '100.00',
  date:        new Date().toISOString(),
  update:      jest.fn().mockResolvedValue(true),
  toJSON:      jest.fn().mockReturnThis(),
  ...overrides,
});

const setupSA = () => {
  const sa = buildUser();
  User.findByPk.mockResolvedValueOnce(sa);
  return sa;
};

// ── GET /api/v1/budgets ───────────────────────────────────────────────────────

describe('GET /api/v1/budgets — list budgets', () => {
  beforeEach(() => jest.clearAllMocks());

  it('BUD-001 — 200: returns budgets list', async () => {
    setupSA();
    const budget = buildBudget();
    Budget.findAll.mockResolvedValueOnce([budget]);

    const res = await request(app)
      .get('/api/v1/budgets')
      .set('Authorization', authHeader('super_admin'));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.count).toBe(1);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('BUD-002 — 200: projectId filter applied', async () => {
    setupSA();
    Budget.findAll.mockResolvedValueOnce([buildBudget()]);

    const res = await request(app)
      .get(`/api/v1/budgets?projectId=${PRJ_ID}`)
      .set('Authorization', authHeader('super_admin'));

    expect(res.status).toBe(200);
    expect(Budget.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ projectId: PRJ_ID }),
      })
    );
  });

  it('401 — unauthenticated request rejected', async () => {
    const res = await request(app).get('/api/v1/budgets');
    expect(res.status).toBe(401);
  });
});

// ── POST /api/v1/budgets ──────────────────────────────────────────────────────

describe('POST /api/v1/budgets — create budget', () => {
  beforeEach(() => jest.clearAllMocks());

  it('BUD-003 — 201: super_admin creates budget', async () => {
    setupSA();
    Project.findByPk.mockResolvedValueOnce({ id: PRJ_ID, workspaceId: '00000000-0000-4000-8000-000000000001' });
    const budget = buildBudget();
    Budget.create.mockResolvedValueOnce(budget);

    const res = await request(app)
      .post('/api/v1/budgets')
      .set('Authorization', authHeader('super_admin'))
      .send({ projectId: PRJ_ID, total: 5000, budgetAmount: 5000, name: 'Sprint Budget' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(Budget.create).toHaveBeenCalled();
  });

  it('BUD-004 — 400: missing projectId rejected by validator', async () => {
    setupSA();

    const res = await request(app)
      .post('/api/v1/budgets')
      .set('Authorization', authHeader('super_admin'))
      .send({ total: 5000, name: 'Budget' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('BUD-005 — 404: invalid projectId returns 404', async () => {
    setupSA();
    Project.findByPk.mockResolvedValueOnce(null);

    const res = await request(app)
      .post('/api/v1/budgets')
      .set('Authorization', authHeader('super_admin'))
      .send({ projectId: PRJ_ID, total: 5000, budgetAmount: 5000, name: 'Budget' });

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });
});

// ── PUT /api/v1/budgets/:budgetId ─────────────────────────────────────────────

describe('PUT /api/v1/budgets/:budgetId — update budget', () => {
  beforeEach(() => jest.clearAllMocks());

  it('BUD-006 — 200: super_admin updates budget name and amount', async () => {
    setupSA();
    const budget = buildBudget();
    Budget.findByPk.mockResolvedValueOnce(budget);
    BudgetExpense.sum.mockResolvedValueOnce(500);  // currentSpent

    const res = await request(app)
      .put(`/api/v1/budgets/${BUDGET_ID}`)
      .set('Authorization', authHeader('super_admin'))
      .send({ name: 'Updated Budget', budgetAmount: 6000 });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(budget.update).toHaveBeenCalled();
  });

  it('BUD-007 — 404: updating unknown budget returns 404', async () => {
    setupSA();
    Budget.findByPk.mockResolvedValueOnce(null);

    const res = await request(app)
      .put(`/api/v1/budgets/${BUDGET_ID}`)
      .set('Authorization', authHeader('super_admin'))
      .send({ name: 'Updated' });

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });
});

// ── GET /api/v1/budgets/:budgetId/expenses ────────────────────────────────────

describe('GET /api/v1/budgets/:budgetId/expenses — get expenses', () => {
  beforeEach(() => jest.clearAllMocks());

  it('BUD-008 — 200: returns expense list for budget', async () => {
    setupSA();
    BudgetExpense.findAll.mockResolvedValueOnce([buildExpense()]);

    const res = await request(app)
      .get(`/api/v1/budgets/${BUDGET_ID}/expenses`)
      .set('Authorization', authHeader('super_admin'));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});

// ── POST /api/v1/budgets/:budgetId/expenses ───────────────────────────────────

describe('POST /api/v1/budgets/:budgetId/expenses — add expense', () => {
  beforeEach(() => jest.clearAllMocks());

  it('BUD-009 — 201: super_admin adds an expense', async () => {
    setupSA();
    const budget = buildBudget({ budgetAmount: '5000.00', status: 'active' });
    Budget.findByPk.mockResolvedValueOnce(budget);
    const expense = buildExpense();
    BudgetExpense.create.mockResolvedValueOnce(expense);
    BudgetExpense.sum.mockResolvedValueOnce(100);  // totalSpent after adding

    const res = await request(app)
      .post(`/api/v1/budgets/${BUDGET_ID}/expenses`)
      .set('Authorization', authHeader('super_admin'))
      .send({ category: 'labor', description: 'Dev hours', amount: 100 });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(BudgetExpense.create).toHaveBeenCalledWith(
      expect.objectContaining({ category: 'labor', amount: 100 })
    );
    expect(budget.update).toHaveBeenCalled();
  });

  it('BUD-010 — 404: adding expense to unknown budget returns 404', async () => {
    setupSA();
    Budget.findByPk.mockResolvedValueOnce(null);

    const res = await request(app)
      .post(`/api/v1/budgets/${BUDGET_ID}/expenses`)
      .set('Authorization', authHeader('super_admin'))
      .send({ category: 'labor', description: 'Dev hours', amount: 100 });

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  it('BUD-011 — 400: missing amount rejected by validator', async () => {
    setupSA();

    const res = await request(app)
      .post(`/api/v1/budgets/${BUDGET_ID}/expenses`)
      .set('Authorization', authHeader('super_admin'))
      .send({ category: 'labor', description: 'Dev hours' });  // missing amount

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });
});

// ── PUT /api/v1/budgets/:budgetId/expenses/:expenseId ────────────────────────

describe('PUT /api/v1/budgets/:budgetId/expenses/:expenseId — update expense', () => {
  beforeEach(() => jest.clearAllMocks());

  it('BUD-012 — 200: super_admin updates an expense', async () => {
    setupSA();
    const expense = buildExpense();
    BudgetExpense.findOne.mockResolvedValueOnce(expense);

    const res = await request(app)
      .put(`/api/v1/budgets/${BUDGET_ID}/expenses/${EXPENSE_ID}`)
      .set('Authorization', authHeader('super_admin'))
      .send({ description: 'Updated hours' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(expense.update).toHaveBeenCalled();
  });

  it('BUD-013 — 404: updating unknown expense returns 404', async () => {
    setupSA();
    BudgetExpense.findOne.mockResolvedValueOnce(null);

    const res = await request(app)
      .put(`/api/v1/budgets/${BUDGET_ID}/expenses/${EXPENSE_ID}`)
      .set('Authorization', authHeader('super_admin'))
      .send({ description: 'Updated' });

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });
});
