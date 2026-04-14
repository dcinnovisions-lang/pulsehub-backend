/**
 * Invite endpoint tests
 * Runner : Jest + Supertest
 * DB     : Fully mocked — no real Postgres
 *
 * Endpoints covered:
 *   POST   /api/v1/invites                  (INV-001–005)
 *   GET    /api/v1/invites                  (INV-014)
 *   GET    /api/v1/invites/:token           (INV-006–008)
 *   POST   /api/v1/invites/:token/accept    (INV-009–012)
 *   DELETE /api/v1/invites/:id             (INV-013)
 */

// ── Constants ─────────────────────────────────────────────────────────────────

const WS_ID     = '00000000-0000-4000-8000-000000000001';
const PRJ_ID    = '00000000-0000-4000-8000-000000000002';
const INVITE_ID = '00000000-0000-4000-8000-000000000020';
const INV_TOKEN = 'valid-invite-token-abc123';

// ── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../models', () => ({
  User:        { findAll: jest.fn(), findByPk: jest.fn(), findOne: jest.fn(), create: jest.fn() },
  Workspace:   {
    findAll: jest.fn(), findByPk: jest.fn(), findOne: jest.fn(), create: jest.fn(), count: jest.fn(),
    unscoped: jest.fn(() => ({ findAll: jest.fn(), findByPk: jest.fn(), create: jest.fn(), count: jest.fn() })),
  },
  WorkspaceMembers: { findOne: jest.fn(), findAll: jest.fn(), create: jest.fn(), destroy: jest.fn() },
  ProjectMembers:   { findOne: jest.fn(), findAll: jest.fn(), create: jest.fn(), destroy: jest.fn() },
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
  ActivityLog:    { findAll: jest.fn(), findAndCountAll: jest.fn(), create: jest.fn() },
  Invite:         { findAll: jest.fn(), findByPk: jest.fn(), findOne: jest.fn(), create: jest.fn(), destroy: jest.fn() },
  Comment:        { findAll: jest.fn(), findByPk: jest.fn(), create: jest.fn() },
  Attachment:     { findAll: jest.fn(), findByPk: jest.fn(), create: jest.fn() },
  TimeLog:        { findAll: jest.fn(), findByPk: jest.fn(), create: jest.fn(), sum: jest.fn() },
  Budget:         { findAll: jest.fn(), findByPk: jest.fn(), create: jest.fn(), findOne: jest.fn() },
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
const { User, Workspace, WorkspaceMembers, Invite } = require('../models');
const { authHeader, mockUsers, signToken } = require('./helpers/jwt');

// ── Builders ──────────────────────────────────────────────────────────────────

const buildUser = (overrides = {}) => ({
  ...mockUsers.super_admin,
  planId: 'pro',
  update: jest.fn().mockResolvedValue(true),
  toJSON: jest.fn().mockReturnThis(),
  ...overrides,
});

const buildWorkspace = () => ({
  id: WS_ID, name: 'Test WS', ownerId: mockUsers.super_admin.id,
});

