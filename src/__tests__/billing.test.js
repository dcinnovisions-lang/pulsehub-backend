/**
 * Billing endpoint tests
 * Runner : Jest + Supertest
 * DB     : Fully mocked — no real Postgres
 * SDK    : Razorpay fully mocked
 *
 * Endpoints covered:
 *   POST /api/v1/billing/create-subscription  (BILL-001, BILL-002, BILL-003)
 *   POST /api/v1/billing/verify-payment       (BILL-004, BILL-005, BILL-006)
 *   GET  /api/v1/billing/subscription         (BILL-007, BILL-008)
 *   POST /api/v1/billing/cancel-subscription  (BILL-009, BILL-010)
 *   POST /api/v1/billing/webhook              (BILL-011–BILL-014)
 */

// ── Mocks ─────────────────────────────────────────────────────────────────────

// Mock Razorpay BEFORE app loads (require order matters)
const mockRazorpay = {
  subscriptions: {
    create: jest.fn(),
    fetch:  jest.fn(),
    cancel: jest.fn(),
  },
};
jest.mock('razorpay', () => jest.fn().mockImplementation(() => mockRazorpay));

jest.mock('../models', () => ({
  User: {
    findAll: jest.fn(), findByPk: jest.fn(), findOne: jest.fn(), create: jest.fn(),
    update: jest.fn(),
  },
  Workspace: {
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

// ── Dependencies ──────────────────────────────────────────────────────────────

const crypto  = require('crypto');
const request = require('supertest');
const app     = require('../app');
const { User } = require('../models');
const { authHeader, mockUsers, signToken } = require('./helpers/jwt');

// ── Env setup ─────────────────────────────────────────────────────────────────

// Provide test Razorpay env vars so the controller doesn't fail on missing config
process.env.RAZORPAY_KEY_ID          = 'rzp_test_key';
process.env.RAZORPAY_KEY_SECRET      = 'razorpay_secret';
process.env.RAZORPAY_PRO_PLAN_ID     = 'plan_pro_test';
process.env.RAZORPAY_BUSINESS_PLAN_ID = 'plan_business_test';
process.env.RAZORPAY_WEBHOOK_SECRET  = 'webhook_secret';

// ── Builders ──────────────────────────────────────────────────────────────────

const buildUser = (overrides = {}) => ({
  ...mockUsers.super_admin,
  planId:             'free',
  subscriptionStatus: 'free',
  subscriptionId:     null,
  update: jest.fn().mockResolvedValue(true),
  toJSON: jest.fn().mockReturnThis(),
  ...overrides,
});

// Sign a webhook body with HMAC-SHA256 using the test secret
const signWebhook = (body) =>
  crypto.createHmac('sha256', 'webhook_secret').update(body).digest('hex');

// ── POST /api/v1/billing/create-subscription ──────────────────────────────────

describe('POST /api/v1/billing/create-subscription — create Razorpay subscription', () => {
  beforeEach(() => jest.clearAllMocks());

  it('BILL-001 — 200: pro plan creates subscription and returns subscriptionId + keyId', async () => {
    const user = buildUser();
    User.findByPk.mockResolvedValueOnce(user);  // authenticate
    User.findByPk.mockResolvedValueOnce(user);  // controller lookup

    mockRazorpay.subscriptions.create.mockResolvedValueOnce({
      id:    'sub_test_pro_001',
      notes: { userId: user.id, planId: 'pro' },
    });

    const res = await request(app)
      .post('/api/v1/billing/create-subscription')
      .set('Authorization', authHeader('super_admin'))
      .send({ planId: 'pro' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.subscriptionId).toBe('sub_test_pro_001');
    expect(res.body.keyId).toBe('rzp_test_key');
    expect(user.update).toHaveBeenCalledWith({ subscriptionId: 'sub_test_pro_001' });
  });

  it('BILL-002 — 200: business plan creates subscription', async () => {
    const user = buildUser();
    User.findByPk.mockResolvedValueOnce(user);
    User.findByPk.mockResolvedValueOnce(user);

    mockRazorpay.subscriptions.create.mockResolvedValueOnce({ id: 'sub_test_biz_001' });

    const res = await request(app)
      .post('/api/v1/billing/create-subscription')
      .set('Authorization', authHeader('super_admin'))
      .send({ planId: 'business' });

    expect(res.status).toBe(200);
    expect(res.body.subscriptionId).toBe('sub_test_biz_001');
  });

  it('BILL-003 — 400: invalid planId rejected by validator', async () => {
    User.findByPk.mockResolvedValueOnce(buildUser());

    const res = await request(app)
      .post('/api/v1/billing/create-subscription')
      .set('Authorization', authHeader('super_admin'))
      .send({ planId: 'enterprise' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('400 — missing planId rejected', async () => {
    User.findByPk.mockResolvedValueOnce(buildUser());

    const res = await request(app)
      .post('/api/v1/billing/create-subscription')
      .set('Authorization', authHeader('super_admin'))
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('401 — unauthenticated request rejected', async () => {
    const res = await request(app)
      .post('/api/v1/billing/create-subscription')
      .send({ planId: 'pro' });

    expect(res.status).toBe(401);
  });
});

// ── POST /api/v1/billing/verify-payment ───────────────────────────────────────

describe('POST /api/v1/billing/verify-payment — verify Razorpay payment signature', () => {
  beforeEach(() => jest.clearAllMocks());

  const validPayload = () => {
    const paymentId      = 'pay_test_001';
    const subscriptionId = 'sub_test_001';
    const body           = `${paymentId}|${subscriptionId}`;
    const signature      = crypto
      .createHmac('sha256', 'razorpay_secret')
      .update(body)
      .digest('hex');

    return {
      razorpay_payment_id:      paymentId,
      razorpay_subscription_id: subscriptionId,
      razorpay_signature:       signature,
      planId:                   'pro',
    };
  };

  it('BILL-004 — 200: valid signature updates user plan to pro', async () => {
    User.findByPk.mockResolvedValueOnce(buildUser());  // authenticate
    User.update.mockResolvedValueOnce([1]);

    const res = await request(app)
      .post('/api/v1/billing/verify-payment')
      .set('Authorization', authHeader('super_admin'))
      .send(validPayload());

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(User.update).toHaveBeenCalledWith(
      expect.objectContaining({ planId: 'pro', subscriptionStatus: 'active' }),
      expect.any(Object)
    );
  });

  it('BILL-005 — 400: tampered signature rejected', async () => {
    User.findByPk.mockResolvedValueOnce(buildUser());

    const res = await request(app)
      .post('/api/v1/billing/verify-payment')
      .set('Authorization', authHeader('super_admin'))
      .send({
        razorpay_payment_id:      'pay_001',
        razorpay_subscription_id: 'sub_001',
        razorpay_signature:       'invalid_signature_value',
        planId:                   'pro',
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    // Validator passes (fields present), controller rejects signature
    expect(res.body.error).toMatch(/signature/i);
  });

  it('BILL-006 — 400: missing required fields rejected by validator', async () => {
    User.findByPk.mockResolvedValueOnce(buildUser());

    const res = await request(app)
      .post('/api/v1/billing/verify-payment')
      .set('Authorization', authHeader('super_admin'))
      .send({ planId: 'pro' });  // missing razorpay_payment_id etc.

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('401 — unauthenticated request rejected', async () => {
    const res = await request(app)
      .post('/api/v1/billing/verify-payment')
      .send(validPayload());

    expect(res.status).toBe(401);
  });
});

// ── GET /api/v1/billing/subscription ──────────────────────────────────────────

describe('GET /api/v1/billing/subscription — get current subscription', () => {
  beforeEach(() => jest.clearAllMocks());

  it('BILL-007 — 200: returns planId and subscriptionStatus for free user', async () => {
    User.findByPk.mockResolvedValueOnce(buildUser());  // authenticate
    User.findByPk.mockResolvedValueOnce(buildUser({
      planId: 'free', subscriptionStatus: 'free', subscriptionId: null,
    }));

    const res = await request(app)
      .get('/api/v1/billing/subscription')
      .set('Authorization', authHeader('super_admin'));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.planId).toBe('free');
    expect(res.body.data.subscriptionStatus).toBe('free');
    expect(res.body.data.nextBillingDate).toBeNull();
  });

  it('BILL-008 — 200: pro user with subscriptionId fetches nextBillingDate from Razorpay', async () => {
    const proUser = buildUser({
      planId: 'pro', subscriptionStatus: 'active', subscriptionId: 'sub_pro_123',
    });
    User.findByPk.mockResolvedValueOnce(proUser);  // authenticate
    User.findByPk.mockResolvedValueOnce(proUser);  // controller lookup

    const chargeAt = Math.floor(Date.now() / 1000) + 86400;
    mockRazorpay.subscriptions.fetch.mockResolvedValueOnce({ charge_at: chargeAt });

    const res = await request(app)
      .get('/api/v1/billing/subscription')
      .set('Authorization', authHeader('super_admin'));

    expect(res.status).toBe(200);
    expect(res.body.data.planId).toBe('pro');
    expect(res.body.data.subscriptionStatus).toBe('active');
    expect(res.body.data.nextBillingDate).not.toBeNull();
  });

  it('401 — unauthenticated request rejected', async () => {
    const res = await request(app).get('/api/v1/billing/subscription');
    expect(res.status).toBe(401);
  });
});

// ── POST /api/v1/billing/cancel-subscription ──────────────────────────────────

describe('POST /api/v1/billing/cancel-subscription — cancel subscription', () => {
  beforeEach(() => jest.clearAllMocks());

  it('BILL-009 — 200: active subscriber cancels subscription', async () => {
    const user = buildUser({ subscriptionId: 'sub_active_001', subscriptionStatus: 'active' });
    User.findByPk.mockResolvedValueOnce(user);  // authenticate
    User.findByPk.mockResolvedValueOnce(user);  // controller lookup

    mockRazorpay.subscriptions.cancel.mockResolvedValueOnce({ id: 'sub_active_001', status: 'cancelled' });

    const res = await request(app)
      .post('/api/v1/billing/cancel-subscription')
      .set('Authorization', authHeader('super_admin'));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toMatch(/cancel/i);
    expect(user.update).toHaveBeenCalledWith({ subscriptionStatus: 'canceled' });
  });

  it('BILL-010 — 400: user with no subscription cannot cancel', async () => {
    const user = buildUser({ subscriptionId: null });
    User.findByPk.mockResolvedValueOnce(user);  // authenticate
    User.findByPk.mockResolvedValueOnce(user);  // controller lookup

    const res = await request(app)
      .post('/api/v1/billing/cancel-subscription')
      .set('Authorization', authHeader('super_admin'));

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/no active subscription/i);
  });

  it('401 — unauthenticated request rejected', async () => {
    const res = await request(app)
      .post('/api/v1/billing/cancel-subscription');

    expect(res.status).toBe(401);
  });
});

// ── POST /api/v1/billing/webhook — Razorpay webhook ──────────────────────────

describe('POST /api/v1/billing/webhook — Razorpay webhook events', () => {
  beforeEach(() => jest.clearAllMocks());

  const makeWebhookRequest = (event, sigOverride) => {
    const body   = JSON.stringify(event);
    const sig    = sigOverride || signWebhook(body);
    return request(app)
      .post('/api/v1/billing/webhook')
      .set('Content-Type', 'application/json')
      .set('x-razorpay-signature', sig)
      .send(body);
  };

  it('BILL-011 — 200: subscription.activated updates user to active', async () => {
    User.update.mockResolvedValueOnce([1]);

    const event = {
      event: 'subscription.activated',
      payload: {
        subscription: {
          entity: {
            id:    'sub_act_001',
            notes: { userId: 'uuid-user-abc', planId: 'pro' },
          },
        },
      },
    };

    const res = await makeWebhookRequest(event);

    expect(res.status).toBe(200);
    expect(res.body.received).toBe(true);
    expect(User.update).toHaveBeenCalledWith(
      expect.objectContaining({ subscriptionStatus: 'active', planId: 'pro' }),
      expect.objectContaining({ where: { id: 'uuid-user-abc' } })
    );
  });

  it('BILL-012 — 200: subscription.cancelled downgrades user to free', async () => {
    User.update.mockResolvedValueOnce([1]);

    const event = {
      event: 'subscription.cancelled',
      payload: {
        subscription: {
          entity: {
            id:    'sub_can_001',
            notes: { userId: 'uuid-user-abc' },
          },
        },
      },
    };

    const res = await makeWebhookRequest(event);

    expect(res.status).toBe(200);
    expect(User.update).toHaveBeenCalledWith(
      expect.objectContaining({ subscriptionStatus: 'free', planId: 'free', subscriptionId: null }),
      expect.any(Object)
    );
  });

  it('BILL-013 — 200: payment.failed sets user to past_due', async () => {
    User.update.mockResolvedValueOnce([1]);

    const event = {
      event: 'payment.failed',
      payload: {
        subscription: {
          entity: {
            id:    'sub_fail_001',
            notes: { userId: 'uuid-user-abc' },
          },
        },
      },
    };

    const res = await makeWebhookRequest(event);

    expect(res.status).toBe(200);
    expect(User.update).toHaveBeenCalledWith(
      { subscriptionStatus: 'past_due' },
      expect.objectContaining({ where: { id: 'uuid-user-abc' } })
    );
  });

  it('BILL-014 — 400: invalid webhook signature rejected', async () => {
    const event = { event: 'subscription.activated', payload: {} };
    const res = await makeWebhookRequest(event, 'bad_signature_000');

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('200: unknown event type is silently ignored (returns received:true)', async () => {
    const event = { event: 'some.unknown.event', payload: {} };
    const res = await makeWebhookRequest(event);

    expect(res.status).toBe(200);
    expect(res.body.received).toBe(true);
    expect(User.update).not.toHaveBeenCalled();
  });
});
