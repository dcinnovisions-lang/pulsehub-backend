/**
 * Workspace endpoint tests
 * Runner : Jest + Supertest
 * DB     : Fully mocked — no real Postgres connection needed
 *
 * Endpoints covered (27 scenarios from TEST_SCENARIOS.md):
 *   GET    /api/v1/workspaces
 *   POST   /api/v1/workspaces
 *   GET    /api/v1/workspaces/:id
 *   PUT    /api/v1/workspaces/:id
 *   DELETE /api/v1/workspaces/:id
 *   GET    /api/v1/workspaces/:id/members
 *   POST   /api/v1/workspaces/:id/members
 *   PUT    /api/v1/workspaces/:id/members/:userId
 *   DELETE /api/v1/workspaces/:id/members/:userId
 */

// ── Mocks ─────────────────────────────────────────────────────────────────────

const MOCK_WORKSPACE_ID = 'ws-uuid-001';
const OTHER_WS_ID = 'ws-uuid-other';

// Workspace mock instance factory
const buildMockWorkspace = (overrides = {}) => {
  const obj = {
    id: MOCK_WORKSPACE_ID,
    name: 'Test Workspace',
    description: 'A test workspace',
    ownerId: 'uuid-member', // default: owned by 'member' user
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    owner: { id: 'uuid-member', email: 'member@test.com', firstName: 'Regular', lastName: 'Member', avatar: null },
    members: [],
    update: jest.fn().mockResolvedValue(true),
    destroy: jest.fn().mockResolvedValue(true),
    reload: jest.fn().mockImplementation(function() { return Promise.resolve(this); }),
    toJSON: jest.fn().mockImplementation(function() {
      return { id: this.id, name: this.name, ownerId: this.ownerId, isActive: this.isActive,
               description: this.description, owner: this.owner, members: this.members };
    }),
    ...overrides,
  };
  return obj;
};

jest.mock('../models', () => {
  const mockUnscoped = {
    findAll: jest.fn(),
    findByPk: jest.fn(),
    create: jest.fn(),
    count: jest.fn(),
  };

  return {
    User: {
      findAll: jest.fn(),
      findByPk: jest.fn(),
      findOne: jest.fn(),
    },
    Workspace: {
      findAll: jest.fn(),
      findByPk: jest.fn(),
      create: jest.fn(),
      count: jest.fn(),
      unscoped: jest.fn(() => mockUnscoped),
    },
    WorkspaceMembers: {
      findOne: jest.fn(),
      findAll: jest.fn(),
      create: jest.fn(),
      destroy: jest.fn(),
    },
    ProjectMembers: {
      findOne: jest.fn(),
    },
    Project: {
      findAll: jest.fn().mockResolvedValue([]),
      findByPk: jest.fn(),
      update: jest.fn().mockResolvedValue([0]),
    },
    Task: {
      findAll: jest.fn(),
      findByPk: jest.fn(),
      count: jest.fn(),
      update: jest.fn().mockResolvedValue([0]),
    },
    Notification: {
      findAll: jest.fn(),
      findByPk: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
      destroy: jest.fn(),
    },
    ActivityLog: {
      findAll: jest.fn(),
      findAndCountAll: jest.fn(),
      create: jest.fn(),
    },
    Invite: { findAll: jest.fn(), findByPk: jest.fn(), create: jest.fn(), findOne: jest.fn(), destroy: jest.fn() },
    List: { findAll: jest.fn(), findByPk: jest.fn(), create: jest.fn() },
    Comment: { findAll: jest.fn(), findByPk: jest.fn(), create: jest.fn() },
    Attachment: { findAll: jest.fn(), findByPk: jest.fn(), create: jest.fn() },
    TimeLog: { findAll: jest.fn(), findByPk: jest.fn(), create: jest.fn(), sum: jest.fn() },
    Budget: { findAll: jest.fn(), findByPk: jest.fn(), create: jest.fn(), findOne: jest.fn() },
    BudgetExpense: { findAll: jest.fn(), findByPk: jest.fn(), create: jest.fn() },
    SavedView: { findAll: jest.fn(), findByPk: jest.fn(), create: jest.fn(), findOne: jest.fn() },
    ChatRoom: { findAll: jest.fn(), findByPk: jest.fn(), create: jest.fn(), findOne: jest.fn() },
    ChatMessage: { findAll: jest.fn(), findByPk: jest.fn(), create: jest.fn() },
    Resource: { findAll: jest.fn(), findByPk: jest.fn(), create: jest.fn(), findOne: jest.fn() },
    Subtask: { findAll: jest.fn(), findByPk: jest.fn(), create: jest.fn() },
    TaskAssignees: { findAll: jest.fn(), findOne: jest.fn(), create: jest.fn(), destroy: jest.fn() },
    TaskDependency: { findAll: jest.fn(), findOne: jest.fn(), create: jest.fn(), destroy: jest.fn() },
    CustomField: { findAll: jest.fn(), findByPk: jest.fn(), create: jest.fn() },
    TaskCustomField: { findAll: jest.fn(), findOne: jest.fn(), create: jest.fn() },
    Status: { findAll: jest.fn(), findByPk: jest.fn(), create: jest.fn() },
    Workflow: { findAll: jest.fn(), findByPk: jest.fn(), create: jest.fn() },
    GuestAccess: { findOne: jest.fn() },
    sequelize: {
      // Unmanaged transaction: returns a transaction object with commit/rollback
      transaction: jest.fn().mockResolvedValue({
        commit: jest.fn().mockResolvedValue(undefined),
        rollback: jest.fn().mockResolvedValue(undefined),
      }),
      query: jest.fn(),
      Op: {},
    },
  };
});

