/**
 * Jest global setup — runs BEFORE the test framework is installed.
 * Sets env vars required by app.js, auth middleware, JWT helpers, etc.
 * This file is referenced via jest.config.js `setupFiles`.
 */

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'projva-test-secret-do-not-use-in-prod';
process.env.JWT_REFRESH_SECRET = 'projva-refresh-test-secret';
process.env.JWT_EXPIRE = '7d';
process.env.JWT_REFRESH_EXPIRE = '30d';
process.env.FRONTEND_URL = 'http://localhost:3000';
process.env.CORS_ORIGIN = 'http://localhost:3000';
// Disable session / passport noise in tests
process.env.SESSION_SECRET = 'test-session-secret';
// Suppress morgan logging
process.env.LOG_LEVEL = 'silent';
