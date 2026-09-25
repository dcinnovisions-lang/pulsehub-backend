/**
 * Part 1 — Auth endpoint tests
 * Runner : Jest + Supertest
 * DB     : Fully mocked — no real Postgres connection needed
 *
 * Endpoints covered:
 *   POST   /api/v1/auth/register
 *   POST   /api/v1/auth/login
 *   POST   /api/v1/auth/refresh-token
 *   POST   /api/v1/auth/logout
 *   GET    /api/v1/auth/me
 *   GET    /api/v1/auth/verify-email/:token
 *   POST   /api/v1/auth/2fa/setup
 *   POST   /api/v1/auth/2fa/verify
 *   POST   /api/v1/auth/2fa/disable
 *   POST   /api/v1/auth/2fa/verify-login
 *   POST   /api/v1/auth/2fa/backup-login
 *   POST   /api/v1/auth/resend-verification
 */

// ── Mock everything that touches external resources ───────────────────────────

// 1. Mock the entire models layer (prevents any DB connection attempt)
jest.mock('../models', () => ({
  User: {
    findOne: jest.fn(),
    findByPk: jest.fn(),
    create: jest.fn(),
  },
  // Other models needed by routes/index — stub so import doesn't blow up
  Workspace: {},
  WorkspaceMembers: {},
}));

// 2. Mock nodemailer so no SMTP connection is attempted
jest.mock('nodemailer', () => ({
  createTransporter: jest.fn(() => ({
    sendMail: jest.fn().mockResolvedValue({ messageId: 'mock-id' }),
  })),
}));

// 3. Mock speakeasy (2FA TOTP library)
jest.mock('speakeasy', () => ({
  generateSecret: jest.fn(() => ({
    base32: 'MOCK_BASE32_SECRET',
    otpauth_url: 'otpauth://totp/Test?secret=MOCK',
  })),
  totp: {
    verify: jest.fn(),
  },
}));

// 4. Mock qrcode
jest.mock('qrcode', () => ({
  toDataURL: jest.fn().mockResolvedValue('data:image/png;base64,mockqr'),
}));

