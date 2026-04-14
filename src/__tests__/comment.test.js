/**
 * Comment endpoint tests
 * Runner : Jest + Supertest
 * DB     : Fully mocked — no real Postgres
 *
 * Endpoints covered:
 *   GET    /api/v1/tasks/:taskId/comments        (CMT-005, CMT-019)
 *   POST   /api/v1/tasks/:taskId/comments        (CMT-001–004, CMT-014, CMT-016, CMT-018)
 *   PUT    /api/v1/comments/:id                  (CMT-006, CMT-007)
 *   DELETE /api/v1/comments/:id                  (CMT-009, CMT-010)
 *   POST   /api/v1/comments/:id/reactions
 *   DELETE /api/v1/comments/:id/reactions/:emoji
 *
 * Notes:
 *   - updateComment / deleteComment allow ONLY the author (no PM override in controller).
 *     CMT-008 / CMT-011 are aspirational and not yet implemented; tested as 403.
 *   - For PUT/DELETE /comments/:id with checkPermission, the :id is a comment UUID —
 *     Project/Task auto-resolve returns null → workspaceId undefined → super_admin
 *     bypasses (step 1), regular users get 403 workspace_id_required.
 */

// ── Constants ─────────────────────────────────────────────────────────────────

const WS_ID     = '00000000-0000-4000-8000-000000000001';
const PRJ_ID    = '00000000-0000-4000-8000-000000000002';
const TASK_ID   = '00000000-0000-4000-8000-000000000003';
const CMT_ID    = '00000000-0000-4000-8000-000000000004';
const PARENT_ID = '00000000-0000-4000-8000-000000000005';

// ── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../models', () => ({
  User:        { findAll: jest.fn(), findByPk: jest.fn(), findOne: jest.fn(), findAndCountAll: jest.fn(), create: jest.fn(), count: jest.fn() },
  Workspace:   {
    findAll: jest.fn(), findByPk: jest.fn(), findOne: jest.fn(), create: jest.fn(), count: jest.fn(),
    unscoped: jest.fn(() => ({ findAll: jest.fn(), findByPk: jest.fn(), create: jest.fn(), count: jest.fn() })),
  },
  WorkspaceMembers: { findOne: jest.fn(), findAll: jest.fn(), create: jest.fn(), destroy: jest.fn() },
  ProjectMembers:   { findOne: jest.fn(), findAll: jest.fn(), create: jest.fn(), destroy: jest.fn() },
  GuestAccess:      { findOne: jest.fn() },
  Project:     { findAll: jest.fn(), findByPk: jest.fn(), findOne: jest.fn(), create: jest.fn(), count: jest.fn() },
  Task:        { findAll: jest.fn(), findByPk: jest.fn(), findOne: jest.fn(), findAndCountAll: jest.fn(), create: jest.fn(), count: jest.fn(), max: jest.fn(), bulkCreate: jest.fn() },
  Subtask:     { findAll: jest.fn(), findByPk: jest.fn(), create: jest.fn(), update: jest.fn(), max: jest.fn() },
  Status:      { findAll: jest.fn(), findByPk: jest.fn(), create: jest.fn() },
  List:        { findAll: jest.fn(), findByPk: jest.fn(), create: jest.fn() },
  Notification: { findAll: jest.fn(), findByPk: jest.fn(), create: jest.fn(), update: jest.fn(), count: jest.fn(), destroy: jest.fn() },
  ActivityLog: { findAll: jest.fn(), findAndCountAll: jest.fn(), create: jest.fn() },
  Invite:      { findAll: jest.fn(), findByPk: jest.fn(), findOne: jest.fn(), create: jest.fn(), destroy: jest.fn() },
  Comment:     { findAll: jest.fn(), findByPk: jest.fn(), findOne: jest.fn(), findAndCountAll: jest.fn(), create: jest.fn(), count: jest.fn() },
  Attachment:  { findAll: jest.fn(), findByPk: jest.fn(), create: jest.fn() },
  TimeLog:     { findAll: jest.fn(), findByPk: jest.fn(), create: jest.fn(), sum: jest.fn() },
  Budget:      { findAll: jest.fn(), findByPk: jest.fn(), create: jest.fn(), findOne: jest.fn() },
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
const { User, Workspace, Project, WorkspaceMembers, ProjectMembers, Task, Comment, TaskAssignees } = require('../models');
const { createNotification } = require('../controllers/notification.controller');
const { authHeader, mockUsers } = require('./helpers/jwt');

// ── Builders ──────────────────────────────────────────────────────────────────

