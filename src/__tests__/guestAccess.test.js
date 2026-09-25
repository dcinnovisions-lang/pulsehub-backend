/**
 * Guest Access endpoint tests
 * Runner : Jest + Supertest
 * DB     : Fully mocked — no real Postgres connection needed
 *
 * Endpoints covered:
 *   GET    /api/v1/guest-access
 *   POST   /api/v1/guest-access
 *   DELETE /api/v1/guest-access/:id
 *
 * These routes previously had NO permission check beyond `authenticate` —
 * any logged-in user, regardless of role or workspace membership, could
 * grant or revoke guest access to arbitrary projects/workspaces/documents
 * by ID, despite the route docs claiming "@access Private (admin/owner)".
 * The regression tests below (GA-002, GA-006) specifically assert the fix:
 * a plain workspace member cannot grant or revoke guest access.
 */

const WS_ID = '00000000-0000-4000-8000-000000000001';
const PRJ_ID = '00000000-0000-4000-8000-000000000002';
const GA_ID = '00000000-0000-4000-8000-000000000003';

jest.mock('../models', () => ({
  User: { findByPk: jest.fn(), findOne: jest.fn() },
  Workspace: { findByPk: jest.fn() },
  WorkspaceMembers: { findOne: jest.fn() },
  Project: { findByPk: jest.fn() },
  GuestAccess: {
    findAll: jest.fn(), findByPk: jest.fn(), findOrCreate: jest.fn(),
  },
}));

jest.mock('../utils/logger', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
}));

const request = require('supertest');
const app = require('../app');
const { User, Workspace, WorkspaceMembers, Project, GuestAccess } = require('../models');
const { authHeader, mockUsers } = require('./helpers/jwt');

const buildMockUser = (overrides = {}) => ({
  ...mockUsers.member,
  update: jest.fn().mockResolvedValue(true),
  toJSON: jest.fn().mockReturnThis(),
  ...overrides,
});

/** authenticate() calls User.findByPk(decoded.id) once — queue that first. */
const setAuthUser = (user) => {
  User.findByPk.mockResolvedValueOnce(user);
};

const buildWorkspace = (ownerId) => ({ id: WS_ID, ownerId });

beforeEach(() => jest.clearAllMocks());

describe('POST /api/v1/guest-access — create guest access', () => {
  it('GA-001 — 201: workspace owner grants guest access', async () => {
    const owner = buildMockUser({ ...mockUsers.pm, id: 'owner-uuid' });
    setAuthUser(owner);
    Project.findByPk.mockResolvedValueOnce({ workspaceId: WS_ID });
    Workspace.findByPk.mockResolvedValueOnce(buildWorkspace('owner-uuid'));
    User.findOne.mockResolvedValueOnce({ id: 'target-uuid', email: 'guest@example.com' });
    GuestAccess.findOrCreate.mockResolvedValueOnce([{ id: GA_ID }, true]);

    const res = await request(app)
      .post('/api/v1/guest-access')
      .set('Authorization', authHeader('pm'))
      .send({ email: 'guest@example.com', resourceType: 'project', resourceId: PRJ_ID });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
  });

  it('GA-002 — 403: a plain workspace member (not admin/owner) cannot grant guest access — regression test for the missing-authz bug', async () => {
    const member = buildMockUser({ ...mockUsers.member });
    setAuthUser(member);
    Project.findByPk.mockResolvedValueOnce({ workspaceId: WS_ID });
    Workspace.findByPk.mockResolvedValueOnce(buildWorkspace('someone-else-uuid'));
    WorkspaceMembers.findOne.mockResolvedValueOnce({ role: 'member' }); // workspace-scoped role, not admin/owner

    const res = await request(app)
      .post('/api/v1/guest-access')
      .set('Authorization', authHeader('member'))
      .send({ email: 'guest@example.com', resourceType: 'project', resourceId: PRJ_ID });

    expect(res.status).toBe(403);
    expect(GuestAccess.findOrCreate).not.toHaveBeenCalled();
  });

  it('GA-003 — 403: a user with no workspace membership at all cannot grant guest access', async () => {
    const outsider = buildMockUser({ ...mockUsers.viewer });
    setAuthUser(outsider);
    Project.findByPk.mockResolvedValueOnce({ workspaceId: WS_ID });
    Workspace.findByPk.mockResolvedValueOnce(buildWorkspace('someone-else-uuid'));
    WorkspaceMembers.findOne.mockResolvedValueOnce(null);

    const res = await request(app)
      .post('/api/v1/guest-access')
      .set('Authorization', authHeader('viewer'))
      .send({ email: 'guest@example.com', resourceType: 'project', resourceId: PRJ_ID });

    expect(res.status).toBe(403);
  });

  it('GA-004 — 201: super_admin bypasses workspace-role checks entirely', async () => {
    const sa = buildMockUser({ ...mockUsers.super_admin });
    setAuthUser(sa);
    Project.findByPk.mockResolvedValueOnce({ workspaceId: WS_ID });
    User.findOne.mockResolvedValueOnce({ id: 'target-uuid', email: 'guest@example.com' });
    GuestAccess.findOrCreate.mockResolvedValueOnce([{ id: GA_ID }, true]);

    const res = await request(app)
      .post('/api/v1/guest-access')
      .set('Authorization', authHeader('super_admin'))
      .send({ email: 'guest@example.com', resourceType: 'project', resourceId: PRJ_ID });

    expect(res.status).toBe(201);
    // super_admin bypass means Workspace.findByPk is never consulted for this check
    expect(Workspace.findByPk).not.toHaveBeenCalled();
  });

  it('400: missing required fields rejected before any DB lookup', async () => {
    setAuthUser(buildMockUser());

    const res = await request(app)
      .post('/api/v1/guest-access')
      .set('Authorization', authHeader('member'))
      .send({ email: 'guest@example.com' });

    expect(res.status).toBe(400);
  });

  it('400: invalid email format rejected by validator', async () => {
    setAuthUser(buildMockUser());

    const res = await request(app)
      .post('/api/v1/guest-access')
      .set('Authorization', authHeader('member'))
      .send({ email: 'not-an-email', resourceType: 'project', resourceId: PRJ_ID });

    expect(res.status).toBe(400);
  });
});

