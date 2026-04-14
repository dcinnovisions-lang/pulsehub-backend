/**
 * AUTH-038, AUTH-039, AUTH-040 — Avatar upload endpoint
 * POST /api/v1/users/me/avatar
 *
 * Uses the manual mock at <rootDir>/__mocks__/multer.js
 * to control multer behaviour per test.
 */

jest.mock('multer'); // ← picks up __mocks__/multer.js automatically

jest.mock('../models', () => ({
  User: {
    findOne: jest.fn(),
    findByPk: jest.fn(),
    findAll: jest.fn(),
    findAndCountAll: jest.fn(),
    create: jest.fn(),
  },
  Workspace: {},
  WorkspaceMembers: {},
}));

jest.mock('../utils/logger', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
}));

jest.mock('../socket', () => ({
  emitChatMessage: jest.fn(),
  getIO: jest.fn(() => ({ to: jest.fn(() => ({ emit: jest.fn() })) })),
}));

const request = require('supertest');
const multer = require('multer');
const app = require('../app');
const { User } = require('../models');
const { signToken, mockUsers } = require('./helpers/jwt');

const buildMockUser = (overrides = {}) => ({
  ...mockUsers.member,
  update: jest.fn().mockResolvedValue(true),
  toJSON: jest.fn().mockReturnThis(),
  ...overrides,
});

const bearer = () => `Bearer ${signToken({ id: mockUsers.member.id })}`;

describe('POST /api/v1/users/me/avatar — avatar upload', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    multer.__reset(); // back to default success middleware
  });

  // AUTH-038 — valid image upload → 200, avatarUrl returned
  it('AUTH-038 — 200 — valid image upload stores avatarUrl', async () => {
    const user = buildMockUser();
    User.findByPk.mockResolvedValue(user);

    const res = await request(app)
      .post('/api/v1/users/me/avatar')
      .set('Authorization', bearer())
      .attach('avatar', Buffer.from('fake-png-data'), 'photo.png');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.avatarUrl).toMatch(/uploads\/avatars/);
    expect(user.update).toHaveBeenCalledWith(
      expect.objectContaining({ avatar: expect.stringContaining('avatar_') })
    );
  });

  // AUTH-039 — file too large → multer LIMIT_FILE_SIZE → non-200
  it('AUTH-039 — non-200 — file exceeding size limit is rejected', async () => {
    multer.__setMiddleware((_req, _res, next) =>
      next(new multer.MulterError('LIMIT_FILE_SIZE'))
    );
    const user = buildMockUser();
    User.findByPk.mockResolvedValue(user);

    const res = await request(app)
      .post('/api/v1/users/me/avatar')
      .set('Authorization', bearer())
      .attach('avatar', Buffer.alloc(1024), 'large.png');

    expect(res.status).not.toBe(200);
  });

  // AUTH-040 — wrong file type → fileFilter error → non-200
  it('AUTH-040 — non-200 — non-image file rejected by fileFilter', async () => {
    multer.__setMiddleware((_req, _res, next) =>
      next(new Error('Only image files allowed'))
    );
    const user = buildMockUser();
    User.findByPk.mockResolvedValue(user);

    const res = await request(app)
      .post('/api/v1/users/me/avatar')
      .set('Authorization', bearer())
      .attach('avatar', Buffer.from('%PDF-1.4'), 'doc.pdf');

    expect(res.status).not.toBe(200);
  });

  it('401 — unauthenticated request is rejected', async () => {
    const res = await request(app)
      .post('/api/v1/users/me/avatar')
      .attach('avatar', Buffer.from('data'), 'photo.png');
    expect(res.status).toBe(401);
  });
});