const buildInvite = (overrides = {}) => ({
  id: INVITE_ID,
  token: INV_TOKEN,
  email: 'invited@example.com',
  workspaceId: WS_ID,
  projectId: null,
  role: 'member',
  status: 'pending',
  invitedBy: mockUsers.super_admin.id,
  expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  isValid:   jest.fn().mockReturnValue(true),
  isExpired: jest.fn().mockReturnValue(false),
  update:    jest.fn().mockResolvedValue(true),
  destroy:   jest.fn().mockResolvedValue(true),
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

// ── POST /api/v1/invites — send invite ─────────────────────────────────────────

describe('POST /api/v1/invites — send invite', () => {
  beforeEach(() => jest.clearAllMocks());

  it('INV-001 — 201: SA sends workspace invite', async () => {
    const sa = setupSA();
    const ws = buildWorkspace();
    const invite = buildInvite();

    // Controller: (1) workspace existence, (2) User.findOne (check existing member)
    Workspace.findByPk.mockResolvedValueOnce(ws);        // existence check
    User.findOne.mockResolvedValueOnce(null);             // invitee not yet a user
    Invite.findOne.mockResolvedValueOnce(null);           // no duplicate invite
    Invite.create.mockResolvedValueOnce(invite);
    // Email code: workspace and inviter look ups
    Workspace.findByPk.mockResolvedValueOnce(ws);
    User.findByPk.mockResolvedValueOnce(sa);             // inviter info

    const res = await request(app)
      .post('/api/v1/invites')
      .set('Authorization', authHeader('super_admin'))
      .send({ email: 'invited@example.com', workspaceId: WS_ID, role: 'member' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeDefined();
    expect(res.body.inviteUrl).toContain(INV_TOKEN);
  });

  it('INV-002 — 400: already a workspace member', async () => {
    setupSA();
    const ws = buildWorkspace();
    Workspace.findByPk.mockResolvedValueOnce(ws);  // existence
    // canManageWorkspaceMembers: SA bypasses immediately
    User.findOne.mockResolvedValueOnce({ id: 'existing-user-id', email: 'invited@example.com' });
    WorkspaceMembers.findOne.mockResolvedValueOnce({ workspaceId: WS_ID, userId: 'existing-user-id' });

    const res = await request(app)
      .post('/api/v1/invites')
      .set('Authorization', authHeader('super_admin'))
      .send({ email: 'invited@example.com', workspaceId: WS_ID, role: 'member' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/already a member/i);
  });

  it('INV-003 — 400: duplicate pending invite rejected', async () => {
    setupSA();
    const ws = buildWorkspace();
    Workspace.findByPk.mockResolvedValueOnce(ws);
    User.findOne.mockResolvedValueOnce(null);  // invitee not a user yet
    // Existing pending invite
    Invite.findOne.mockResolvedValueOnce(buildInvite());  // not expired

    const res = await request(app)
      .post('/api/v1/invites')
      .set('Authorization', authHeader('super_admin'))
      .send({ email: 'invited@example.com', workspaceId: WS_ID, role: 'member' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/pending invite/i);
  });

  it('INV-004 — 403: regular member cannot send invites', async () => {
    setupMember();
    const ws = buildWorkspace();
    // (1) existence check, (2) canManageWorkspaceMembers workspace lookup
    Workspace.findByPk.mockResolvedValueOnce(ws);
    Workspace.findByPk.mockResolvedValueOnce(ws);
    WorkspaceMembers.findOne.mockResolvedValueOnce({ role: 'member' });  // role check

    const res = await request(app)
      .post('/api/v1/invites')
      .set('Authorization', authHeader('member'))
      .send({ email: 'someone@example.com', workspaceId: WS_ID, role: 'member' });

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/not authorized/i);
  });

  it('INV-005 — 400: invalid role rejected', async () => {
    setupSA();

    const res = await request(app)
      .post('/api/v1/invites')
      .set('Authorization', authHeader('super_admin'))
      .send({ email: 'someone@example.com', workspaceId: WS_ID, role: 'superuser' });

    expect(res.status).toBe(400);
    // Validator catches invalid role before controller — error is "Validation failed"
    expect(res.body.success).toBe(false);
  });

  it('400 — missing email rejected by validator', async () => {
    setupSA();

    const res = await request(app)
      .post('/api/v1/invites')
      .set('Authorization', authHeader('super_admin'))
      .send({ workspaceId: WS_ID });

    expect(res.status).toBe(400);
  });
});

// ── GET /api/v1/invites — list invites ─────────────────────────────────────────

describe('GET /api/v1/invites — list invites', () => {
  beforeEach(() => jest.clearAllMocks());

  it('INV-014 — 200: lists pending workspace invites', async () => {
    setupSA();
    Invite.findAll.mockResolvedValueOnce([buildInvite(), buildInvite({ id: 'inv-002', email: 'b@ex.com' })]);

    const res = await request(app)
      .get(`/api/v1/invites?workspaceId=${WS_ID}`)
      .set('Authorization', authHeader('super_admin'));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.count).toBe(2);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('401 — unauthenticated request rejected', async () => {
    const res = await request(app).get('/api/v1/invites');
    expect(res.status).toBe(401);
  });
});

// ── GET /api/v1/invites/:token — get by token ─────────────────────────────────

describe('GET /api/v1/invites/:token — get invite by token', () => {
  beforeEach(() => jest.clearAllMocks());

  it('INV-006 — 200: returns valid invite details', async () => {
    Invite.findOne.mockResolvedValueOnce(buildInvite());

    const res = await request(app)
      .get(`/api/v1/invites/${INV_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.token).toBe(INV_TOKEN);
  });

  it('INV-007 — 400: expired invite returns error', async () => {
    Invite.findOne.mockResolvedValueOnce(buildInvite({
      isValid:   jest.fn().mockReturnValue(false),
      isExpired: jest.fn().mockReturnValue(true),
    }));

    const res = await request(app)
      .get(`/api/v1/invites/${INV_TOKEN}`);

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/expired/i);
  });

  it('INV-008 — 404: unknown token returns 404', async () => {
    Invite.findOne.mockResolvedValueOnce(null);

    const res = await request(app)
      .get('/api/v1/invites/nonexistent-token-xyz');

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });
});

// ── POST /api/v1/invites/:token/accept — accept invite ────────────────────────

describe('POST /api/v1/invites/:token/accept — accept invite', () => {
  beforeEach(() => jest.clearAllMocks());

  it('INV-009 — 200: existing user accepts invite', async () => {
    const invitee = buildUser({
      id: 'uuid-invitee',
      email: 'invited@example.com',
      firstName: 'Alice', lastName: 'Doe',
      role: 'member',
    });
    const invite = buildInvite({ email: 'invited@example.com', workspaceId: WS_ID });

    Invite.findOne.mockResolvedValueOnce(invite);      // token lookup
    User.findByPk.mockResolvedValueOnce(invitee);      // JWT decode → findByPk
    WorkspaceMembers.findOne.mockResolvedValueOnce(null);  // not yet a member
    WorkspaceMembers.create.mockResolvedValueOnce({ workspaceId: WS_ID, userId: invitee.id });
    // Notification: project/workspace name lookup
    Workspace.findByPk.mockResolvedValueOnce(buildWorkspace());

    // Sign a token for the invitee
    const inviteeToken = signToken({ id: invitee.id });

    const res = await request(app)
      .post(`/api/v1/invites/${INV_TOKEN}/accept`)
      .set('Authorization', `Bearer ${inviteeToken}`)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(invite.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'accepted' })
    );
  });

  it('INV-010 — 200: new user self-registers and accepts invite', async () => {
    const invite = buildInvite({ email: 'newuser@example.com', workspaceId: WS_ID });
    const newUser = buildUser({ id: 'uuid-new', email: 'newuser@example.com', firstName: 'Bob', lastName: 'Lee' });

    Invite.findOne.mockResolvedValueOnce(invite);
    // No JWT header → user is null → checks body for registration data
    User.findOne.mockResolvedValueOnce(null);       // email not already registered
    User.create.mockResolvedValueOnce(newUser);
    WorkspaceMembers.findOne.mockResolvedValueOnce(null);
    WorkspaceMembers.create.mockResolvedValueOnce({});
    Workspace.findByPk.mockResolvedValueOnce(buildWorkspace());

    const res = await request(app)
      .post(`/api/v1/invites/${INV_TOKEN}/accept`)
      .send({ firstName: 'Bob', lastName: 'Lee', password: 'Pass1234' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('INV-011 — 400: wrong-email user cannot accept invite', async () => {
    const invite = buildInvite({ email: 'invited@example.com' });
    const wrongUser = buildUser({ id: 'uuid-wrong', email: 'other@example.com' });

    Invite.findOne.mockResolvedValueOnce(invite);
    User.findByPk.mockResolvedValueOnce(wrongUser);

    const wrongToken = signToken({ id: wrongUser.id });

    const res = await request(app)
      .post(`/api/v1/invites/${INV_TOKEN}/accept`)
      .set('Authorization', `Bearer ${wrongToken}`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/different email/i);
  });

  it('INV-012 — 400: already-used invite cannot be accepted again', async () => {
    Invite.findOne.mockResolvedValueOnce(buildInvite({
      status: 'accepted',
      isValid:   jest.fn().mockReturnValue(false),
      isExpired: jest.fn().mockReturnValue(false),
    }));

    const res = await request(app)
      .post(`/api/v1/invites/${INV_TOKEN}/accept`)
      .send({ firstName: 'A', lastName: 'B', password: 'pass123' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });
});

// ── DELETE /api/v1/invites/:id — cancel invite ────────────────────────────────

describe('DELETE /api/v1/invites/:id — cancel invite', () => {
  beforeEach(() => jest.clearAllMocks());

  it('INV-013 — 200: original sender cancels invite', async () => {
    const sa = setupSA();
    const invite = buildInvite({ invitedBy: sa.id });
    Invite.findByPk.mockResolvedValueOnce(invite);

    const res = await request(app)
      .delete(`/api/v1/invites/${INVITE_ID}`)
      .set('Authorization', authHeader('super_admin'));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(invite.update).toHaveBeenCalledWith({ status: 'cancelled' });
  });

  it('404 — invite not found', async () => {
    setupSA();
    Invite.findByPk.mockResolvedValueOnce(null);

    const res = await request(app)
      .delete(`/api/v1/invites/${INVITE_ID}`)
      .set('Authorization', authHeader('super_admin'));

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  it('403 — non-sender non-admin cannot cancel', async () => {
    const member = setupMember();
    const invite = buildInvite({ invitedBy: 'someone-else-id' });
    Invite.findByPk.mockResolvedValueOnce(invite);
    // canManageWorkspaceMembers: member not in admin role
    Workspace.findByPk.mockResolvedValueOnce(buildWorkspace());
    WorkspaceMembers.findOne.mockResolvedValueOnce({ role: 'member' });

    const res = await request(app)
      .delete(`/api/v1/invites/${INVITE_ID}`)
      .set('Authorization', authHeader('member'));

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/not authorized/i);
  });
});