describe('GET /api/v1/guest-access — list guest access', () => {
  it('GA-005 — 200: workspace admin lists guest access scoped to a project', async () => {
    const admin = buildMockUser({ ...mockUsers.admin });
    setAuthUser(admin);
    Project.findByPk.mockResolvedValueOnce({ workspaceId: WS_ID });
    Workspace.findByPk.mockResolvedValueOnce(buildWorkspace('someone-else-uuid'));
    WorkspaceMembers.findOne.mockResolvedValueOnce({ role: 'admin' });
    GuestAccess.findAll.mockResolvedValueOnce([{ id: GA_ID }]);

    const res = await request(app)
      .get(`/api/v1/guest-access?projectId=${PRJ_ID}`)
      .set('Authorization', authHeader('admin'));

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });

  it('400: non-super_admin requesting without a projectId is rejected (cannot list platform-wide)', async () => {
    setAuthUser(buildMockUser({ ...mockUsers.member }));

    const res = await request(app)
      .get('/api/v1/guest-access')
      .set('Authorization', authHeader('member'));

    expect(res.status).toBe(400);
    expect(GuestAccess.findAll).not.toHaveBeenCalled();
  });

  it('200: super_admin may list platform-wide with no projectId', async () => {
    setAuthUser(buildMockUser({ ...mockUsers.super_admin }));
    GuestAccess.findAll.mockResolvedValueOnce([]);

    const res = await request(app)
      .get('/api/v1/guest-access')
      .set('Authorization', authHeader('super_admin'));

    expect(res.status).toBe(200);
  });
});

describe('DELETE /api/v1/guest-access/:id — revoke guest access', () => {
  it('GA-006 — 403: a plain member cannot revoke another workspace\'s guest access — regression test', async () => {
    const member = buildMockUser({ ...mockUsers.member });
    setAuthUser(member);
    GuestAccess.findByPk.mockResolvedValueOnce({ id: GA_ID, workspaceId: WS_ID, destroy: jest.fn() });
    Workspace.findByPk.mockResolvedValueOnce(buildWorkspace('someone-else-uuid'));
    WorkspaceMembers.findOne.mockResolvedValueOnce({ role: 'member' });

    const res = await request(app)
      .delete(`/api/v1/guest-access/${GA_ID}`)
      .set('Authorization', authHeader('member'));

    expect(res.status).toBe(403);
  });

  it('200: workspace owner revokes guest access', async () => {
    const owner = buildMockUser({ ...mockUsers.pm, id: 'owner-uuid' });
    setAuthUser(owner);
    const destroy = jest.fn().mockResolvedValue(true);
    GuestAccess.findByPk.mockResolvedValueOnce({ id: GA_ID, workspaceId: WS_ID, destroy });
    Workspace.findByPk.mockResolvedValueOnce(buildWorkspace('owner-uuid'));

    const res = await request(app)
      .delete(`/api/v1/guest-access/${GA_ID}`)
      .set('Authorization', authHeader('pm'));

    expect(res.status).toBe(200);
    expect(destroy).toHaveBeenCalled();
  });

  it('404: revoking a non-existent record', async () => {
    setAuthUser(buildMockUser({ ...mockUsers.super_admin }));
    GuestAccess.findByPk.mockResolvedValueOnce(null);

    const res = await request(app)
      .delete(`/api/v1/guest-access/${GA_ID}`)
      .set('Authorization', authHeader('super_admin'));

    expect(res.status).toBe(404);
  });
});