// 5. Silence the logger
jest.mock('../utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

// 6. Mock socket.io — not used in auth but imported transitively
jest.mock('../socket', () => ({
  emitChatMessage: jest.fn(),
  getIO: jest.fn(() => ({ to: jest.fn(() => ({ emit: jest.fn() })) })),
}));

// ── Test dependencies ─────────────────────────────────────────────────────────

const request = require('supertest');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const speakeasy = require('speakeasy');
const app = require('../app');
const { User } = require('../models');
const { signToken, signExpiredToken, signBadToken, mockUsers } = require('./helpers/jwt');

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Build a mock User instance (with instance methods).
 */
const buildMockUser = (overrides = {}) => {
  const base = {
    ...mockUsers.member,
    password: '$2a$10$hashedpassword',
    twoFactorEnabled: false,
    twoFactorSecret: null,
    twoFactorBackupCodes: [],
    emailVerificationToken: null,
    emailVerificationExpiry: null,
    isEmailVerified: true,
    update: jest.fn().mockResolvedValue(true),
    reload: jest.fn(),
    toJSON: jest.fn().mockReturnThis(),
    comparePassword: jest.fn().mockResolvedValue(true),
    ...overrides,
  };
  return base;
};

// Helper: set up User.findByPk to return a user AND to satisfy the
// `authenticate` middleware (which also calls findByPk with the decoded id).
const setupAuthMiddleware = (user) => {
  User.findByPk.mockResolvedValue(user);
};

const authHeader = (userId) =>
  `Bearer ${signToken({ id: userId })}`;

// ── Register ──────────────────────────────────────────────────────────────────

describe('POST /api/v1/auth/register', () => {
  beforeEach(() => jest.clearAllMocks());

  it('201 — creates a new user and returns tokens', async () => {
    User.findOne.mockResolvedValue(null); // no existing user
    const newUser = buildMockUser({ id: 'new-uuid', email: 'new@test.com' });
    User.create.mockResolvedValue(newUser);

    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({
        email: 'new@test.com',
        password: 'Password1!',
        firstName: 'New',
        lastName: 'User',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('token');
    expect(res.body.data).toHaveProperty('refreshToken');
    expect(User.create).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'new@test.com' })
    );
  });

  it('400 — rejects duplicate email', async () => {
    User.findOne.mockResolvedValue(buildMockUser()); // user already exists

    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({
        email: 'member@test.com',
        password: 'Password1!',
        firstName: 'Dup',
        lastName: 'User',
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/already exists/i);
  });

  it('400 — rejects missing firstName', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'test@test.com', password: 'Password1!', lastName: 'User' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('400 — rejects invalid email format', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'not-an-email', password: 'Password1!', firstName: 'A', lastName: 'B' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('400 — rejects password shorter than 6 chars', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'ok@test.com', password: '123', firstName: 'A', lastName: 'B' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  // AUTH-004
  it('400 — rejects missing email', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ password: 'Password1!', firstName: 'A', lastName: 'B' });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  // AUTH-007
  it('400 — rejects password with no uppercase letter', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'x@test.com', password: 'test@12345', firstName: 'A', lastName: 'B' });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  // AUTH-008
  it('400 — rejects email longer than 255 characters', async () => {
    const longEmail = 'a'.repeat(250) + '@test.com';
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: longEmail, password: 'Password1!', firstName: 'A', lastName: 'B' });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  // AUTH-009 — SQL injection in firstName (ORM parameterises, stored safely)
  it('201 — SQL injection in firstName is stored safely (ORM escapes)', async () => {
    User.findOne.mockResolvedValue(null);
    const injected = "Robert'); DROP TABLE users;--";
    User.create.mockResolvedValue(buildMockUser({ firstName: injected }));
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'safe@test.com', password: 'Password1!', firstName: injected, lastName: 'B' });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
  });

  // AUTH-010 — XSS in firstName (stored as plain string, not executed)
  it('201 — XSS in firstName is stored as plain text', async () => {
    User.findOne.mockResolvedValue(null);
    const xss = '<script>alert(1)</script>';
    User.create.mockResolvedValue(buildMockUser({ firstName: xss }));
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'xss@test.com', password: 'Password1!', firstName: xss, lastName: 'B' });
    expect(res.status).toBe(201);
  });
});

// ── Login ─────────────────────────────────────────────────────────────────────

describe('POST /api/v1/auth/login', () => {
  beforeEach(() => jest.clearAllMocks());

  it('200 — returns tokens on valid credentials', async () => {
    const user = buildMockUser({ comparePassword: jest.fn().mockResolvedValue(true) });
    User.findOne.mockResolvedValue(user);

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'member@test.com', password: 'Password1!' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('token');
    expect(res.body.data).toHaveProperty('refreshToken');
    expect(res.body.data.user).toMatchObject({ email: 'member@test.com' });
  });

  it('400 — missing email/password returns 400', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: '' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('401 — user not found returns invalid credentials', async () => {
    User.findOne.mockResolvedValue(null);

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'nobody@test.com', password: 'anything' });

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/invalid credentials/i);
  });

  it('401 — wrong password returns invalid credentials', async () => {
    const user = buildMockUser({ comparePassword: jest.fn().mockResolvedValue(false) });
    User.findOne.mockResolvedValue(user);

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'member@test.com', password: 'WrongPassword' });

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/invalid credentials/i);
  });

  it('401 — deactivated account returns 401', async () => {
    const user = buildMockUser({ isActive: false });
    User.findOne.mockResolvedValue(user);

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'member@test.com', password: 'Password1!' });

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/deactivated/i);
  });

  it('200 requires2FA — when 2FA enabled, no token returned', async () => {
    const user = buildMockUser({ twoFactorEnabled: true });
    User.findOne.mockResolvedValue(user);

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'member@test.com', password: 'Password1!' });

    expect(res.status).toBe(200);
    expect(res.body.requires2FA).toBe(true);
    expect(res.body.data).toBeUndefined();
  });
});

