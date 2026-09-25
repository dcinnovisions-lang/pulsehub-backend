const crypto = require('crypto');
const { Op } = require('sequelize');
const { sequelize } = require('../config/database');
const { SsoConfig, User, Workspace, WorkspaceMembers } = require('../models');
const oidc = require('../utils/oidc');
const { seal, open, sealJson, openJson } = require('../utils/secretBox');
const { generateToken, generateRefreshToken } = require('./auth-core.controller');
const { audit } = require('../utils/audit');
const logger = require('../utils/logger');

const ROLES = ['member', 'pm', 'commenter', 'viewer', 'guest'];
const DOMAIN_RE = /^(?!-)[a-z0-9-]+(\.[a-z0-9-]+)+$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const apiBase = () => (process.env.SSO_REDIRECT_BASE || `${(process.env.FRONTEND_URL || '').replace(/\/$/, '')}/api/v1`).replace(/\/$/, '');
const redirectUri = () => `${apiBase()}/auth/sso/callback`;
const frontendUrl = () => (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '');

const publicView = (cfg, workspaceId) => ({
  workspaceId,
  enabled: !!(cfg && cfg.enabled),
  issuer: (cfg && cfg.issuer) || '',
  clientId: (cfg && cfg.clientId) || '',
  hasSecret: !!(cfg && cfg.clientSecretEnc),
  allowedDomains: (cfg && cfg.allowedDomains) || [],
  autoProvision: cfg ? cfg.autoProvision : true,
  defaultRole: (cfg && cfg.defaultRole) || 'member',
  enforce: !!(cfg && cfg.enforce),
  redirectUri: redirectUri(),
});

const fail = (status, message) => { const e = new Error(message); e.status = status; return e; };
const handleError = (err, res, next) => {
  if (err.status) return res.status(err.status).json({ success: false, error: err.message });
  logger.error('SSO error:', err);
  return next(err);
};

// ── Workspace admin: settings ────────────────────────────────────────────────

/** @route GET /api/v1/workspaces/:workspaceId/sso */
const getConfig = async (req, res, next) => {
  try {
    const cfg = await SsoConfig.findOne({ where: { workspaceId: req.params.workspaceId } });
    res.json({ success: true, data: publicView(cfg, req.params.workspaceId) });
  } catch (err) { handleError(err, res, next); }
};

/** @route PUT /api/v1/workspaces/:workspaceId/sso */
const putConfig = async (req, res, next) => {
  try {
    const { workspaceId } = req.params;
    const b = req.body || {};
    const existing = await SsoConfig.findOne({ where: { workspaceId } });

    const patch = {};
    if (b.issuer !== undefined) {
      const issuer = String(b.issuer).trim().replace(/\/+$/, '');
      if (issuer) {
        try { await oidc.assertSafeUrl(issuer); } catch (e) { throw fail(400, e.message); }
      }
      patch.issuer = issuer || null;
    }
    if (b.clientId !== undefined) patch.clientId = String(b.clientId).trim() || null;
    if (b.clientSecret) patch.clientSecretEnc = seal(String(b.clientSecret).trim());
    if (b.allowedDomains !== undefined) {
      const list = (Array.isArray(b.allowedDomains) ? b.allowedDomains : String(b.allowedDomains).split(/[\s,;]+/))
        .map((d) => String(d).trim().toLowerCase().replace(/^@/, '')).filter(Boolean);
      const bad = list.find((d) => !DOMAIN_RE.test(d));
      if (bad) throw fail(400, `"${bad}" is not a valid domain (use e.g. school.edu)`);
      patch.allowedDomains = [...new Set(list)];
    }
    if (b.autoProvision !== undefined) patch.autoProvision = !!b.autoProvision;
    if (b.defaultRole !== undefined) {
      if (!ROLES.includes(b.defaultRole)) throw fail(400, `Default role must be one of: ${ROLES.join(', ')}`);
      patch.defaultRole = b.defaultRole;
    }
    if (b.enabled !== undefined) patch.enabled = !!b.enabled;
    if (b.enforce !== undefined) patch.enforce = !!b.enforce;

    const merged = { ...(existing ? existing.toJSON() : {}), ...patch };
    if (merged.enabled) {
      if (!merged.issuer || !merged.clientId || !merged.clientSecretEnc) throw fail(400, 'Enter the issuer URL, client ID and client secret before enabling single sign-on');
      if (!merged.allowedDomains || merged.allowedDomains.length === 0) throw fail(400, 'Add at least one email domain that may sign in with SSO');
      try { await oidc.discover(merged.issuer); } catch (e) { throw fail(400, `Could not reach the identity provider: ${e.message}`); }
    }
    if (merged.enforce && !merged.enabled) throw fail(400, 'Enable single sign-on before requiring it');

    patch.updatedBy = req.user.id;
    let cfg;
    if (existing) { await existing.update(patch); cfg = existing; }
    else cfg = await SsoConfig.create({ workspaceId, ...patch });
    res.json({ success: true, data: publicView(cfg, workspaceId) });
  } catch (err) { handleError(err, res, next); }
};

