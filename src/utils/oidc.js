// Minimal OpenID Connect relying party (authorization-code flow + PKCE) built on Node's own crypto.
// Works with any standards-compliant provider: Google Workspace, Microsoft Entra ID, Okta, Auth0, Keycloak ...

const crypto = require('crypto');
const dns = require('dns').promises;
const net = require('net');
const jwt = require('jsonwebtoken');

const ALLOW_INSECURE = () => process.env.ALLOW_INSECURE_OIDC === 'true'; // local testing only

const isPrivateIp = (ip) => {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
  }
  const v = ip.toLowerCase();
  return v === '::1' || v === '::' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80') || v.startsWith('::ffff:127.') || v.startsWith('::ffff:10.') || v.startsWith('::ffff:192.168.');
};

// Server-side fetches of admin-supplied URLs must not reach internal services (SSRF)
const assertSafeUrl = async (raw) => {
  let u;
  try { u = new URL(raw); } catch (_) { throw new Error('The URL is not valid'); }
  if (ALLOW_INSECURE()) return u;
  if (u.protocol !== 'https:') throw new Error('The identity provider URL must use https');
  const host = u.hostname;
  const addrs = net.isIP(host) ? [{ address: host }] : await dns.lookup(host, { all: true });
  if (addrs.some((a) => isPrivateIp(a.address))) throw new Error('The identity provider URL points to a private network address');
  return u;
};

const getJson = async (url, init) => {
  await assertSafeUrl(url);
  const res = await fetch(url, { ...init, redirect: 'error', signal: AbortSignal.timeout(8000) });
  const text = await res.text();
  let body = null;
  try { body = JSON.parse(text); } catch (_) { /* not json */ }
  if (!res.ok) {
    const msg = body && (body.error_description || body.error) ? `${body.error}: ${body.error_description || ''}`.trim() : `HTTP ${res.status}`;
    throw new Error(msg);
  }
  if (body === null) throw new Error('The identity provider returned an unexpected response');
  return body;
};

const discoveryCache = new Map();
const jwksCache = new Map();
const TTL = 10 * 60 * 1000;

const discover = async (issuer) => {
  const base = String(issuer).replace(/\/+$/, '');
  const hit = discoveryCache.get(base);
  if (hit && Date.now() - hit.at < TTL) return hit.doc;
  const doc = await getJson(`${base}/.well-known/openid-configuration`);
  for (const k of ['issuer', 'authorization_endpoint', 'token_endpoint', 'jwks_uri']) {
    if (!doc[k]) throw new Error(`The provider's discovery document is missing "${k}"`);
  }
  discoveryCache.set(base, { at: Date.now(), doc });
  return doc;
};

const b64u = (buf) => Buffer.from(buf).toString('base64url');
const newVerifier = () => b64u(crypto.randomBytes(48));
const challengeOf = (verifier) => b64u(crypto.createHash('sha256').update(verifier).digest());

const buildAuthUrl = ({ doc, clientId, redirectUri, state, nonce, verifier, loginHint }) => {
  const u = new URL(doc.authorization_endpoint);
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('client_id', clientId);
  u.searchParams.set('redirect_uri', redirectUri);
  u.searchParams.set('scope', 'openid email profile');
  u.searchParams.set('state', state);
  u.searchParams.set('nonce', nonce);
  u.searchParams.set('code_challenge', challengeOf(verifier));
  u.searchParams.set('code_challenge_method', 'S256');
  if (loginHint) u.searchParams.set('login_hint', loginHint);
  return u.toString();
};

const exchangeCode = async ({ doc, clientId, clientSecret, code, redirectUri, verifier }) => {
  const form = new URLSearchParams({
    grant_type: 'authorization_code', code, redirect_uri: redirectUri, client_id: clientId, code_verifier: verifier
  });
  if (clientSecret) form.set('client_secret', clientSecret);
  return getJson(doc.token_endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: form.toString()
  });
};

const keyFor = async (doc, kid, alg) => {
  const cacheKey = doc.jwks_uri;
  let entry = jwksCache.get(cacheKey);
  const find = (jwks) => (jwks.keys || []).find((k) => (!kid || k.kid === kid) && (!k.use || k.use === 'sig') && (!k.alg || k.alg === alg));
  if (!entry || Date.now() - entry.at > TTL || !find(entry.jwks)) {
    entry = { at: Date.now(), jwks: await getJson(doc.jwks_uri) };
    jwksCache.set(cacheKey, entry);
  }
  const jwk = find(entry.jwks);
  if (!jwk) throw new Error('The ID token was signed with an unknown key');
  return crypto.createPublicKey({ key: jwk, format: 'jwk' }).export({ type: 'spki', format: 'pem' });
};

// Verifies signature, issuer, audience, expiry and nonce. Returns the claims.
const verifyIdToken = async ({ doc, idToken, clientId, nonce }) => {
  const decoded = jwt.decode(idToken, { complete: true });
  if (!decoded || !decoded.header) throw new Error('The ID token is malformed');
  const alg = decoded.header.alg;
  if (!['RS256', 'RS384', 'RS512', 'ES256', 'ES384'].includes(alg)) throw new Error('Unsupported ID token signature algorithm');
  const pem = await keyFor(doc, decoded.header.kid, alg);
  const claims = jwt.verify(idToken, pem, { algorithms: [alg], issuer: doc.issuer, audience: clientId, clockTolerance: 60 });
  if (!claims.nonce || claims.nonce !== nonce) throw new Error('The sign-in response did not match this request (nonce)');
  return claims;
};

module.exports = { discover, buildAuthUrl, exchangeCode, verifyIdToken, newVerifier, assertSafeUrl, b64u };