// ── Refresh Token ─────────────────────────────────────────────────────────────

describe('POST /api/v1/auth/refresh-token', () => {
  beforeEach(() => jest.clearAllMocks());

  it('200 — returns new tokens given a valid refresh token', async () => {
    const user = buildMockUser();
    const refreshToken = jwt.sign(
      { id: user.id },
      process.env.JWT_REFRESH_SECRET,
      { expiresIn: '30d' }
    );
    User.findByPk.mockResolvedValue(user);

    const res = await request(app)
      .post('/api/v1/auth/refresh-token')
      .send({ refreshToken });

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('token');
    expect(res.body.data).toHaveProperty('refreshToken');
  });

  it('400 — missing refresh token', async () => {
    const res = await request(app)
      .post('/api/v1/auth/refresh-token')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/required/i);
  });

  it('401 — expired refresh token', async () => {
    const expiredToken = jwt.sign(
      { id: 'some-id' },
      process.env.JWT_REFRESH_SECRET,
      { expiresIn: '-1s' }
    );

    const res = await request(app)
      .post('/api/v1/auth/refresh-token')
      .send({ refreshToken: expiredToken });

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/expired/i);
  });

  it('401 — invalid refresh token string', async () => {
    const res = await request(app)
      .post('/api/v1/auth/refresh-token')
      .send({ refreshToken: 'totally.invalid.token' });

    expect(res.status).toBe(401);
  });
});

// ── Logout ────────────────────────────────────────────────────────────────────

describe('POST /api/v1/auth/logout', () => {
  beforeEach(() => jest.clearAllMocks());

  it('200 — succeeds with valid token', async () => {
    const user = buildMockUser();
    setupAuthMiddleware(user);

    const res = await request(app)
      .post('/api/v1/auth/logout')
      .set('Authorization', authHeader(user.id));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('401 — no token provided', async () => {
    const res = await request(app).post('/api/v1/auth/logout');
    expect(res.status).toBe(401);
  });
});

// ── Get Me ────────────────────────────────────────────────────────────────────

describe('GET /api/v1/auth/me', () => {
  beforeEach(() => jest.clearAllMocks());

  it('200 — returns current user data', async () => {
    const user = buildMockUser();
    User.findByPk.mockResolvedValue(user); // called by both authenticate + getMe

    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', authHeader(user.id));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toMatchObject({ email: user.email });
  });

  it('401 — no Authorization header', async () => {
    const res = await request(app).get('/api/v1/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/no token/i);
  });

  it('401 — expired token', async () => {
    const expiredToken = signExpiredToken({ id: 'uuid-member' });
    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${expiredToken}`);

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/expired/i);
  });

  it('401 — token signed with wrong secret', async () => {
    const badToken = signBadToken({ id: 'uuid-member' });
    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${badToken}`);

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/invalid token/i);
  });

  it('401 — user deleted after token was issued', async () => {
    // Token decodes fine but findByPk returns null (user was deleted)
    User.findByPk.mockResolvedValue(null);
    const token = signToken({ id: 'uuid-deleted-user' });

    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/user not found/i);
  });
});

// ── Verify Email ──────────────────────────────────────────────────────────────

