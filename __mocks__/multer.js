/**
 * Manual mock for multer (used by avatar.test.js).
 * Place: <rootDir>/__mocks__/multer.js
 * Activate with: jest.mock('multer') — no factory needed.
 *
 * Tests control middleware behaviour via:
 *   const multer = require('multer');
 *   multer.__setMiddleware((req, res, next) => { ... });
 *   multer.__reset(); // back to default success
 */

let _customMiddleware = null;

class MulterError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
    this.name = 'MulterError';
  }
}

const multerMock = jest.fn(() => ({
  single: jest.fn(() => (req, res, next) => {
    if (_customMiddleware) {
      return _customMiddleware(req, res, next);
    }
    // Default: simulate successful upload
    req.file = { filename: 'avatar_test_001.png', mimetype: 'image/png', size: 500 };
    next();
  }),
}));

multerMock.diskStorage = jest.fn(() => ({}));
multerMock.MulterError = MulterError;

// Control hooks for tests
multerMock.__setMiddleware = (fn) => { _customMiddleware = fn; };
multerMock.__reset = () => { _customMiddleware = null; };

module.exports = multerMock;
