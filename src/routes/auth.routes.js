const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const oauthController = require('../controllers/oauth.controller');
const { authenticate } = require('../middleware/auth');
const { authLimiter, passwordResetLimiter } = require('../middleware/rateLimiter');
const {
  validateRegister, validateLogin,
  validateForgotPassword, validateResetPassword,
  validate2FAVerify, validate2FAVerifyLogin, validate2FADisable,
  validateBackupLogin
} = require('../validators/auth.validator');
const { verifyEmail, resendVerification, backupLogin } = authController;

// Public routes — authLimiter: 10 req / 15 min (brute-force protection)
router.post('/register',      authLimiter, validateRegister, authController.register);
router.post('/login',         authLimiter, validateLogin,    authController.login);
router.post('/refresh-token', authLimiter, authController.refreshToken);

// Password reset — strictest limiter: 5 req / 15 min
router.post('/forgot-password', passwordResetLimiter, validateForgotPassword, authController.forgotPassword);
router.post('/reset-password',  passwordResetLimiter, validateResetPassword,  authController.resetPassword);

// Email verification routes
router.get('/verify-email/:token',   verifyEmail);
router.post('/2fa/backup-login',     authLimiter, validateBackupLogin, backupLogin);

// Protected routes
router.post('/logout',              authenticate, authController.logout);
router.get('/me',                   authenticate, authController.getMe);
router.post('/resend-verification', authenticate, authLimiter, resendVerification);

// 2FA routes
router.post('/2fa/setup',        authenticate, authController.setup2FA);
router.post('/2fa/verify',       authenticate, validate2FAVerify,      authController.verify2FA);
router.post('/2fa/disable',      authenticate, validate2FADisable,     authController.disable2FA);
router.post('/2fa/verify-login', authLimiter, validate2FAVerifyLogin,  authController.verify2FALogin);

// OAuth routes
router.get('/google', oauthController.googleAuth);
router.get('/google/callback', oauthController.googleCallback);

module.exports = router;