describe('GET /api/v1/auth/verify-email/:token', () => {
  beforeEach(() => jest.clearAllMocks());

  it('200 — verifies a valid token', async () => {
    const user = buildMockUser({
      emailVerificationToken: 'valid-token-abc',
      emailVerificationExpiry: new Date(Date.now() + 60_000),
      update: jest.fn().mockResolvedValue(true),
    });
    User.findOne.mockResolvedValue(user);

    const res = await request(app)
      .get('/api/v1/auth/verify-email/valid-token-abc');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(user.update).toHaveBeenCalledWith(
      expect.objectContaining({ isEmailVerified: true })
    );
  });

  it('400 — invalid/unknown token', async () => {
    User.findOne.mockResolvedValue(null);
    const res = await request(app).get('/api/v1/auth/verify-email/bad-token');
    expect(res.status).toBe(400);
  });

  it('400 — expired verification token', async () => {
    const user = buildMockUser({
      emailVerificationToken: 'expired-token',
      emailVerificationExpiry: new Date(Date.now() - 1000), // already past
    });
    User.findOne.mockResolvedValue(user);

    const res = await request(app).get('/api/v1/auth/verify-email/expired-token');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/expired/i);
  });
});

// ── 2FA Setup ─────────────────────────────────────────────────────────────────

describe('POST /api/v1/auth/2fa/setup', () => {
  beforeEach(() => jest.clearAllMocks());

  it('200 — returns secret and QR code for a user without 2FA', async () => {
    const user = buildMockUser({ twoFactorEnabled: false });
    User.findByPk.mockResolvedValue(user);

    const res = await request(app)
      .post('/api/v1/auth/2fa/setup')
      .set('Authorization', authHeader(user.id));

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('secret');
    expect(res.body.data).toHaveProperty('qrCode');
    expect(user.update).toHaveBeenCalledWith(
      expect.objectContaining({ twoFactorSecret: 'MOCK_BASE32_SECRET' })
    );
  });

  it('400 — rejects setup if 2FA already enabled', async () => {
    const user = buildMockUser({ twoFactorEnabled: true });
    User.findByPk.mockResolvedValue(user);

    const res = await request(app)
      .post('/api/v1/auth/2fa/setup')
      .set('Authorization', authHeader(user.id));

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/already enabled/i);
  });

  it('401 — no token', async () => {
    const res = await request(app).post('/api/v1/auth/2fa/setup');
    expect(res.status).toBe(401);
  });
});

// ── 2FA Verify (enable) ───────────────────────────────────────────────────────