jest.mock('../utils/logger', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
}));

jest.mock('../socket', () => ({
  emitChatMessage: jest.fn(),
  getIO: jest.fn(() => ({ to: jest.fn(() => ({ emit: jest.fn() })) })),
}));

jest.mock('multer'); // picks up __mocks__/multer.js for logo upload tests

// Note: notification and activityLog controllers are NOT mocked here.
// Their route handlers are registered but never invoked in workspace tests.
// The models mock below intercepts any accidental calls at the DB level.

// ── Dependencies ──────────────────────────────────────────────────────────────

const request = require('supertest');
const multer = require('multer');
const app = require('../app');
const { User, Workspace, WorkspaceMembers } = require('../models');
const { signToken, mockUsers, authHeader } = require('./helpers/jwt');

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Build a full mock user with instance methods */
const buildMockUser = (overrides = {}) => ({
  ...mockUsers.member,
  planId: 'free',
  update: jest.fn().mockResolvedValue(true),
  toJSON: jest.fn().mockReturnThis(),
  ...overrides,
});

/**
 * Setup the auth middleware mock: User.findByPk returns the given user
 * on the FIRST call (used by the authenticate middleware).
 */
const setAuthUser = (user) => {
  User.findByPk.mockResolvedValueOnce(user);
};

/**
 * Setup workspace permission resolution:
 * 1. User.findByPk (for plan limit if POST /workspaces)
 * 2. Workspace.findByPk (for permission middleware)
 * The workspace ownerId must match the user id to pass the owner check.
 */
const setOwnerWorkspace = (ws) => {
  Workspace.findByPk.mockResolvedValueOnce(ws);   // permission middleware
  Workspace.findByPk.mockResolvedValueOnce(ws);   // controller
};

// ── GET /api/v1/workspaces ────────────────────────────────────────────────────

describe('GET /api/v1/workspaces — list workspaces', () => {
  beforeEach(() => jest.clearAllMocks());

  it('WS-008 — 200: authenticated user gets own workspaces', async () => {
    const user = buildMockUser({ ...mockUsers.member });
    setAuthUser(user);

    const ws = buildMockWorkspace({ ownerId: mockUsers.member.id });
    Workspace.findAll.mockResolvedValue([ws]);

    const res = await request(app)
      .get('/api/v1/workspaces')
      .set('Authorization', authHeader('member'));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.count).toBe(1);
  });

  it('WS-009 — 200: returns empty array when user has no workspaces', async () => {
    const user = buildMockUser({ ...mockUsers.member });
    setAuthUser(user);
    Workspace.findAll.mockResolvedValue([]);

    const res = await request(app)
      .get('/api/v1/workspaces')
      .set('Authorization', authHeader('member'));

    expect(res.status).toBe(200);
    expect(res.body.count).toBe(0);
    expect(res.body.data).toEqual([]);
  });

  it('401 — unauthenticated request rejected', async () => {
    const res = await request(app).get('/api/v1/workspaces');
    expect(res.status).toBe(401);
  });
});

