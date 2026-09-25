// Authenticated encryption (AES-256-GCM) for secrets stored in the database and for short-lived
// sealed values such as the SSO login state. The key is derived from the server's own secrets.

const crypto = require('crypto');

const keyMaterial = () => {
  const secret = process.env.SESSION_SECRET || process.env.JWT_SECRET;
  if (!secret) throw new Error('SESSION_SECRET or JWT_SECRET must be set to protect stored secrets');
  return crypto.createHash('sha256').update(`projva-secret-box:${secret}`).digest();
};

const b64 = (buf) => buf.toString('base64url');

const seal = (plain) => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', keyMaterial(), iv);
  const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  return `${b64(iv)}.${b64(cipher.getAuthTag())}.${b64(enc)}`;
};

// Returns the plaintext, or null when the value was tampered with / made with another key
const open = (sealed) => {
  try {
    const [iv, tag, enc] = String(sealed).split('.');
    const decipher = crypto.createDecipheriv('aes-256-gcm', keyMaterial(), Buffer.from(iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(enc, 'base64url')), decipher.final()]).toString('utf8');
  } catch (_) {
    return null;
  }
};

const sealJson = (obj) => seal(JSON.stringify(obj));
const openJson = (sealed) => {
  const s = open(sealed);
  if (s === null) return null;
  try { return JSON.parse(s); } catch (_) { return null; }
};

module.exports = { seal, open, sealJson, openJson };