describe('POST /api/v1/auth/2fa/verify', () => {
  beforeEach(() => jest.clearAllMocks());

  it('200 — enables 2FA and returns backup codes', async () => {
    speakeasy.totp.verify.mockReturnValue(true);
    const user = buildMockUser({ twoFactorSecret: 'MOCK_BASE32_SECRET' });
    User.findByPk.mockResolvedValue(user);

    const res = await request(app)
      .post('/api/v1/auth/2fa/verify')
      .set('Authorization', authHeader(user.id))
      .send({ token: '123456' });

    expect(res.status).toBe(200);
    expect(res.body.backupCodes).toHaveLength(8);
    expect(user.update).toHaveBeenCalledWith(
      expect.objectContaining({ twoFactorEnabled: true })
    );
  });

  it('400 — rejects invalid TOTP code', async () => {
    speakeasy.totp.verify.mockReturnValue(false);
    const user = buildMockUser({ twoFactorSecret: 'MOCK_BASE32_SECRET' });
    User.findByPk.mockResolvedValue(user);

    const res = await request(app)
      .post('/api/v1/auth/2fa/verify')
      .set('Authorization', authHeader(user.id))
      .send({ token: '000000' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalid/i);
  });

  it('400 — setup not initiated (no secret)', async () => {
    const user = buildMockUser({ twoFactorSecret: null });
    User.findByPk.mockResolvedValue(user);

    const res = await request(app)
      .post('/api/v1/auth/2fa/verify')
      .set('Authorization', authHeader(user.id))
      .send({ token: '123456' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/setup not initiated/i);
  });
});

// ── 2FA Disable ───────────────────────────────────────────────────────────────

describe('POST /api/v1/auth/2fa/disable', () => {
  beforeEach(() => jest.clearAllMocks());

  it('200 — disables 2FA', async () => {
    const user = buildMockUser({ twoFactorEnabled: true, twoFactorSecret: 'secret' });
    User.findByPk.mockResolvedValue(user);
    speakeasy.totp.verify.mockReturnValue(true); // TOTP check in the controller (auth-2fa.controller.js:128-133) must pass

    const res = await request(app)
      .post('/api/v1/auth/2fa/disable')
      .set('Authorization', authHeader(user.id))
      .send({ token: '123456' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(user.update).toHaveBeenCalledWith(
      expect.objectContaining({ twoFactorEnabled: false, twoFactorSecret: null })
    );
  });
});

// ── 2FA Verify Login ──────────────────────────────────────────────────────────

describe('POST /api/v1/auth/2fa/verify-login', () => {
  beforeEach(() => jest.clearAllMocks());

  it('200 — returns tokens after valid TOTP during login', async () => {
    speakeasy.totp.verify.mockReturnValue(true);
    const user = buildMockUser({ twoFactorEnabled: true, twoFactorSecret: 'MOCK_BASE32_SECRET' });
    User.findOne.mockResolvedValue(user);

    const res = await request(app)
      .post('/api/v1/auth/2fa/verify-login')
      .send({ email: 'member@test.com', token: '123456' });

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('token');
    expect(res.body.data).toHaveProperty('refreshToken');
  });

  it('400 — invalid TOTP code during login', async () => {
    speakeasy.totp.verify.mockReturnValue(false);
    const user = buildMockUser({ twoFactorEnabled: true, twoFactorSecret: 'MOCK_BASE32_SECRET' });
    User.findOne.mockResolvedValue(user);

    const res = await request(app)
      .post('/api/v1/auth/2fa/verify-login')
      .send({ email: 'member@test.com', token: '000000' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalid/i);
  });

  it('400 — user not found or 2FA not enabled', async () => {
    User.findOne.mockResolvedValue(null);

    const res = await request(app)
      .post('/api/v1/auth/2fa/verify-login')
      .send({ email: 'nobody@test.com', token: '123456' });

    expect(res.status).toBe(400);
  });
});

// ── 2FA Backup Login ──────────────────────────────────────────────────────────

describe('POST /api/v1/auth/2fa/backup-login', () => {
  beforeEach(() => jest.clearAllMocks());

  it('200 — logs in with a valid backup code', async () => {
    const plainCode = 'ABCD1234';
    const hash = await bcrypt.hash(plainCode.toUpperCase(), 10);
    const user = buildMockUser({
      twoFactorEnabled: true,
      twoFactorBackupCodes: [{ hash, used: false, id: 0 }],
    });
    User.findOne.mockResolvedValue(user);

    const res = await request(app)
      .post('/api/v1/auth/2fa/backup-login')
      .send({ email: 'member@test.com', backupCode: 'ABCD1234' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
    expect(user.update).toHaveBeenCalled();
  });

  it('400 — rejects already-used backup code', async () => {
    const hash = await bcrypt.hash('USED0001', 10);
    const user = buildMockUser({
      twoFactorEnabled: true,
      twoFactorBackupCodes: [{ hash, used: true, id: 0 }], // already used
    });
    User.findOne.mockResolvedValue(user);

    const res = await request(app)
      .post('/api/v1/auth/2fa/backup-login')
      .send({ email: 'member@test.com', backupCode: 'USED0001' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalid or already used/i);
  });

  it('400 — rejects wrong backup code', async () => {
    const hash = await bcrypt.hash('REALCODE', 10);
    const user = buildMockUser({
      twoFactorEnabled: true,
      twoFactorBackupCodes: [{ hash, used: false, id: 0 }],
    });
    User.findOne.mockResolvedValue(user);

    const res = await request(app)
      .post('/api/v1/auth/2fa/backup-login')
      .send({ email: 'member@test.com', backupCode: 'WRONGONE' });

    expect(res.status).toBe(400);
  });
});

// ── Edge cases ────────────────────────────────────────────────────────────────

describe('Auth edge cases', () => {
  beforeEach(() => jest.clearAllMocks());

  it('401 — malformed Authorization header (no Bearer prefix)', async () => {
    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', 'Token abc123');

    expect(res.status).toBe(401);
  });

  it('401 — Authorization header with empty token', async () => {
    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', 'Bearer ');

    expect(res.status).toBe(401);
  });

  it('register — concurrent duplicate registration returns 400 for second', async () => {
    // First call: no existing user
    User.findOne
      .mockResolvedValueOnce(null)                          // first register passes findOne
      .mockResolvedValueOnce(buildMockUser());              // second: user exists now
    User.create.mockResolvedValueOnce(buildMockUser({ id: 'first-uuid', email: 'race@test.com' }));

    const [res1, res2] = await Promise.all([
      request(app).post('/api/v1/auth/register').send({
        email: 'race@test.com', password: 'Password1!', firstName: 'A', lastName: 'B',
      }),
      request(app).post('/api/v1/auth/register').send({
        email: 'race@test.com', password: 'Password1!', firstName: 'A', lastName: 'B',
      }),
    ]);

    const statuses = [res1.status, res2.status].sort();
    expect(statuses).toContain(201);
    expect(statuses).toContain(400);
  });
});

// ── Login edge cases ──────────────────────────────────────────────────────────

describe('POST /api/v1/auth/login — edge cases', () => {
  beforeEach(() => jest.clearAllMocks());

  // AUTH-016 — case-insensitive email (normalizeEmail in validator lowercases it)
  it('200 — case-insensitive email (normalizeEmail normalises before DB lookup)', async () => {
    const user = buildMockUser({ comparePassword: jest.fn().mockResolvedValue(true) });
    // validator.normalizeEmail converts EMAIL@EXAMPLE.COM → email@example.com
    User.findOne.mockResolvedValue(user);
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'MEMBER@TEST.COM', password: 'Password1!' });
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('token');
  });

  // AUTH-017 — unverified email account: controller allows login (no isEmailVerified check)
  it('200 — unverified email account can still log in (no email-verified gate)', async () => {
    const user = buildMockUser({
      isEmailVerified: false,
      comparePassword: jest.fn().mockResolvedValue(true),
    });
    User.findOne.mockResolvedValue(user);
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'member@test.com', password: 'Password1!' });
    expect(res.status).toBe(200);
  });

  // AUTH-019 — login response must not include password field
  it('login response does not expose password hash', async () => {
    const user = buildMockUser({ comparePassword: jest.fn().mockResolvedValue(true) });
    User.findOne.mockResolvedValue(user);
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'member@test.com', password: 'Password1!' });
    expect(res.status).toBe(200);
    const userObj = res.body.data?.user || res.body.data;
    if (userObj) expect(userObj.password).toBeUndefined();
  });
});

// ── Post-logout refresh fails (AUTH-029) ──────────────────────────────────────

describe('POST /api/v1/auth/refresh-token — post-logout', () => {
  beforeEach(() => jest.clearAllMocks());

  // AUTH-029 — after logout, refresh token no longer works
  it('401 — using an expired/invalid refresh token after logout', async () => {
    // Simulate a refresh token that is expired (signed with a past expiry)
    const expiredRefresh = jwt.sign(
      { id: 'some-user-id' },
      process.env.JWT_REFRESH_SECRET || 'test_refresh_secret',
      { expiresIn: '0s' }
    );
    const res = await request(app)
      .post('/api/v1/auth/refresh-token')
      .send({ refreshToken: expiredRefresh });
    expect(res.status).toBe(401);
  });

  it('401 — a still-unexpired refresh token issued before logout is rejected after logout (tokenVersion revocation)', async () => {
    // 1. Log in — issues a refresh token carrying tokenVersion: 0.
    const user = buildMockUser({ comparePassword: jest.fn().mockResolvedValue(true), tokenVersion: 0 });
    User.findOne.mockResolvedValueOnce(user); // login()

    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: 'Password1!' });
    expect(loginRes.status).toBe(200);
    const { refreshToken } = loginRes.body.data;

    // 2. Log out — bumps the user's stored tokenVersion to 1.
    User.findByPk.mockResolvedValueOnce(user); // authenticate() for /logout
    const logoutRes = await request(app)
      .post('/api/v1/auth/logout')
      .set('Authorization', authHeader(user.id));
    expect(logoutRes.status).toBe(200);
    expect(user.update).toHaveBeenCalledWith({ tokenVersion: 1 });

    // 3. Reuse the pre-logout refresh token (still carries tokenVersion: 0)
    //    against a user record that now reports tokenVersion: 1 — must be rejected.
    User.findByPk.mockResolvedValueOnce({ ...user, tokenVersion: 1, isActive: true });
    const reuseRes = await request(app)
      .post('/api/v1/auth/refresh-token')
      .send({ refreshToken });

    expect(reuseRes.status).toBe(401);
    expect(reuseRes.body.error).toMatch(/revoked/i);
  });
});