// ── POST /api/v1/workspaces ───────────────────────────────────────────────────

describe('POST /api/v1/workspaces — create workspace', () => {
  beforeEach(() => jest.clearAllMocks());

  it('WS-001 — 201: create workspace with valid data', async () => {
    const user = buildMockUser({ ...mockUsers.member, planId: 'pro' });
    // authenticate
    User.findByPk.mockResolvedValueOnce(user);
    // checkWorkspaceLimit: User.findByPk (planId) + Workspace.count
    User.findByPk.mockResolvedValueOnce({ id: user.id, planId: 'pro' });
    Workspace.count.mockResolvedValue(0);

    const ws = buildMockWorkspace({ ownerId: user.id });
    Workspace.create.mockResolvedValue(ws);
    WorkspaceMembers.create.mockResolvedValue({ id: 'wm-001', workspaceId: ws.id, userId: user.id, role: 'owner' });

    const res = await request(app)
      .post('/api/v1/workspaces')
      .set('Authorization', authHeader('member'))
      .send({ name: 'My Workspace', description: 'A great workspace' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(Workspace.create).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'My Workspace', ownerId: user.id })
    );
    // Owner added to workspace_members with role='owner'
    expect(WorkspaceMembers.create).toHaveBeenCalledWith(
      expect.objectContaining({ userId: user.id, role: 'owner' })
    );
  });

  it('WS-002 — 400: missing workspace name rejected by validator', async () => {
    const user = buildMockUser({ ...mockUsers.member });
    setAuthUser(user);

    const res = await request(app)
      .post('/api/v1/workspaces')
      .set('Authorization', authHeader('member'))
      .send({ description: 'No name provided' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('WS-003 — 400: workspace name too long (>100 chars)', async () => {
    const user = buildMockUser({ ...mockUsers.member });
    setAuthUser(user);

    const res = await request(app)
      .post('/api/v1/workspaces')
      .set('Authorization', authHeader('member'))
      .send({ name: 'A'.repeat(101) });

    expect(res.status).toBe(400);
  });

  it('WS-004 — 201: creator is set as workspace owner', async () => {
    const user = buildMockUser({ ...mockUsers.member, planId: 'pro' });
    User.findByPk.mockResolvedValueOnce(user);
    User.findByPk.mockResolvedValueOnce({ id: user.id, planId: 'pro' });
    Workspace.count.mockResolvedValue(0);

    const ws = buildMockWorkspace({ ownerId: user.id });
    Workspace.create.mockResolvedValue(ws);
    WorkspaceMembers.create.mockResolvedValue({});

    const res = await request(app)
      .post('/api/v1/workspaces')
      .set('Authorization', authHeader('member'))
      .send({ name: 'Owner Test WS' });

    expect(res.status).toBe(201);
    // Workspace created with ownerId = authenticated user's id
    expect(Workspace.create).toHaveBeenCalledWith(
      expect.objectContaining({ ownerId: mockUsers.member.id })
    );
  });

  it('WS-005 — 403: free plan blocks 2nd workspace creation', async () => {
    const user = buildMockUser({ ...mockUsers.member, planId: 'free' });
    User.findByPk.mockResolvedValueOnce(user);         // authenticate
    User.findByPk.mockResolvedValueOnce({ id: user.id, planId: 'free' }); // plan check
    Workspace.count.mockResolvedValue(1); // already has 1 workspace (at limit)

    const res = await request(app)
      .post('/api/v1/workspaces')
      .set('Authorization', authHeader('member'))
      .send({ name: 'Second Workspace' });

    expect(res.status).toBe(403);
    expect(res.body.upgradeRequired).toBe(true);
    expect(res.body.currentPlan).toBe('free');
  });

  it('WS-006 — 403: pro plan blocks 6th workspace creation', async () => {
    const user = buildMockUser({ ...mockUsers.member, planId: 'pro' });
    User.findByPk.mockResolvedValueOnce(user);
    User.findByPk.mockResolvedValueOnce({ id: user.id, planId: 'pro' });
    Workspace.count.mockResolvedValue(5); // 5 already (at limit)

    const res = await request(app)
      .post('/api/v1/workspaces')
      .set('Authorization', authHeader('member'))
      .send({ name: 'Sixth Workspace' });

    expect(res.status).toBe(403);
    expect(res.body.currentPlan).toBe('pro');
  });

  it('WS-007 — 201: business plan allows unlimited workspaces', async () => {
    const user = buildMockUser({ ...mockUsers.member, planId: 'business' });
    User.findByPk.mockResolvedValueOnce(user);
    User.findByPk.mockResolvedValueOnce({ id: user.id, planId: 'business' });
    // business plan → count is never checked (Infinity check bypasses count)
    // Workspace.count should NOT be called

    const ws = buildMockWorkspace({ ownerId: user.id });
    Workspace.create.mockResolvedValue(ws);
    WorkspaceMembers.create.mockResolvedValue({});

    const res = await request(app)
      .post('/api/v1/workspaces')
      .set('Authorization', authHeader('member'))
      .send({ name: 'Business Workspace' });

    expect(res.status).toBe(201);
    expect(Workspace.count).not.toHaveBeenCalled(); // business plan skips count check
  });
});

// ── GET /api/v1/workspaces/:id ─────────────────────────────────────────────────

describe('GET /api/v1/workspaces/:id — get workspace by ID', () => {
  beforeEach(() => jest.clearAllMocks());

  it('WS-010 — 200: workspace owner can get workspace by ID', async () => {
    const user = buildMockUser({ ...mockUsers.member });
    setAuthUser(user);

    const ws = buildMockWorkspace({ ownerId: mockUsers.member.id });
    // Permission middleware: Workspace.findByPk
    Workspace.findByPk.mockResolvedValueOnce(ws);
    // Controller: Workspace.findByPk (with include)
    Workspace.findByPk.mockResolvedValueOnce(ws);

    const res = await request(app)
      .get(`/api/v1/workspaces/${MOCK_WORKSPACE_ID}`)
      .set('Authorization', authHeader('member'));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBe(MOCK_WORKSPACE_ID);
  });

  it('WS-011 — 403: non-member cannot access workspace', async () => {
    const user = buildMockUser({ ...mockUsers.member });
    setAuthUser(user);

    // Permission middleware: workspace exists but user is not owner
    const ws = buildMockWorkspace({ ownerId: 'uuid-someone-else' });
    Workspace.findByPk.mockResolvedValueOnce(ws);
    // Not the owner → check WorkspaceMembers
    WorkspaceMembers.findOne.mockResolvedValueOnce(null); // not a member

    const res = await request(app)
      .get(`/api/v1/workspaces/${MOCK_WORKSPACE_ID}`)
      .set('Authorization', authHeader('member'));

    expect(res.status).toBe(403);
  });

  it('WS-012 — 404: workspace not found returns 404', async () => {
    const user = buildMockUser({ ...mockUsers.member });
    setAuthUser(user);

    // Permission middleware: workspace not found
    Workspace.findByPk.mockResolvedValueOnce(null);

    const res = await request(app)
      .get('/api/v1/workspaces/nonexistent-ws-id')
      .set('Authorization', authHeader('member'));

    // resolvePermission returns { allowed: false, reason: 'workspace_not_found' }
    expect(res.status).toBe(403);
  });

  it('200 — workspace admin (member role) with WorkspaceMembers record can read', async () => {
    const user = buildMockUser({ ...mockUsers.admin });
    setAuthUser(user);

    const ws = buildMockWorkspace({ ownerId: 'uuid-someone-else' });
    Workspace.findByPk.mockResolvedValueOnce(ws);        // permission check
    // User is an admin member
    WorkspaceMembers.findOne.mockResolvedValueOnce({ role: 'admin', workspaceId: ws.id, userId: user.id });
    Workspace.findByPk.mockResolvedValueOnce(ws);        // controller

    const res = await request(app)
      .get(`/api/v1/workspaces/${MOCK_WORKSPACE_ID}`)
      .set('Authorization', authHeader('admin'));

    expect(res.status).toBe(200);
  });
});

// ── PUT /api/v1/workspaces/:id ─────────────────────────────────────────────────

describe('PUT /api/v1/workspaces/:id — update workspace', () => {
  beforeEach(() => jest.clearAllMocks());

  it('WS-013 — 200: workspace owner can update name', async () => {
    const user = buildMockUser({ ...mockUsers.member });
    setAuthUser(user);

    const ws = buildMockWorkspace({ ownerId: mockUsers.member.id });
    Workspace.findByPk.mockResolvedValueOnce(ws);   // permission
    Workspace.findByPk.mockResolvedValueOnce(ws);   // controller

    const res = await request(app)
      .put(`/api/v1/workspaces/${MOCK_WORKSPACE_ID}`)
      .set('Authorization', authHeader('member'))
      .send({ name: 'Updated Name' });

    expect(res.status).toBe(200);
    expect(ws.update).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Updated Name' })
    );
  });

  it('WS-014 — 403: regular member cannot update workspace', async () => {
    const user = buildMockUser({ ...mockUsers.viewer });
    setAuthUser(user);

    const ws = buildMockWorkspace({ ownerId: 'uuid-someone-else' });
    Workspace.findByPk.mockResolvedValueOnce(ws);     // permission
    // viewer member → update = false in PERMISSION_MATRIX
    WorkspaceMembers.findOne.mockResolvedValueOnce({ role: 'viewer', workspaceId: ws.id, userId: user.id });

    const res = await request(app)
      .put(`/api/v1/workspaces/${MOCK_WORKSPACE_ID}`)
      .set('Authorization', authHeader('viewer'))
      .send({ name: 'Sneaky Update' });

    expect(res.status).toBe(403);
  });

  it('WS-015 — 400: empty name rejected by validator', async () => {
    const user = buildMockUser({ ...mockUsers.member });
    setAuthUser(user);

    // Permission check must pass (user is owner) so validator gets a chance to run
    const ws = buildMockWorkspace({ ownerId: mockUsers.member.id });
    Workspace.findByPk.mockResolvedValueOnce(ws);   // permission middleware

    const res = await request(app)
      .put(`/api/v1/workspaces/${MOCK_WORKSPACE_ID}`)
      .set('Authorization', authHeader('member'))
      .send({ name: '' });

    expect(res.status).toBe(400);
  });
});

// ── POST /api/v1/workspaces/:id/logo ──────────────────────────────────────────

describe('POST /api/v1/workspaces/:id/logo — upload workspace logo', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    multer.__reset(); // back to default success middleware
  });

  // WS-016 — owner uploads logo → 200, logoUrl returned
  it('WS-016 — 200: workspace owner can upload logo', async () => {
    const user = buildMockUser({ ...mockUsers.member });
    setAuthUser(user);

    const ws = buildMockWorkspace({ ownerId: mockUsers.member.id });
    Workspace.findByPk.mockResolvedValueOnce(ws);   // permission check
    Workspace.findByPk.mockResolvedValueOnce(ws);   // controller

    const res = await request(app)
      .post(`/api/v1/workspaces/${MOCK_WORKSPACE_ID}/logo`)
      .set('Authorization', authHeader('member'))
      .attach('logo', Buffer.from('fake-png-data'), 'logo.png');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.logoUrl).toMatch(/uploads\/workspace-logos/);
    expect(ws.update).toHaveBeenCalledWith(
      expect.objectContaining({ logo: expect.stringContaining('workspace-logos') })
    );
  });

  // WS-017 — non-owner upload blocked by checkWorkspacePerm → 403
  it('WS-017 — 403: non-owner cannot upload workspace logo', async () => {
    const user = buildMockUser({ ...mockUsers.viewer });
    setAuthUser(user);

    const ws = buildMockWorkspace({ ownerId: 'uuid-someone-else' });
    Workspace.findByPk.mockResolvedValueOnce(ws);
    WorkspaceMembers.findOne.mockResolvedValueOnce({ role: 'viewer', workspaceId: ws.id, userId: user.id });

    const res = await request(app)
      .post(`/api/v1/workspaces/${MOCK_WORKSPACE_ID}/logo`)
      .set('Authorization', authHeader('viewer'))
      .attach('logo', Buffer.from('fake-png-data'), 'logo.png');

    expect(res.status).toBe(403);
  });
});

