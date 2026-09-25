const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
const bcryptjs = require('bcryptjs');
const crypto = require('crypto');
const { User } = require('../models');
const logger = require('../utils/logger');
const { generateToken, generateRefreshToken } = require('./auth-core.controller');

/**
 * @desc    Setup 2FA for user
 * @route   POST /api/v1/auth/2fa/setup
 * @access  Private
 */
const setup2FA = async (req, res, next) => {
  try {
    const user = await User.findByPk(req.user.id);

    if (user.twoFactorEnabled) {
      return res.status(400).json({
        success: false,
        error: '2FA is already enabled'
      });
    }

    // Generate secret
    const secret = speakeasy.generateSecret({
      name: `Projva (${user.email})`,
      issuer: 'Projva'
    });

    // Save secret temporarily (user needs to verify before enabling)
    await user.update({ twoFactorSecret: secret.base32 });

    // Generate QR code
    const qrCodeUrl = await QRCode.toDataURL(secret.otpauth_url);

    res.status(200).json({
      success: true,
      data: {
        secret: secret.base32,
        qrCode: qrCodeUrl
      }
    });
  } catch (error) {
    logger.error('Setup 2FA error:', error);
    next(error);
  }
};

/**
 * @desc    Verify and enable 2FA
 * @route   POST /api/v1/auth/2fa/verify
 * @access  Private
 */
const verify2FA = async (req, res, next) => {
  try {
    const { token } = req.body;
    const user = await User.findByPk(req.user.id);

    if (!user.twoFactorSecret) {
      return res.status(400).json({
        success: false,
        error: '2FA setup not initiated'
      });
    }

    // Verify token
    const verified = speakeasy.totp.verify({
      secret: user.twoFactorSecret,
      encoding: 'base32',
      token,
      window: 2
    });

    if (!verified) {
      return res.status(400).json({
        success: false,
        error: 'Invalid verification code'
      });
    }

    // Enable 2FA
    await user.update({ twoFactorEnabled: true });

    // Generate backup codes on first enable
    const plainCodes = Array.from({ length: 8 }, () => crypto.randomBytes(4).toString('hex').toUpperCase());
    const hashedCodes = await Promise.all(plainCodes.map(c => bcryptjs.hash(c, 10)));
    await user.update({ twoFactorBackupCodes: hashedCodes.map((hash, i) => ({ hash, used: false, id: i })) });

    // Return plain codes ONCE — user must save them
    res.status(200).json({
      success: true,
      message: '2FA enabled successfully',
      backupCodes: plainCodes
    });
  } catch (error) {
    logger.error('Verify 2FA error:', error);
    next(error);
  }
};

/**
 * @desc    Disable 2FA
 * @route   POST /api/v1/auth/2fa/disable
 * @access  Private
 */
const disable2FA = async (req, res, next) => {
  try {
    const { token, password } = req.body;

    if (!token && !password) {
      return res.status(400).json({
        success: false,
        error: 'Provide your current TOTP token or account password to disable 2FA'
      });
    }

    const user = await User.findByPk(req.user.id);

    if (!user.twoFactorEnabled) {
      return res.status(400).json({ success: false, error: '2FA is not enabled' });
    }

    let verified = false;

    if (token) {
      // Verify current TOTP token
      verified = speakeasy.totp.verify({
        secret: user.twoFactorSecret,
        encoding: 'base32',
        token: String(token),
        window: 2
      });
    } else if (password) {
      // Verify account password as alternative
      const bcrypt = require('bcryptjs');
      verified = await bcrypt.compare(password, user.password);
    }

    if (!verified) {
      return res.status(401).json({
        success: false,
        error: 'Verification failed — invalid token or password'
      });
    }

    await user.update({
      twoFactorEnabled: false,
      twoFactorSecret: null
    });

    res.status(200).json({
      success: true,
      message: '2FA disabled successfully'
    });
  } catch (error) {
    logger.error('Disable 2FA error:', error);
    next(error);
  }
};

/**
 * @desc    Verify 2FA token during login
 * @route   POST /api/v1/auth/2fa/verify-login
 * @access  Public
 */
const verify2FALogin = async (req, res, next) => {
  try {
    const { email, token } = req.body;

    const user = await User.findOne({ where: { email } });
    if (!user || !user.twoFactorEnabled || !user.twoFactorSecret) {
      return res.status(400).json({
        success: false,
        error: '2FA not enabled for this user'
      });
    }

    // Verify token
    const verified = speakeasy.totp.verify({
      secret: user.twoFactorSecret,
      encoding: 'base32',
      token,
      window: 2
    });

    if (!verified) {
      return res.status(400).json({
        success: false,
        error: 'Invalid verification code'
      });
    }

    // Generate tokens
    const jwtToken = generateToken(user.id);
    const refreshToken = generateRefreshToken(user.id, user.tokenVersion);

    // Update last login
    await user.update({ lastLogin: new Date() });

    res.status(200).json({
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
          twoFactorEnabled: user.twoFactorEnabled
        },
        token: jwtToken,
        refreshToken
      }
    });
  } catch (error) {
    logger.error('Verify 2FA login error:', error);
    next(error);
  }
};

/**
 * @desc    Login using a 2FA backup code
 * @route   POST /api/v1/auth/2fa/backup-login
 * @access  Public
 */
const backupLogin = async (req, res, next) => {
  try {
    const { email, backupCode } = req.body;
    const user = await User.findOne({ where: { email } });
    if (!user || !user.twoFactorEnabled) return res.status(400).json({ success: false, error: 'Invalid request' });

    const codes = user.twoFactorBackupCodes || [];
    let matchedIndex = -1;
    for (let i = 0; i < codes.length; i++) {
      if (!codes[i].used && await bcryptjs.compare(backupCode.toUpperCase(), codes[i].hash)) {
        matchedIndex = i; break;
      }
    }
    if (matchedIndex === -1) return res.status(400).json({ success: false, error: 'Invalid or already used backup code' });

    // Mark code as used
    codes[matchedIndex].used = true;
    await user.update({ twoFactorBackupCodes: codes });

    const token = generateToken(user.id);
    const refreshToken = generateRefreshToken(user.id, user.tokenVersion);
    res.json({ success: true, token, refreshToken, user: { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName, role: user.role } });
  } catch (error) {
    logger.error('Backup login error:', error);
    next(error);
  }
};

module.exports = {
  setup2FA,
  verify2FA,
  disable2FA,
  verify2FALogin,
  backupLogin,
};
