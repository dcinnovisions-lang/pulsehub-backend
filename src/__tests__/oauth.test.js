/**
 * OAuth (Google) endpoint tests
 * Runner : Jest + Supertest
 * DB     : Fully mocked — no real Postgres connection needed
 *
 * Endpoints covered:
 *   GET /api/v1/auth/google
 *   GET /api/v1/auth/google/callback
 *
 * IMPORTANT: this repo's real `.env` (loaded by `dotenv` at app.js's top,
 * same as production/dev) has GOOGLE_CLIENT_ID/SECRET set to PLACEHOLDER
 * values ("your_google_client_id_here"), not empty strings. That means
 * oauth.controller.js's `if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET)`
 * "not configured" guard never actually triggers in this environment — the
 * app believes OAuth is configured and will happily redirect a user to
 * Google with a client_id that doesn't work. That guard only protects
 * against the env vars being fully *unset*, not left as placeholders — a
 * real (if minor) gap, noted in ARCHITECTURE_AUDIT_CHECKLIST.md. These
 * tests cover what actually happens today, not the aspirational branch.
 */

jest.mock('../models', () => ({
  User: {
    findOne: jest.fn(), findByPk: jest.fn(), create: jest.fn(),
  },
}));

jest.mock('../utils/logger', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
}));

const request = require('supertest');
const app = require('../app');

describe('GET /api/v1/auth/google', () => {
  it('302: redirects to Google\'s OAuth consent screen using the configured client_id', async () => {
    const res = await request(app).get('/api/v1/auth/google');

    expect(res.status).toBe(302);
    expect(res.headers.location).toMatch(/^https:\/\/accounts\.google\.com\/o\/oauth2\/v2\/auth/);
    expect(res.headers.location).toContain(`client_id=${process.env.GOOGLE_CLIENT_ID}`);
  });
});

describe('GET /api/v1/auth/google/callback', () => {
  it('302: with no ?code= param, passport-oauth2 issues a fresh Google authorization redirect rather than failing', async () => {
    // Verified empirically, not assumed: passport-oauth2's callback handler
    // treats a request with no `code` query param as a new authorization
    // request (same behavior as hitting /google directly) rather than
    // invoking googleCallback's `if (err || !user)` failure branch. That
    // failure branch only fires once a `code` is present but token exchange
    // or profile lookup actually fails — not reachable without a real
    // (or mocked, see the next describe block) Google round-trip.
    const res = await request(app).get('/api/v1/auth/google/callback');

    expect(res.status).toBe(302);
    expect(res.headers.location).toMatch(/^https:\/\/accounts\.google\.com\/o\/oauth2\/v2\/auth/);
  });
});

describe('OAuth token generation — successful callback path', () => {
  // Exercises the actual logic inside googleCallback (token generation with
  // the resolved user's tokenVersion) by mocking passport.authenticate
  // directly, bypassing the real Google network round-trip entirely. This is
  // the code path that was touched when refresh-token revocation
  // (tokenVersion) was added — oauth.controller.js used to have its own
  // independent duplicate of generateToken/generateRefreshToken (see
  // ARCHITECTURE_AUDIT_CHECKLIST.md) — worth covering directly rather than
  // assuming the auth-core.controller.js tests are a sufficient proxy.
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it('302: redirects to /auth/callback with real, decodable token + refreshToken on success', async () => {
    const fakeUser = { id: 'oauth-user-id', tokenVersion: 3 };

    jest.doMock('passport', () => ({
      serializeUser: jest.fn(),
      deserializeUser: jest.fn(),
      use: jest.fn(),
      initialize: () => (req, res, next) => next(),
      // Invoke the REAL 3rd-arg callback that oauth.controller.js's
      // googleCallback passes to passport.authenticate — this is what makes
      // the actual generateToken/generateRefreshToken calls run for real,
      // rather than just asserting *something* redirected.
      authenticate: jest.fn((_strategy, _options, callback) => (req, res) => {
        callback(null, fakeUser);
      }),
    }));

    const freshApp = require('../app');
    const res = await request(freshApp).get('/api/v1/auth/google/callback');

    expect(res.status).toBe(302);
    const redirectUrl = new URL(res.headers.location);
    expect(redirectUrl.pathname).toBe('/auth/callback');

    const token = redirectUrl.searchParams.get('token');
    const refreshToken = redirectUrl.searchParams.get('refreshToken');
    expect(token).toBeTruthy();
    expect(refreshToken).toBeTruthy();

    const jwt = require('jsonwebtoken');
    const decodedAccess = jwt.decode(token);
    const decodedRefresh = jwt.decode(refreshToken);
    expect(decodedAccess.id).toBe(fakeUser.id);
    expect(decodedRefresh.id).toBe(fakeUser.id);
    // Confirms tokenVersion is actually threaded through on the OAuth path,
    // not just the password-login path.
    expect(decodedRefresh.tokenVersion).toBe(fakeUser.tokenVersion);

    jest.dontMock('passport');
  });
});