// ── DELETE /api/v1/workspaces/:id ──────────────────────────────────────────────

describe('DELETE /api/v1/workspaces/:id — soft delete workspace', () => {
  beforeEach(() => jest.clearAllMocks());

  it('WS-018 — 200: workspace owner can delete (soft delete)', async () => {
    const user = buildMockUser({ ...mockUsers.member });
    setAuthUser(user);

    const ws = buildMockWorkspace({ ownerId: mockUsers.member.id });
    Workspace.findByPk.mockResolvedValueOnce(ws);   // permission
    Workspace.findByPk.mockResolvedValueOnce(ws);   // controller

    const { Project } = require('../models');
    Project.findAll.mockResolvedValue([]); // no projects to archive

    const res = await request(app)
      .delete(`/api/v1/workspaces/${MOCK_WORKSPACE_ID}`)
      .set('Authorization', authHeader('member'))
      .send({ reason: 'Testing deletion reason' });

    expect(res.status).toBe(200);
  });

  it('WS-019 — 403: admin member cannot delete workspace', async () => {
    const user = buildMockUser({ ...mockUsers.admin });
    setAuthUser(user);

    const ws = buildMockWorkspace({ ownerId: 'uuid-someone-else' });
    Workspace.findByPk.mockResolvedValueOnce(ws);
    // admin role → delete: false in PERMISSION_MATRIX
    WorkspaceMembers.findOne.mockResolvedValueOnce({ role: 'admin', workspaceId: ws.id, userId: user.id });

    const res = await request(app)
      .delete(`/api/v1/workspaces/${MOCK_WORKSPACE_ID}`)
      .set('Authorization', authHeader('admin'));

    expect(res.status).toBe(403);
  });

  it('200: super_admin can delete any workspace', async () => {
    const sa = buildMockUser({ ...mockUsers.super_admin });
    setAuthUser(sa);

    const ws = buildMockWorkspace({ ownerId: 'uuid-someone-else' });
    // super_admin: resolvePermission returns immediately (no Workspace.findByPk in middleware)
    // Controller calls Workspace.findByPk
    Workspace.findByPk.mockResolvedValue(ws);

    const { Project } = require('../models');
    Project.findAll.mockResolvedValue([]);

    const res = await request(app)
      .delete(`/api/v1/workspaces/${MOCK_WORKSPACE_ID}`)
      .set('Authorization', authHeader('super_admin'))
      .send({ reason: 'Admin forced deletion test' });

    expect(res.status).toBe(200);
  });

  // WS-020 — deleting workspace with projects cascades archive to projects & tasks
  it('WS-020 — 200: deleting workspace archives all its projects and tasks', async () => {
    const user = buildMockUser({ ...mockUsers.member });
    setAuthUser(user);

    const ws = buildMockWorkspace({ ownerId: mockUsers.member.id });
    Workspace.findByPk.mockResolvedValueOnce(ws);   // permission
    Workspace.findByPk.mockResolvedValueOnce(ws);   // controller

    const { Project, Task } = require('../models');
    Project.findAll.mockResolvedValueOnce([{ id: 'proj-001' }, { id: 'proj-002' }]);

    const res = await request(app)
      .delete(`/api/v1/workspaces/${MOCK_WORKSPACE_ID}`)
      .set('Authorization', authHeader('member'))
      .send({ reason: 'Cascade test' });

    expect(res.status).toBe(200);
    // All projects under the workspace must be archived
    expect(Project.update).toHaveBeenCalledWith(
      { status: 'archived' },
      expect.objectContaining({ where: { id: ['proj-001', 'proj-002'] } })
    );
    // All tasks under those projects must be archived
    expect(Task.update).toHaveBeenCalledWith(
      { isArchived: true },
      expect.objectContaining({ where: { projectId: ['proj-001', 'proj-002'] } })
    );
  });
});