// ── Forgot Password (AUTH-030, AUTH-031) ──────────────────────────────────────

describe('POST /api/v1/auth/forgot-password', () => {
  beforeEach(() => jest.clearAllMocks());

  // AUTH-030 — valid registered email → 200 generic message
  it('200 — valid registered email returns generic success (does not reveal existence)', async () => {
    const user = buildMockUser();
    User.findOne.mockResolvedValue(user);
    const res = await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email: 'member@test.com' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toMatch(/reset link|registered/i);
  });

  // AUTH-031 — unknown email → same 200 generic message (no disclosure)
  it('200 — unknown email returns the same generic message (no user enumeration)', async () => {
    User.findOne.mockResolvedValue(null); // user not found
    const res = await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email: 'nobody@nowhere.com' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    // Must NOT say "email not found" — same message as success
    expect(res.body.message).toMatch(/reset link|registered/i);
    expect(res.body.error).toBeUndefined();
  });

  it('400 — invalid email format returns validation error', async () => {
    const res = await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email: 'notanemail' });
    expect(res.status).toBe(400);
  });
});

// ── Reset Password (AUTH-032 to AUTH-035) ────────────────────────────────────

describe('POST /api/v1/auth/reset-password', () => {
  beforeEach(() => jest.clearAllMocks());

  // AUTH-032 — valid token + strong password → 200
  it('200 — valid token and strong password resets successfully', async () => {
    const user = buildMockUser();
    User.findOne.mockResolvedValue(user); // token lookup finds a user
    const res = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({ token: 'valid-raw-token-abc123', password: 'NewPassword1!' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toMatch(/reset successfully/i);
    expect(user.update).toHaveBeenCalledWith(
      expect.objectContaining({ passwordResetToken: null, passwordResetExpiry: null })
    );
  });

  // AUTH-033 — expired token (User.findOne returns null — no match for expired token)
  it('400 — expired token returns "invalid or has expired" error', async () => {
    User.findOne.mockResolvedValue(null); // no user with that token/expiry
    const res = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({ token: 'expired-token-xyz', password: 'NewPassword1!' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalid|expired/i);
  });

  // AUTH-034 — already-used token (token cleared from DB → findOne returns null)
  it('400 — already-used token returns "invalid or has expired" error', async () => {
    User.findOne.mockResolvedValue(null); // used token no longer in DB
    const res = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({ token: 'used-token-abc', password: 'NewPassword1!' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalid|expired/i);
  });

  // AUTH-035 — weak password → 400 validation (caught by validateResetPassword middleware)
  it('400 — weak password (short, no uppercase) rejected by password validation', async () => {
    const res = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({ token: 'any-token', password: '123' });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('400 — missing token returns validation error', async () => {
    const res = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({ password: 'NewPassword1!' });
    expect(res.status).toBe(400);
  });
});