/** @route POST /api/v1/workspaces/:workspaceId/sso/test — checks the provider is reachable */
const testConfig = async (req, res, next) => {
  try {
    const issuer = String((req.body && req.body.issuer) || '').trim();
    let target = issuer;
    if (!target) {
      const cfg = await SsoConfig.findOne({ where: { workspaceId: req.params.workspaceId } });
      target = cfg && cfg.issuer;
    }
    if (!target) throw fail(400, 'Enter the issuer URL first');
    let doc;
    try { doc = await oidc.discover(target); } catch (e) { throw fail(400, e.message); }
    res.json({ success: true, data: { issuer: doc.issuer, authorizationEndpoint: doc.authorization_endpoint, tokenEndpoint: doc.token_endpoint } });
  } catch (err) { handleError(err, res, next); }
};

// ── Public: sign-in flow ─────────────────────────────────────────────────────

const configForEmail = async (email) => {
  const domain = String(email).split('@')[1];
  if (!domain) return null;
  return SsoConfig.findOne({ where: { enabled: true, allowedDomains: { [Op.contains]: [domain] } } });
};

/** @route POST /api/v1/auth/sso/start   { email } -> { url } */
const start = async (req, res, next) => {
  try {
    const email = String((req.body && req.body.email) || '').trim().toLowerCase();
    if (!EMAIL_RE.test(email)) throw fail(400, 'Enter your work email address');
    const cfg = await configForEmail(email);
    if (!cfg) throw fail(404, 'Single sign-on is not set up for this email domain. Use your password instead, or ask your admin.');

    let doc;
    try { doc = await oidc.discover(cfg.issuer); } catch (e) { logger.warn(`SSO discovery failed for ${cfg.issuer}: ${e.message}`); throw fail(502, 'The identity provider could not be reached. Please try again in a moment.'); }

    const nonce = oidc.b64u(crypto.randomBytes(24));
    const verifier = oidc.newVerifier();
    const state = sealJson({ w: cfg.workspaceId, n: nonce, v: verifier, e: email, x: Date.now() + 10 * 60 * 1000 });
    const url = oidc.buildAuthUrl({ doc, clientId: cfg.clientId, redirectUri: redirectUri(), state, nonce, verifier, loginHint: email });
    res.json({ success: true, data: { url } });
  } catch (err) { handleError(err, res, next); }
};

const failRedirect = async (req, res, message, meta = {}) => {
  await audit(req, { action: 'auth.login_failed', actorEmail: meta.email, workspaceId: meta.workspaceId, targetType: 'user', metadata: { method: 'sso', reason: message } });
  return res.redirect(`${frontendUrl()}/login?error=sso_failed&message=${encodeURIComponent(message)}`);
};