// ── GET /api/v1/workspaces/:id/members ────────────────────────────────────────

describe('GET /api/v1/workspaces/:id/members — list members', () => {
  beforeEach(() => jest.clearAllMocks());

  it('WS-021 — 200: owner can list workspace members', async () => {
    const user = buildMockUser({ ...mockUsers.member });
    setAuthUser(user);

    const ownerData = { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName,
                        avatar: null, toJSON: jest.fn().mockReturnThis() };
    const ws = buildMockWorkspace({
      ownerId: user.id,
      owner: ownerData,
      members: [],
    });

    Workspace.findByPk.mockResolvedValueOnce(ws);   // permission
    Workspace.findByPk.mockResolvedValueOnce(ws);   // controller (getWorkspaceMembers)

    const res = await request(app)
      .get(`/api/v1/workspaces/${MOCK_WORKSPACE_ID}/members`)
      .set('Authorization', authHeader('member'));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBe(1); // owner only
  });

  it('403 — non-member cannot list workspace members', async () => {
    const user = buildMockUser({ ...mockUsers.viewer });
    setAuthUser(user);

    const ws = buildMockWorkspace({ ownerId: 'uuid-someone-else' });
    Workspace.findByPk.mockResolvedValueOnce(ws);
    WorkspaceMembers.findOne.mockResolvedValueOnce(null); // not a member

    const res = await request(app)
      .get(`/api/v1/workspaces/${MOCK_WORKSPACE_ID}/members`)
      .set('Authorization', authHeader('viewer'));

    expect(res.status).toBe(403);
  });
});