const buildUser = (overrides = {}) => ({
  ...mockUsers.member,
  planId: 'pro',
  update: jest.fn().mockResolvedValue(true),
  toJSON: jest.fn().mockReturnThis(),
  ...overrides,
});

const buildTask = () => ({
  id: TASK_ID,
  title: 'Test Task',
  projectId: PRJ_ID,
  createdBy: mockUsers.super_admin.id,
});

const buildComment = (overrides = {}) => ({
  id: CMT_ID,
  content: 'Test comment',
  taskId: TASK_ID,
  userId: mockUsers.super_admin.id,
  parentId: null,
  reactions: {},
  update: jest.fn().mockResolvedValue(true),
  destroy: jest.fn().mockResolvedValue(true),
  toJSON: jest.fn().mockReturnThis(),
  ...overrides,
});

// ── Auth helpers ──────────────────────────────────────────────────────────────

const setupSA = () => {
  const sa = buildUser({ ...mockUsers.super_admin });
  User.findByPk.mockResolvedValueOnce(sa);
  return sa;
};

const setupViewer = () => {
  const user = buildUser({ ...mockUsers.viewer });
  User.findByPk.mockResolvedValueOnce(user);
  return user;
};

const setupMember = () => {
  const user = buildUser({ ...mockUsers.member });
  User.findByPk.mockResolvedValueOnce(user);
  return user;
};

/**
 * Mock the checkPermission auto-resolve chain for POST /tasks/:taskId/comments.
 * The :taskId param is NOT matched by req.params.id (which is undefined for that
 * route), so projectId = req.body.projectId when provided by the caller.
 * @param {string|null} role - workspace role, or null for non-member
 */
const mockPermChain = (role) => {
  Project.findByPk.mockResolvedValueOnce({ id: PRJ_ID, workspaceId: WS_ID });
  Workspace.findByPk.mockResolvedValueOnce({ id: WS_ID, ownerId: 'someone-else-not-user' });
  if (role) {
    WorkspaceMembers.findOne.mockResolvedValueOnce({ role });
  } else {
    WorkspaceMembers.findOne.mockResolvedValueOnce(null);
  }
};

// ── GET /api/v1/tasks/:taskId/comments ────────────────────────────────────────

describe('GET /api/v1/tasks/:taskId/comments — list comments', () => {
  beforeEach(() => jest.clearAllMocks());

  it('CMT-005 — 200: returns threaded comment list', async () => {
    setupSA();
    const comment = buildComment();
    Task.findByPk.mockResolvedValueOnce(buildTask());
    Comment.findAndCountAll.mockResolvedValueOnce({ count: 1, rows: [comment] });

    const res = await request(app)
      .get(`/api/v1/tasks/${TASK_ID}/comments`)
      .set('Authorization', authHeader('super_admin'));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.total).toBe(1);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('CMT-005b — 404: task not found', async () => {
    setupSA();
    Task.findByPk.mockResolvedValueOnce(null);

    const res = await request(app)
      .get(`/api/v1/tasks/${TASK_ID}/comments`)
      .set('Authorization', authHeader('super_admin'));

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/task not found/i);
  });

  it('CMT-019 — 200: pagination metadata returned', async () => {
    setupSA();
    Task.findByPk.mockResolvedValueOnce(buildTask());
    Comment.findAndCountAll.mockResolvedValueOnce({ count: 25, rows: [] });

    const res = await request(app)
      .get(`/api/v1/tasks/${TASK_ID}/comments?page=2&limit=10`)
      .set('Authorization', authHeader('super_admin'));

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(25);
    expect(res.body.page).toBe(2);
    expect(res.body.limit).toBe(10);
  });

  it('CMT-015 — 200: replies linked under parent via thread structure', async () => {
    setupSA();
    const parent = buildComment({ id: PARENT_ID, parentId: null });
    const reply  = buildComment({ id: CMT_ID, parentId: PARENT_ID });
    Task.findByPk.mockResolvedValueOnce(buildTask());
    Comment.findAndCountAll.mockResolvedValueOnce({ count: 2, rows: [parent, reply] });

    const res = await request(app)
      .get(`/api/v1/tasks/${TASK_ID}/comments`)
      .set('Authorization', authHeader('super_admin'));

    expect(res.status).toBe(200);
    // parent comments only in top-level data; reply is nested
    expect(res.body.data.length).toBe(1);
  });
});

// ── POST /api/v1/tasks/:taskId/comments ──────────────────────────────────────

