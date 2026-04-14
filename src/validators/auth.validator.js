const { body, param, validationResult } = require('express-validator');

/**
 * Validation middleware
 */
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errors.array()
    });
  }
  next();
};

/**
 * Register validation rules
 */
const validateRegister = [
  body('email')
    .isEmail()
    .withMessage('Please provide a valid email')
    .normalizeEmail(),
  body('password')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters long')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Password must contain at least one uppercase letter, one lowercase letter, and one number'),
  body('firstName')
    .trim()
    .notEmpty()
    .withMessage('First name is required')
    .isLength({ max: 100 })
    .withMessage('First name must be less than 100 characters'),
  body('lastName')
    .trim()
    .notEmpty()
    .withMessage('Last name is required')
    .isLength({ max: 100 })
    .withMessage('Last name must be less than 100 characters'),
  handleValidationErrors
];

/**
 * Login validation rules
 */
const validateLogin = [
  body('email')
    .isEmail()
    .withMessage('Please provide a valid email')
    .normalizeEmail(),
  body('password')
    .notEmpty()
    .withMessage('Password is required'),
  handleValidationErrors
];

const validateForgotPassword = [
  body('email')
    .isEmail().withMessage('Please provide a valid email')
    .normalizeEmail(),
  handleValidationErrors
];

const validateResetPassword = [
  body('token')
    .notEmpty().withMessage('Reset token is required'),
  body('password')
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Password must contain at least one uppercase letter, one lowercase letter, and one number'),
  handleValidationErrors
];

const validate2FAVerify = [
  body('token')
    .notEmpty().withMessage('Verification code is required')
    .isLength({ min: 6, max: 6 }).withMessage('Verification code must be 6 digits')
    .isNumeric().withMessage('Verification code must be numeric'),
  handleValidationErrors
];

const validate2FAVerifyLogin = [
  body('email')
    .isEmail().withMessage('Valid email is required')
    .normalizeEmail(),
  body('token')
    .notEmpty().withMessage('Verification code is required')
    .isLength({ min: 6, max: 6 }).withMessage('Verification code must be 6 digits')
    .isNumeric().withMessage('Verification code must be numeric'),
  handleValidationErrors
];

const validate2FADisable = [
  // Accept either a TOTP token OR an account password — both are optional at validator
  // level; the controller enforces that at least one must be provided.
  body('token').optional().trim(),
  body('password').optional(),
  handleValidationErrors
];

const validateBackupLogin = [
  body('email')
    .isEmail().withMessage('Valid email is required')
    .normalizeEmail(),
  body('backupCode')
    .notEmpty().withMessage('Backup code is required')
    .isLength({ min: 4 }).withMessage('Invalid backup code format'),
  handleValidationErrors
];

module.exports = {
  validateRegister,
  validateLogin,
  validateForgotPassword,
  validateResetPassword,
  validate2FAVerify,
  validate2FAVerifyLogin,
  validate2FADisable,
  validateBackupLogin
};