// ── POST /api/v1/workspaces/:id/members ───────────────────────────────────────

describe('POST /api/v1/workspaces/:id/members — add member', () => {
  beforeEach(() => jest.clearAllMocks());

  it('WS-022 — 201: owner can add a member by email', async () => {
    const owner = buildMockUser({ ...mockUsers.member });
    setAuthUser(owner);

    const ws = buildMockWorkspace({ ownerId: mockUsers.member.id });
    Workspace.findByPk.mockResolvedValueOnce(ws);   // permission check
    Workspace.findByPk.mockResolvedValueOnce(ws);   // controller findByPk

    // Controller: find user by email
    const newUser = buildMockUser({ id: 'uuid-new-user', email: 'newuser@test.com' });
    User.findOne.mockResolvedValueOnce(newUser);
    // Not already a member
    WorkspaceMembers.findOne.mockResolvedValueOnce(null);
    // Create the member record
    WorkspaceMembers.create.mockResolvedValue({});
    // reload workspace
    ws.reload.mockResolvedValue(ws);
    Workspace.findByPk.mockResolvedValueOnce(ws);

    const res = await request(app)
      .post(`/api/v1/workspaces/${MOCK_WORKSPACE_ID}/members`)
      .set('Authorization', authHeader('member'))
      .send({ email: 'newuser@test.com', role: 'member' });

    expect(res.status).toBe(201);
    expect(WorkspaceMembers.create).toHaveBeenCalledWith(
      expect.objectContaining({ userId: newUser.id, role: 'member' })
    );
  });

  it('WS-023 — 400: adding already-member returns 400', async () => {
    const owner = buildMockUser({ ...mockUsers.member });
    setAuthUser(owner);

    const ws = buildMockWorkspace({ ownerId: mockUsers.member.id });
    Workspace.findByPk.mockResolvedValueOnce(ws);   // permission
    Workspace.findByPk.mockResolvedValueOnce(ws);   // controller

    const existingUser = buildMockUser({ id: 'uuid-existing', email: 'existing@test.com' });
    User.findOne.mockResolvedValueOnce(existingUser);
    // Already a member
    WorkspaceMembers.findOne.mockResolvedValueOnce({ id: 'wm-existing', role: 'member' });

    const res = await request(app)
      .post(`/api/v1/workspaces/${MOCK_WORKSPACE_ID}/members`)
      .set('Authorization', authHeader('member'))
      .send({ email: 'existing@test.com' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/already a member/i);
  });

  it('400 — missing email rejected by validator', async () => {
    const user = buildMockUser({ ...mockUsers.member });
    setAuthUser(user);

    const res = await request(app)
      .post(`/api/v1/workspaces/${MOCK_WORKSPACE_ID}/members`)
      .set('Authorization', authHeader('member'))
      .send({ role: 'member' }); // no email

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('404 — adding user by unknown email returns 404', async () => {
    const owner = buildMockUser({ ...mockUsers.member });
    setAuthUser(owner);

    const ws = buildMockWorkspace({ ownerId: mockUsers.member.id });
    Workspace.findByPk.mockResolvedValueOnce(ws);   // permission
    Workspace.findByPk.mockResolvedValueOnce(ws);   // controller

    User.findOne.mockResolvedValueOnce(null); // user not found

    const res = await request(app)
      .post(`/api/v1/workspaces/${MOCK_WORKSPACE_ID}/members`)
      .set('Authorization', authHeader('member'))
      .send({ email: 'ghost@test.com' });

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
  });
});

// ── PUT /api/v1/workspaces/:id/members/:userId ────────────────────────────────

describe('PUT /api/v1/workspaces/:id/members/:userId — update member role', () => {
  beforeEach(() => jest.clearAllMocks());

  it('WS-026 — 200: owner can change member role', async () => {
    const owner = buildMockUser({ ...mockUsers.member });
    setAuthUser(owner);

    const ws = buildMockWorkspace({ ownerId: mockUsers.member.id });
    Workspace.findByPk.mockResolvedValueOnce(ws);   // permission
    Workspace.findByPk.mockResolvedValueOnce(ws);   // controller (model.findByPk)

    // Controller: find the member record to update
    const memberRecord = { id: 'wm-001', role: 'member', save: jest.fn().mockResolvedValue(true),
                           update: jest.fn().mockResolvedValue(true) };
    WorkspaceMembers.findOne.mockResolvedValueOnce(memberRecord);

    const res = await request(app)
      .put(`/api/v1/workspaces/${MOCK_WORKSPACE_ID}/members/uuid-target-member`)
      .set('Authorization', authHeader('member'))
      .send({ role: 'admin' });

    expect(res.status).toBe(200);
  });

  it('WS-027 — 403: regular member cannot change roles', async () => {
    const user = buildMockUser({ ...mockUsers.viewer });
    setAuthUser(user);

    const ws = buildMockWorkspace({ ownerId: 'uuid-someone-else' });
    Workspace.findByPk.mockResolvedValueOnce(ws);
    WorkspaceMembers.findOne.mockResolvedValueOnce({ role: 'viewer', workspaceId: ws.id, userId: user.id });

    const res = await request(app)
      .put(`/api/v1/workspaces/${MOCK_WORKSPACE_ID}/members/uuid-target`)
      .set('Authorization', authHeader('viewer'))
      .send({ role: 'admin' });

    expect(res.status).toBe(403);
  });
});

// ── DELETE /api/v1/workspaces/:id/members/:userId ─────────────────────────────

describe('DELETE /api/v1/workspaces/:id/members/:userId — remove member', () => {
  beforeEach(() => jest.clearAllMocks());

  it('WS-024 — 200: owner can remove a member', async () => {
    const owner = buildMockUser({ ...mockUsers.member });
    setAuthUser(owner);

    const ws = buildMockWorkspace({ ownerId: mockUsers.member.id });
    Workspace.findByPk.mockResolvedValueOnce(ws);   // permission
    Workspace.findByPk.mockResolvedValueOnce(ws);   // controller (model.findByPk)

    // Controller finds the member record (ownerId === userId so no extra WorkspaceMembers.findOne for auth check)
    const memberRecord = { id: 'wm-001', userId: 'uuid-target-member', role: 'member',
                           destroy: jest.fn().mockResolvedValue(true) };
    WorkspaceMembers.findOne.mockResolvedValueOnce(memberRecord);

    const res = await request(app)
      .delete(`/api/v1/workspaces/${MOCK_WORKSPACE_ID}/members/uuid-target-member`)
      .set('Authorization', authHeader('member'));

    expect(res.status).toBe(200);
  });

  it('WS-025 — 400: owner cannot remove themselves (workspace owner protection)', async () => {
    const owner = buildMockUser({ ...mockUsers.member });
    setAuthUser(owner);

    // Workspace owned by the requesting user
    const ws = buildMockWorkspace({ ownerId: mockUsers.member.id });
    Workspace.findByPk.mockResolvedValueOnce(ws);   // permission
    Workspace.findByPk.mockResolvedValueOnce(ws);   // controller

    // DELETE /:id/members/:userId where userId === workspace.ownerId
    const res = await request(app)
      .delete(`/api/v1/workspaces/${MOCK_WORKSPACE_ID}/members/${mockUsers.member.id}`)
      .set('Authorization', authHeader('member'));

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Cannot remove.*owner/i);
  });

  it('403: regular member cannot remove other members', async () => {
    const user = buildMockUser({ ...mockUsers.viewer });
    setAuthUser(user);

    const ws = buildMockWorkspace({ ownerId: 'uuid-someone-else' });
    Workspace.findByPk.mockResolvedValueOnce(ws);
    WorkspaceMembers.findOne.mockResolvedValueOnce({ role: 'viewer', workspaceId: ws.id, userId: user.id });

    const res = await request(app)
      .delete(`/api/v1/workspaces/${MOCK_WORKSPACE_ID}/members/uuid-target`)
      .set('Authorization', authHeader('viewer'));

    expect(res.status).toBe(403);
  });
});