describe('POST /api/v1/tasks/:taskId/comments — create comment', () => {
  beforeEach(() => jest.clearAllMocks());

  it('CMT-001 — 201: super_admin creates a comment', async () => {
    setupSA();
    Task.findByPk.mockResolvedValueOnce(buildTask());
    Comment.create.mockResolvedValueOnce({ id: CMT_ID });
    Comment.findByPk.mockResolvedValueOnce(buildComment());   // reload
    TaskAssignees.findAll.mockResolvedValueOnce([]);

    const res = await request(app)
      .post(`/api/v1/tasks/${TASK_ID}/comments`)
      .set('Authorization', authHeader('super_admin'))
      .send({ content: 'Great work!' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeDefined();
  });

  it('CMT-002 — 400: empty content rejected by validator', async () => {
    setupSA();

    const res = await request(app)
      .post(`/api/v1/tasks/${TASK_ID}/comments`)
      .set('Authorization', authHeader('super_admin'))
      .send({ content: '' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('CMT-003 — 403: viewer role cannot create comments', async () => {
    setupViewer();
    mockPermChain('viewer');

    const res = await request(app)
      .post(`/api/v1/tasks/${TASK_ID}/comments`)
      .set('Authorization', authHeader('viewer'))
      .send({ content: 'I am a viewer', projectId: PRJ_ID });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  it('CMT-004 — 403: non-member cannot create comments', async () => {
    setupMember();
    mockPermChain(null);  // no WorkspaceMembers record

    const res = await request(app)
      .post(`/api/v1/tasks/${TASK_ID}/comments`)
      .set('Authorization', authHeader('member'))
      .send({ content: 'I am not a member', projectId: PRJ_ID });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  it('CMT-014 — 201: reply linked to parent comment', async () => {
    setupSA();
    const parent = buildComment({ id: PARENT_ID, parentId: null, taskId: TASK_ID });
    const reply  = buildComment({ parentId: PARENT_ID });

    Task.findByPk.mockResolvedValueOnce(buildTask());
    Comment.findByPk.mockResolvedValueOnce(parent);   // parent existence check
    Comment.create.mockResolvedValueOnce({ id: CMT_ID });
    Comment.findByPk.mockResolvedValueOnce(reply);    // reload
    TaskAssignees.findAll.mockResolvedValueOnce([]);

    const res = await request(app)
      .post(`/api/v1/tasks/${TASK_ID}/comments`)
      .set('Authorization', authHeader('super_admin'))
      .send({ content: 'This is a reply', parentId: PARENT_ID });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
  });

  it('CMT-018 — 404: comment on non-existent task', async () => {
    setupSA();
    Task.findByPk.mockResolvedValueOnce(null);

    const res = await request(app)
      .post(`/api/v1/tasks/${TASK_ID}/comments`)
      .set('Authorization', authHeader('super_admin'))
      .send({ content: 'Task is gone' });

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/task not found/i);
  });

  it('CMT-016 — 201: markdown content stored as-is', async () => {
    setupSA();
    Task.findByPk.mockResolvedValueOnce(buildTask());
    Comment.create.mockResolvedValueOnce({ id: CMT_ID });
    Comment.findByPk.mockResolvedValueOnce(buildComment({ content: '**bold** _italic_' }));
    TaskAssignees.findAll.mockResolvedValueOnce([]);

    const res = await request(app)
      .post(`/api/v1/tasks/${TASK_ID}/comments`)
      .set('Authorization', authHeader('super_admin'))
      .send({ content: '**bold** _italic_' });

    expect(res.status).toBe(201);
  });
});

// ── PUT /api/v1/comments/:id ──────────────────────────────────────────────────

describe('PUT /api/v1/comments/:id — update comment', () => {
  beforeEach(() => jest.clearAllMocks());

  it('CMT-006 — 200: author updates own comment', async () => {
    const sa = setupSA();
    const comment = buildComment({ userId: sa.id });
    // checkPermission auto-resolve: CMT_ID won't match any project/task → undefined workspaceId
    // super_admin bypasses at step 1
    // Controller findByPk (main lookup):
    Comment.findByPk.mockResolvedValueOnce(comment);
    // Controller findByPk (reload after update):
    Comment.findByPk.mockResolvedValueOnce({ ...comment, content: 'Updated content' });

    const res = await request(app)
      .put(`/api/v1/comments/${CMT_ID}`)
      .set('Authorization', authHeader('super_admin'))
      .send({ content: 'Updated content' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(comment.update).toHaveBeenCalledWith({ content: 'Updated content' });
  });

  it('CMT-007 — 403: cannot edit another user\'s comment', async () => {
    setupSA();
    // Comment owned by a different user → controller rejects
    Comment.findByPk.mockResolvedValueOnce(buildComment({ userId: 'some-other-user-id' }));

    const res = await request(app)
      .put(`/api/v1/comments/${CMT_ID}`)
      .set('Authorization', authHeader('super_admin'))
      .send({ content: 'Trying to hijack' });

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/own/i);
  });

  it('CMT-006b — 400: empty content rejected by validator', async () => {
    setupSA();

    const res = await request(app)
      .put(`/api/v1/comments/${CMT_ID}`)
      .set('Authorization', authHeader('super_admin'))
      .send({ content: '   ' });

    expect(res.status).toBe(400);
  });

  it('CMT-006c — 404: comment not found', async () => {
    setupSA();
    Comment.findByPk.mockResolvedValueOnce(null);

    const res = await request(app)
      .put(`/api/v1/comments/${CMT_ID}`)
      .set('Authorization', authHeader('super_admin'))
      .send({ content: 'Does not matter' });

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/comment not found/i);
  });
});

// ── DELETE /api/v1/comments/:id ───────────────────────────────────────────────

describe('DELETE /api/v1/comments/:id — delete comment', () => {
  beforeEach(() => jest.clearAllMocks());

  it('CMT-009 — 200: author deletes own comment', async () => {
    const sa = setupSA();
    const comment = buildComment({ userId: sa.id });
    Comment.findByPk.mockResolvedValueOnce(comment);

    const res = await request(app)
      .delete(`/api/v1/comments/${CMT_ID}`)
      .set('Authorization', authHeader('super_admin'));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(comment.destroy).toHaveBeenCalled();
  });

  it('CMT-010 — 403: cannot delete another user\'s comment', async () => {
    setupSA();
    Comment.findByPk.mockResolvedValueOnce(buildComment({ userId: 'another-user-id' }));

    const res = await request(app)
      .delete(`/api/v1/comments/${CMT_ID}`)
      .set('Authorization', authHeader('super_admin'));

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/own/i);
  });

  it('CMT-010b — 404: comment not found', async () => {
    setupSA();
    Comment.findByPk.mockResolvedValueOnce(null);

    const res = await request(app)
      .delete(`/api/v1/comments/${CMT_ID}`)
      .set('Authorization', authHeader('super_admin'));

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/comment not found/i);
  });
});

// ── POST /api/v1/comments/:id/reactions ───────────────────────────────────────

describe('POST /api/v1/comments/:id/reactions — add reaction', () => {
  beforeEach(() => jest.clearAllMocks());

  it('200: adds emoji reaction', async () => {
    const sa = setupSA();
    const comment = buildComment({ reactions: {} });
    Comment.findByPk.mockResolvedValueOnce(comment);
    Comment.findByPk.mockResolvedValueOnce({ ...comment, reactions: { '👍': [sa.id] } });  // reload

    const res = await request(app)
      .post(`/api/v1/comments/${CMT_ID}/reactions`)
      .set('Authorization', authHeader('super_admin'))
      .send({ emoji: '👍' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(comment.update).toHaveBeenCalledWith({ reactions: { '👍': [sa.id] } });
  });

  it('400: missing emoji field', async () => {
    setupSA();

    const res = await request(app)
      .post(`/api/v1/comments/${CMT_ID}/reactions`)
      .set('Authorization', authHeader('super_admin'))
      .send({});

    expect(res.status).toBe(400);
  });

  it('404: comment not found for reaction', async () => {
    setupSA();
    Comment.findByPk.mockResolvedValueOnce(null);

    const res = await request(app)
      .post(`/api/v1/comments/${CMT_ID}/reactions`)
      .set('Authorization', authHeader('super_admin'))
      .send({ emoji: '👍' });

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/comment not found/i);
  });
});

// ── DELETE /api/v1/comments/:id/reactions/:emoji ──────────────────────────────

describe('DELETE /api/v1/comments/:id/reactions/:emoji — remove reaction', () => {
  beforeEach(() => jest.clearAllMocks());

  it('200: removes emoji reaction', async () => {
    const sa = setupSA();
    const comment = buildComment({ reactions: { '👍': [sa.id] } });
    Comment.findByPk.mockResolvedValueOnce(comment);
    Comment.findByPk.mockResolvedValueOnce({ ...comment, reactions: {} });  // reload

    const res = await request(app)
      .delete(`/api/v1/comments/${CMT_ID}/reactions/${encodeURIComponent('👍')}`)
      .set('Authorization', authHeader('super_admin'));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(comment.update).toHaveBeenCalledWith({ reactions: {} });
  });

  it('404: comment not found for reaction removal', async () => {
    setupSA();
    Comment.findByPk.mockResolvedValueOnce(null);

    const res = await request(app)
      .delete(`/api/v1/comments/${CMT_ID}/reactions/${encodeURIComponent('👍')}`)
      .set('Authorization', authHeader('super_admin'));

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/comment not found/i);
  });
});

// ── CMT-008 / CMT-011: PM edit/delete any comment (not yet implemented) ────────

describe('PUT /DELETE /api/v1/comments/:id — author-only enforcement', () => {
  beforeEach(() => jest.clearAllMocks());

  it('CMT-008 — 403: non-author (even PM) cannot edit another user\'s comment (current behavior)', async () => {
    setupSA(); // super_admin is the requester
    // Comment owned by a DIFFERENT user
    Comment.findByPk.mockResolvedValueOnce(buildComment({ userId: 'uuid-other-user' }));

    const res = await request(app)
      .put(`/api/v1/comments/${CMT_ID}`)
      .set('Authorization', authHeader('super_admin'))
      .send({ content: 'Overriding content' });

    // Controller only allows author — super_admin is not the author here
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/own/i);
  });

  it('CMT-011 — 403: non-author cannot delete another user\'s comment (current behavior)', async () => {
    setupSA();
    Comment.findByPk.mockResolvedValueOnce(buildComment({ userId: 'uuid-other-user' }));

    const res = await request(app)
      .delete(`/api/v1/comments/${CMT_ID}`)
      .set('Authorization', authHeader('super_admin'));

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/own/i);
  });
});

// ── CMT-012 / CMT-013: @mention notifications ────────────────────────────────

describe('POST /api/v1/tasks/:taskId/comments — @mention notifications', () => {
  beforeEach(() => jest.clearAllMocks());

  it('CMT-012 — 201: @mention in content triggers notification for matched member', async () => {
    setupSA();
    Task.findByPk.mockResolvedValueOnce(buildTask());
    Comment.create.mockResolvedValueOnce({ id: CMT_ID });
    Comment.findByPk.mockResolvedValueOnce(buildComment({ content: '@regularmember hello' }));
    TaskAssignees.findAll.mockResolvedValueOnce([]);
    // @mention resolution
    ProjectMembers.findAll.mockResolvedValueOnce([
      {
        userId: mockUsers.member.id,
        user: { id: mockUsers.member.id, firstName: 'Regular', lastName: 'Member' }
      }
    ]);

    const res = await request(app)
      .post(`/api/v1/tasks/${TASK_ID}/comments`)
      .set('Authorization', authHeader('super_admin'))
      .send({ content: '@regularmember hello' });

    expect(res.status).toBe(201);
    expect(createNotification).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'task_mentioned', userId: mockUsers.member.id })
    );
  });

  it('CMT-013 — 201: @mention with no matching project member saves comment, no notification', async () => {
    setupSA();
    Task.findByPk.mockResolvedValueOnce(buildTask());
    Comment.create.mockResolvedValueOnce({ id: CMT_ID });
    Comment.findByPk.mockResolvedValueOnce(buildComment({ content: '@unknownuser hello' }));
    TaskAssignees.findAll.mockResolvedValueOnce([]);
    // No project members with matching handle
    ProjectMembers.findAll.mockResolvedValueOnce([]);

    const res = await request(app)
      .post(`/api/v1/tasks/${TASK_ID}/comments`)
      .set('Authorization', authHeader('super_admin'))
      .send({ content: '@unknownuser hello' });

    expect(res.status).toBe(201);
    // No mention notification should be triggered for unknown user
    expect(createNotification).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'task_mentioned' })
    );
  });
});

// ── CMT-017: XSS content stored as-is ────────────────────────────────────────

describe('POST /api/v1/tasks/:taskId/comments — XSS content', () => {
  beforeEach(() => jest.clearAllMocks());

  it('CMT-017 — 201: XSS content stored as plain string (no sanitization at API layer)', async () => {
    const xssContent = '<script>alert("xss")</script>';
    setupSA();
    Task.findByPk.mockResolvedValueOnce(buildTask());
    Comment.create.mockResolvedValueOnce({ id: CMT_ID });
    Comment.findByPk.mockResolvedValueOnce(buildComment({ content: xssContent }));
    TaskAssignees.findAll.mockResolvedValueOnce([]);

    const res = await request(app)
      .post(`/api/v1/tasks/${TASK_ID}/comments`)
      .set('Authorization', authHeader('super_admin'))
      .send({ content: xssContent });

    expect(res.status).toBe(201);
    expect(Comment.create).toHaveBeenCalledWith(
      expect.objectContaining({ content: xssContent })
    );
  });
});
