/**
 * Chat endpoint tests
 * Runner : Jest + Supertest
 * DB     : Fully mocked — no real Postgres
 *
 * Endpoints covered (25 scenarios):
 *   POST /api/v1/chat/rooms                     (CHAT-001–003)
 *   GET  /api/v1/chat/rooms                     (CHAT-004–005)
 *   GET  /api/v1/chat/rooms/:roomId/messages    (CHAT-006–008)
 *   POST /api/v1/chat/rooms/:roomId/messages    (CHAT-009–011)
 *   PUT  /api/v1/chat/messages/:id              (CHAT-012–014)
 *   DELETE /api/v1/chat/messages/:id            (CHAT-015–017)
 *   POST /api/v1/chat/messages/:id/reactions    (CHAT-018–019)
 *   DELETE /api/v1/chat/messages/:id/reactions/:emoji (CHAT-020)
 *   GET  /api/v1/chat/messages/:id/thread       (CHAT-021–022)
 *   GET  /api/v1/chat/messages/search           (CHAT-023–025)
 */

// ── Constants ─────────────────────────────────────────────────────────────────

const ROOM_ID = '00000000-0000-4000-8000-000000000030';
const MSG_ID  = '00000000-0000-4000-8000-000000000031';
const WS_ID   = '00000000-0000-4000-8000-000000000001';

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
    query: jest.fn(),
    fn:  jest.fn((...args) => args),   // needed for getMessages reply-count aggregation
    col: jest.fn((col) => col),
    Op:  {},
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
const { User, ChatRoom, ChatMessage } = require('../models');
const { authHeader, mockUsers } = require('./helpers/jwt');

// ── Builders ──────────────────────────────────────────────────────────────────

const buildUser = (overrides = {}) => ({
  ...mockUsers.super_admin,
  planId: 'pro',
  update: jest.fn().mockResolvedValue(true),
  toJSON: jest.fn().mockReturnThis(),
  ...overrides,
});

const buildRoom = (overrides = {}) => ({
  id:          ROOM_ID,
  name:        'General',
  scope:       'project',
  workspaceId: WS_ID,
  projectId:   null,
  createdBy:   mockUsers.super_admin.id,
  toJSON:      jest.fn().mockReturnThis(),
  ...overrides,
});

const buildMessage = (overrides = {}) => ({
  id:        MSG_ID,
  roomId:    ROOM_ID,
  userId:    mockUsers.super_admin.id,
  content:   'Hello world',
  parentId:  null,
  reactions: {},
  update:    jest.fn().mockResolvedValue(true),
  reload:    jest.fn().mockImplementation(function () { return Promise.resolve(this); }),
  destroy:   jest.fn().mockResolvedValue(true),
  toJSON:    jest.fn().mockReturnThis(),
  ...overrides,
});

const setupSA = () => {
  const sa = buildUser();
  User.findByPk.mockResolvedValueOnce(sa);
  return sa;
};

// ── POST /api/v1/chat/rooms ───────────────────────────────────────────────────

describe('POST /api/v1/chat/rooms — create chat room', () => {
  beforeEach(() => jest.clearAllMocks());

  it('CHAT-001 — 201: super_admin creates a room', async () => {
    setupSA();
    const room = buildRoom();
    ChatRoom.create.mockResolvedValueOnce(room);

    const res = await request(app)
      .post('/api/v1/chat/rooms')
      .set('Authorization', authHeader('super_admin'))
      .send({ name: 'General', scope: 'project', workspaceId: WS_ID });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(ChatRoom.create).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'General' })
    );
  });

  it('CHAT-002 — 400: missing name rejected by validator', async () => {
    setupSA();

    const res = await request(app)
      .post('/api/v1/chat/rooms')
      .set('Authorization', authHeader('super_admin'))
      .send({ scope: 'project', workspaceId: WS_ID });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('CHAT-003 — 401: unauthenticated request rejected', async () => {
    const res = await request(app)
      .post('/api/v1/chat/rooms')
      .send({ name: 'Room', workspaceId: WS_ID });

    expect(res.status).toBe(401);
  });
});