/** @route GET /api/v1/auth/sso/callback?code=&state= */
const callback = async (req, res) => {
  const { code, state, error, error_description: errDesc } = req.query;
  if (error) return failRedirect(req, res, String(errDesc || error).slice(0, 200));
  const st = openJson(String(state || ''));
  if (!st || !st.x || Date.now() > st.x) return failRedirect(req, res, 'The sign-in link expired. Please start again.');
  const ctx = { email: st.e, workspaceId: st.w };

  try {
    const cfg = await SsoConfig.findOne({ where: { workspaceId: st.w, enabled: true } });
    if (!cfg) return failRedirect(req, res, 'Single sign-on is no longer enabled for this workspace.', ctx);
    const secret = open(cfg.clientSecretEnc);
    if (!secret) return failRedirect(req, res, 'The saved client secret could not be read. An admin must re-enter it.', ctx);
    if (!code) return failRedirect(req, res, 'The identity provider did not return a sign-in code.', ctx);

    const doc = await oidc.discover(cfg.issuer);
    const tokens = await oidc.exchangeCode({ doc, clientId: cfg.clientId, clientSecret: secret, code: String(code), redirectUri: redirectUri(), verifier: st.v });
    if (!tokens.id_token) return failRedirect(req, res, 'The identity provider did not return an ID token.', ctx);
    const claims = await oidc.verifyIdToken({ doc, idToken: tokens.id_token, clientId: cfg.clientId, nonce: st.n });

    const email = String(claims.email || claims.preferred_username || '').trim().toLowerCase();
    if (!EMAIL_RE.test(email)) return failRedirect(req, res, 'The identity provider did not share an email address.', ctx);
    if (claims.email_verified === false || claims.email_verified === 'false') return failRedirect(req, res, 'Your email address is not verified with the identity provider.', ctx);
    if (!(cfg.allowedDomains || []).includes(email.split('@')[1])) return failRedirect(req, res, 'Your email domain is not allowed to sign in to this workspace.', { ...ctx, email });

    let user = await User.findOne({ where: sequelize.where(sequelize.fn('lower', sequelize.col('email')), email) });
    if (!user) {
      if (!cfg.autoProvision) return failRedirect(req, res, 'Your account has not been created yet. Ask a workspace admin to invite you.', { ...ctx, email });
      const fullName = String(claims.name || '').trim().split(/\s+/);
      user = await User.create({
        email,
        password: crypto.randomBytes(32).toString('hex'), // unusable; sign-in goes through the identity provider
        firstName: String(claims.given_name || fullName[0] || email.split('@')[0]).slice(0, 100),
        lastName: String(claims.family_name || fullName.slice(1).join(' ') || '-').slice(0, 100),
        avatar: claims.picture ? String(claims.picture).slice(0, 500) : null,
        isActive: true
      });
    }
    if (user.isActive === false) return failRedirect(req, res, 'This account has been deactivated.', { ...ctx, email });

    const workspace = await Workspace.findByPk(cfg.workspaceId, { attributes: ['id', 'ownerId'] });
    const isOwner = workspace && workspace.ownerId === user.id;
    const member = await WorkspaceMembers.findOne({ where: { workspaceId: cfg.workspaceId, userId: user.id } });
    if (!isOwner && !member) {
      if (!cfg.autoProvision) return failRedirect(req, res, 'You are not a member of this workspace. Ask an admin to invite you.', { ...ctx, email });
      await WorkspaceMembers.create({ workspaceId: cfg.workspaceId, userId: user.id, role: cfg.defaultRole });
    }

    await user.update({ lastLogin: new Date(), isEmailVerified: true });
    const token = generateToken(user.id);
    const refreshToken = generateRefreshToken(user.id, user.tokenVersion);
    await audit(req, { action: 'auth.login', actorId: user.id, actorEmail: email, workspaceId: cfg.workspaceId, targetType: 'user', targetId: user.id, metadata: { method: 'sso' } });
    return res.redirect(`${frontendUrl()}/auth/callback?token=${encodeURIComponent(token)}&refreshToken=${encodeURIComponent(refreshToken)}`);
  } catch (err) {
    logger.warn(`SSO callback failed: ${err.message}`);
    return failRedirect(req, res, 'Single sign-on failed. Please try again or contact your admin.', ctx);
  }
};

// ── Enforcement: block password login for people whose workspace requires SSO ─────────

// Returns true when this user must sign in through SSO. Super admins and workspace owners are exempt
// so a misconfigured identity provider can never lock everyone out.
const passwordLoginBlocked = async (user) => {
  try {
    if (!user || user.role === 'super_admin') return false;
    const domain = String(user.email || '').split('@')[1];
    if (!domain) return false;
    const cfgs = await SsoConfig.findAll({ where: { enabled: true, enforce: true, allowedDomains: { [Op.contains]: [domain.toLowerCase()] } }, attributes: ['workspaceId'], raw: true });
    if (cfgs.length === 0) return false;
    const owns = await Workspace.count({ where: { ownerId: user.id, id: { [Op.in]: cfgs.map((c) => c.workspaceId) } } });
    return owns === 0;
  } catch (_) { return false; }
};

module.exports = { getConfig, putConfig, testConfig, start, callback, passwordLoginBlocked };
