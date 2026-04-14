/**
 * Centralized rate limiters — single source of truth.
 *
 * Tier strategy:
 *   globalLimiter        500 req / 15 min  — flood protection on every API call
 *   writeLimiter         100 req / 15 min  — all POST / PUT / PATCH / DELETE mutations
 *   authLimiter           10 req / 15 min  — login / register / 2FA (brute-force)
 *   passwordResetLimiter   5 req / 15 min  — forgot-password / reset-password
 *   uploadLimiter         20 req / 15 min  — file / avatar / logo uploads
 *   searchLimiter         30 req /  1 min  — search & CSV export (CPU-heavy)
 */

const rateLimit = require('express-rate-limit');

/**
 * Factory — keeps all limiter definitions DRY and consistent.
 * Every limiter uses RFC-standard headers and a structured JSON body.
 * Skip ALL rate limiting in test and development modes to avoid
 * blocking E2E test suites that perform many rapid auth requests.
 */
const make = ({ windowMs, max, message, skip }) =>
  rateLimit({
    windowMs,
    max,
    message:         { success: false, error: message },
    standardHeaders: true,   // RateLimit-* headers (RFC 6585)
    legacyHeaders:   false,  // suppress X-RateLimit-* legacy headers
    skip: ['test', 'development'].includes(process.env.NODE_ENV) ? () => true : skip,
  });

// ─── Tiers ───────────────────────────────────────────────────────────────────

/** Baseline flood protection applied to every /api/* call. */
const globalLimiter = make({
  windowMs: 15 * 60 * 1000,
  max:      process.env.NODE_ENV === 'development' ? 5000 : 500,
  message:  'Too many requests. Please try again later.',
});

/**
 * Covers all mutating verbs (POST / PUT / PATCH / DELETE).
 * Applied at app level so every route is protected without per-file changes.
 * GET / HEAD / OPTIONS are skipped automatically.
 */
const writeLimiter = make({
  windowMs: 15 * 60 * 1000,
  max:      process.env.NODE_ENV === 'development' ? 2000 : 100,
  message:  'Too many write requests from this IP. Please slow down.',
  skip:     (req) => ['GET', 'HEAD', 'OPTIONS'].includes(req.method),
});

/**
 * Auth endpoints — protects login, register, 2FA, resend-verification.
 * 10 attempts per 15 min per IP is generous for a real user, tight for bots.
 */
const authLimiter = make({
  windowMs: 15 * 60 * 1000,
  max:      process.env.NODE_ENV === 'development' ? 200 : 10,
  message:  'Too many authentication attempts. Please wait 15 minutes and try again.',
});

/**
 * Forgot-password / reset-password only.
 * Stricter than authLimiter — password reset is the most abused auth flow.
 */
const passwordResetLimiter = make({
  windowMs: 15 * 60 * 1000,
  max:      process.env.NODE_ENV === 'development' ? 100 : 5,
  message:  'Too many password reset requests. Please wait 15 minutes before trying again.',
});

/**
 * File uploads — avatar, workspace logo, task attachments, chat files.
 * 20 uploads per 15 min is more than enough for legitimate use.
 */
const uploadLimiter = make({
  windowMs: 15 * 60 * 1000,
  max:      process.env.NODE_ENV === 'development' ? 500 : 20,
  message:  'Too many upload requests. Please try again later.',
});

/**
 * Search & CSV export — these hit the DB hard (full-text scan / sequential reads).
 * 30 per minute = 1 every 2 seconds, enough for live search debounce.
 */
const searchLimiter = make({
  windowMs: 60 * 1000,
  max:      process.env.NODE_ENV === 'development' ? 500 : 30,
  message:  'Too many search requests. Please slow down.',
});

module.exports = {
  globalLimiter,
  writeLimiter,
  authLimiter,
  passwordResetLimiter,
  uploadLimiter,
  searchLimiter,
};