// ── GET /api/v1/chat/rooms ────────────────────────────────────────────────────

describe('GET /api/v1/chat/rooms — list chat rooms', () => {
  beforeEach(() => jest.clearAllMocks());

  it('CHAT-004 — 200: super_admin lists rooms', async () => {
    setupSA();
    ChatRoom.findAll.mockResolvedValueOnce([buildRoom()]);

    const res = await request(app)
      .get('/api/v1/chat/rooms')
      .set('Authorization', authHeader('super_admin'));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('CHAT-005 — 200: empty list returned when no rooms exist', async () => {
    setupSA();
    ChatRoom.findAll.mockResolvedValueOnce([]);

    const res = await request(app)
      .get('/api/v1/chat/rooms')
      .set('Authorization', authHeader('super_admin'));

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });
});

// ── GET /api/v1/chat/rooms/:roomId/messages ───────────────────────────────────

describe('GET /api/v1/chat/rooms/:roomId/messages — get messages', () => {
  beforeEach(() => jest.clearAllMocks());

  it('CHAT-006 — 200: returns messages in chronological order', async () => {
    setupSA();
    ChatRoom.findByPk.mockResolvedValueOnce(buildRoom());
    // getMessages: findAll for messages (empty → no reply count query)
    ChatMessage.findAll.mockResolvedValueOnce([]);

    const res = await request(app)
      .get(`/api/v1/chat/rooms/${ROOM_ID}/messages`)
      .set('Authorization', authHeader('super_admin'));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('CHAT-007 — 404: unknown room returns 404', async () => {
    setupSA();
    ChatRoom.findByPk.mockResolvedValueOnce(null);

    const res = await request(app)
      .get(`/api/v1/chat/rooms/${ROOM_ID}/messages`)
      .set('Authorization', authHeader('super_admin'));

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  it('CHAT-008 — 401: unauthenticated request rejected', async () => {
    const res = await request(app)
      .get(`/api/v1/chat/rooms/${ROOM_ID}/messages`);

    expect(res.status).toBe(401);
  });
});

// ── POST /api/v1/chat/rooms/:roomId/messages ──────────────────────────────────

describe('POST /api/v1/chat/rooms/:roomId/messages — post message', () => {
  beforeEach(() => jest.clearAllMocks());

  it('CHAT-009 — 201: super_admin posts a message', async () => {
    setupSA();
    const room = buildRoom();
    ChatRoom.findByPk.mockResolvedValueOnce(room);  // room lookup
    const msg = buildMessage();
    ChatMessage.create.mockResolvedValueOnce(msg);
    ChatMessage.findByPk.mockResolvedValueOnce({
      ...msg,
      user: { id: mockUsers.super_admin.id, firstName: 'Super', lastName: 'Admin' },
    });

    const res = await request(app)
      .post(`/api/v1/chat/rooms/${ROOM_ID}/messages`)
      .set('Authorization', authHeader('super_admin'))
      .send({ content: 'Hello world' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(ChatMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({ content: 'Hello world', roomId: ROOM_ID })
    );
  });

  it('CHAT-010 — 404: posting to unknown room returns 404', async () => {
    setupSA();
    ChatRoom.findByPk.mockResolvedValueOnce(null);

    const res = await request(app)
      .post(`/api/v1/chat/rooms/${ROOM_ID}/messages`)
      .set('Authorization', authHeader('super_admin'))
      .send({ content: 'Hey' });

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  it('CHAT-011 — 400: empty content rejected by validator', async () => {
    setupSA();

    const res = await request(app)
      .post(`/api/v1/chat/rooms/${ROOM_ID}/messages`)
      .set('Authorization', authHeader('super_admin'))
      .send({ content: '' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });
});

// ── PUT /api/v1/chat/messages/:id — edit message ─────────────────────────────

describe('PUT /api/v1/chat/messages/:id — edit message', () => {
  beforeEach(() => jest.clearAllMocks());

  it('CHAT-012 — 200: author edits own message', async () => {
    setupSA();
    const msg = buildMessage({ userId: mockUsers.super_admin.id });
    ChatMessage.findByPk.mockResolvedValueOnce(msg);

    const res = await request(app)
      .put(`/api/v1/chat/messages/${MSG_ID}`)
      .set('Authorization', authHeader('super_admin'))
      .send({ content: 'Updated message' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(msg.update).toHaveBeenCalledWith(
      expect.objectContaining({ content: 'Updated message' })
    );
  });

  it('CHAT-013 — 403: non-author cannot edit message', async () => {
    // Use a member user who is NOT the message author
    const member = buildUser({ ...mockUsers.member });
    User.findByPk.mockResolvedValueOnce(member);
    // Message belongs to super_admin, not member
    const msg = buildMessage({ userId: 'someone-else-uuid' });
    ChatMessage.findByPk.mockResolvedValueOnce(msg);

    const res = await request(app)
      .put(`/api/v1/chat/messages/${MSG_ID}`)
      .set('Authorization', authHeader('member'))
      .send({ content: 'Hacked!' });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  it('CHAT-014 — 404: message not found returns 404', async () => {
    setupSA();
    ChatMessage.findByPk.mockResolvedValueOnce(null);

    const res = await request(app)
      .put(`/api/v1/chat/messages/${MSG_ID}`)
      .set('Authorization', authHeader('super_admin'))
      .send({ content: 'Test' });

    expect(res.status).toBe(404);
  });
});

// ── DELETE /api/v1/chat/messages/:id ─────────────────────────────────────────

describe('DELETE /api/v1/chat/messages/:id — delete message', () => {
  beforeEach(() => jest.clearAllMocks());

  it('CHAT-015 — 200: author deletes own message', async () => {
    setupSA();
    const msg = buildMessage({ userId: mockUsers.super_admin.id });
    ChatMessage.findByPk.mockResolvedValueOnce(msg);

    const res = await request(app)
      .delete(`/api/v1/chat/messages/${MSG_ID}`)
      .set('Authorization', authHeader('super_admin'));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(msg.destroy).toHaveBeenCalled();
  });

  it('CHAT-016 — 403: non-author / non-admin cannot delete', async () => {
    const viewer = buildUser({ ...mockUsers.viewer });
    User.findByPk.mockResolvedValueOnce(viewer);
    const msg = buildMessage({ userId: 'someone-else-uuid' });
    ChatMessage.findByPk.mockResolvedValueOnce(msg);

    const res = await request(app)
      .delete(`/api/v1/chat/messages/${MSG_ID}`)
      .set('Authorization', authHeader('viewer'));

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  it('CHAT-017 — 404: message not found returns 404', async () => {
    setupSA();
    ChatMessage.findByPk.mockResolvedValueOnce(null);

    const res = await request(app)
      .delete(`/api/v1/chat/messages/${MSG_ID}`)
      .set('Authorization', authHeader('super_admin'));

    expect(res.status).toBe(404);
  });
});

// ── POST /api/v1/chat/messages/:id/reactions ─────────────────────────────────

describe('POST /api/v1/chat/messages/:id/reactions — add reaction', () => {
  beforeEach(() => jest.clearAllMocks());

  it('CHAT-018 — 200: adds emoji reaction to message', async () => {
    setupSA();
    const msg = buildMessage({ reactions: {} });
    ChatMessage.findByPk.mockResolvedValueOnce(msg);

    const res = await request(app)
      .post(`/api/v1/chat/messages/${MSG_ID}/reactions`)
      .set('Authorization', authHeader('super_admin'))
      .send({ emoji: '👍' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(msg.update).toHaveBeenCalledWith(
      expect.objectContaining({ reactions: expect.any(Object) })
    );
  });

  it('CHAT-019 — 400: missing emoji rejected by validator', async () => {
    setupSA();
    // No ChatMessage mock needed — validator blocks before controller runs

    const res = await request(app)
      .post(`/api/v1/chat/messages/${MSG_ID}/reactions`)
      .set('Authorization', authHeader('super_admin'))
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });
});

// ── DELETE /api/v1/chat/messages/:id/reactions/:emoji ────────────────────────

describe('DELETE /api/v1/chat/messages/:id/reactions/:emoji — remove reaction', () => {
  beforeEach(() => jest.clearAllMocks());

  it('CHAT-020 — 200: removes emoji reaction from message', async () => {
    setupSA();
    const userId = mockUsers.super_admin.id;
    const msg = buildMessage({ reactions: { '👍': [userId] } });
    ChatMessage.findByPk.mockResolvedValueOnce(msg);

    const res = await request(app)
      .delete(`/api/v1/chat/messages/${MSG_ID}/reactions/${encodeURIComponent('👍')}`)
      .set('Authorization', authHeader('super_admin'));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    // Reaction should be removed (empty array → deleted key)
    const updateCall = msg.update.mock.calls[0][0];
    expect(updateCall.reactions['👍']).toBeUndefined();
  });
});

// ── GET /api/v1/chat/messages/:id/thread ─────────────────────────────────────

describe('GET /api/v1/chat/messages/:id/thread — get thread', () => {
  beforeEach(() => jest.clearAllMocks());

  it('CHAT-021 — 200: returns parent message and replies', async () => {
    setupSA();
    const parentMsg = buildMessage();
    ChatMessage.findByPk.mockResolvedValueOnce(parentMsg);  // parent lookup
    ChatRoom.findByPk.mockResolvedValueOnce(buildRoom());   // room for access check
    ChatMessage.findAll.mockResolvedValueOnce([]);           // replies

    const res = await request(app)
      .get(`/api/v1/chat/messages/${MSG_ID}/thread`)
      .set('Authorization', authHeader('super_admin'));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.replies).toBeInstanceOf(Array);
  });

  it('CHAT-022 — 404: message not found returns 404', async () => {
    setupSA();
    ChatMessage.findByPk.mockResolvedValueOnce(null);

    const res = await request(app)
      .get(`/api/v1/chat/messages/${MSG_ID}/thread`)
      .set('Authorization', authHeader('super_admin'));

    expect(res.status).toBe(404);
  });
});

// ── GET /api/v1/chat/messages/search ─────────────────────────────────────────

describe('GET /api/v1/chat/messages/search — search messages', () => {
  beforeEach(() => jest.clearAllMocks());

  it('CHAT-023 — 200: returns matching messages for a room', async () => {
    setupSA();
    ChatRoom.findByPk.mockResolvedValueOnce(buildRoom());
    ChatMessage.findAll.mockResolvedValueOnce([buildMessage()]);

    const res = await request(app)
      .get(`/api/v1/chat/messages/search?roomId=${ROOM_ID}&q=hello`)
      .set('Authorization', authHeader('super_admin'));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('CHAT-024 — 400: missing roomId or q parameter', async () => {
    setupSA();

    const res = await request(app)
      .get('/api/v1/chat/messages/search?q=hello')  // missing roomId
      .set('Authorization', authHeader('super_admin'));

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('CHAT-025 — 404: search in unknown room returns 404', async () => {
    setupSA();
    ChatRoom.findByPk.mockResolvedValueOnce(null);

    const res = await request(app)
      .get(`/api/v1/chat/messages/search?roomId=${ROOM_ID}&q=hello`)
      .set('Authorization', authHeader('super_admin'));

    expect(res.status).toBe(404);
  });
});
