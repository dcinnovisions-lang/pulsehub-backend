/**
 * JWT test helpers — sign real tokens with the test secret so the
 * authenticate middleware can verify them without hitting the DB.
 */
const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET || 'projva-test-secret-do-not-use-in-prod';

/**
 * Sign a short-lived access token for a fake user.
 * @param {object} payload — at minimum { id, role }
 */
const signToken = (payload, expiresIn = '1h') =>
  jwt.sign(payload, SECRET, { expiresIn });

/**
 * Sign an expired token (useful for testing 401 responses).
 */
const signExpiredToken = (payload) =>
  jwt.sign(payload, SECRET, { expiresIn: '-1s' });

/**
 * Sign a token with the wrong secret (useful for testing 401 invalid token).
 */
const signBadToken = (payload) =>
  jwt.sign(payload, 'wrong-secret', { expiresIn: '1h' });

/**
 * Pre-built mock user objects for each role.
 * These are plain objects — the DB is mocked, so no real rows exist.
 */
const mockUsers = {
  super_admin: {
    id: 'uuid-super-admin',
    email: 'superadmin@test.com',
    firstName: 'Super',
    lastName: 'Admin',
    role: 'super_admin',
    isActive: true,
    twoFactorEnabled: false,
    twoFactorSecret: null,
  },
  admin: {
    id: 'uuid-admin',
    email: 'admin@test.com',
    firstName: 'Admin',
    lastName: 'User',
    role: 'admin',
    isActive: true,
    twoFactorEnabled: false,
    twoFactorSecret: null,
  },
  pm: {
    id: 'uuid-pm',
    email: 'pm@test.com',
    firstName: 'Project',
    lastName: 'Manager',
    role: 'pm',
    isActive: true,
    twoFactorEnabled: false,
    twoFactorSecret: null,
  },
  member: {
    id: 'uuid-member',
    email: 'member@test.com',
    firstName: 'Regular',
    lastName: 'Member',
    role: 'member',
    isActive: true,
    twoFactorEnabled: false,
    twoFactorSecret: null,
  },
  viewer: {
    id: 'uuid-viewer',
    email: 'viewer@test.com',
    firstName: 'Read',
    lastName: 'Only',
    role: 'viewer',
    isActive: true,
    twoFactorEnabled: false,
    twoFactorSecret: null,
  },
  guest: {
    id: 'uuid-guest',
    email: 'guest@test.com',
    firstName: 'Guest',
    lastName: 'User',
    role: 'guest',
    isActive: true,
    twoFactorEnabled: false,
    twoFactorSecret: null,
  },
};

/** Return a Bearer header string for the given role */
const authHeader = (role = 'member') =>
  `Bearer ${signToken({ id: mockUsers[role].id })}`;

module.exports = { signToken, signExpiredToken, signBadToken, mockUsers, authHeader };
