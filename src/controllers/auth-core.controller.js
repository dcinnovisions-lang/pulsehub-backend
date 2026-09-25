const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const { User } = require('../models');
const logger = require('../utils/logger');

// Falls back to JWT_SECRET when a dedicated refresh secret isn't configured.
// Single source of truth — read via this helper everywhere a refresh token
// is signed or verified, rather than repeating the `||` fallback inline.
const getRefreshSecret = () => process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET;

const getMailFrom = () => process.env.SMTP_FROM || 'Projva <noreply@projva.dev>';

/**
 * Generate JWT Token
 */
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE || '7d'
  });
};

/**
 * Generate Refresh Token
 * tokenVersion is embedded so logout() can invalidate every outstanding
 * refresh token for a user by bumping their stored tokenVersion — see
 * refreshToken() below, which rejects a token whose version doesn't match.
 */
const generateRefreshToken = (id, tokenVersion = 0) => {
  return jwt.sign({ id, tokenVersion }, getRefreshSecret(), {
    expiresIn: process.env.JWT_REFRESH_EXPIRE || '30d'
  });
};

/**
 * @desc    Register new user
 * @route   POST /api/v1/auth/register
 * @access  Public
 */
const register = async (req, res, next) => {
  try {
    const { email, password, firstName, lastName } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ where: { email } });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        error: 'User already exists with this email'
      });
    }

    // Create user
    const user = await User.create({
      email,
      password,
      firstName,
      lastName
    });

    // Generate email verification token
    const verificationToken = require('crypto').randomBytes(32).toString('hex');
    await user.update({
      emailVerificationToken: verificationToken,
      emailVerificationExpiry: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
      isEmailVerified: false,
    });

    // Send verification email (non-fatal — if SMTP not configured, skip)
    try {
      const transporter = createTransporter();
      const verifyUrl = `${process.env.FRONTEND_URL}/verify-email/${verificationToken}`;
      await transporter.sendMail({
        from: getMailFrom(),
        to: user.email,
        subject: 'Verify your Projva account',
        html: `<h2>Welcome to Projva!</h2><p>Click the link below to verify your email address:</p><a href="${verifyUrl}" style="background:#2563eb;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;">Verify Email</a><p>This link expires in 24 hours.</p>`,
      });
    } catch (emailErr) {
      // Non-fatal: verification email failed, user can resend
      logger.warn('Verification email send failed:', emailErr.message);
    }

    // Generate tokens
    const token = generateToken(user.id);
    const refreshToken = generateRefreshToken(user.id, user.tokenVersion);

    res.status(201).json({
      success: true,
      data: {
        user,
        token,
        refreshToken
      }
    });
  } catch (error) {
    logger.error('Registration error:', error);
    next(error);
  }
};

/**
 * @desc    Login user
 * @route   POST /api/v1/auth/login
 * @access  Public
 */
const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    // Validate email & password
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Please provide email and password'
      });
    }

    // Check for user
    const user = await User.findOne({ where: { email } });

    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials'
      });
    }

    // Check if user is active
    if (!user.isActive) {
      return res.status(401).json({
        success: false,
        error: 'Account is deactivated'
      });
    }

    // Workspaces can require single sign-on: those users must use their identity provider
    const { passwordLoginBlocked } = require('./sso.controller');
    if (await passwordLoginBlocked(user)) {
      return res.status(403).json({
        success: false,
        error: 'Your organization requires single sign-on. Use "Sign in with SSO" on the login page.',
        code: 'SSO_REQUIRED'
      });
    }

    // Check if password matches
    const isMatch = await user.comparePassword(password);

    if (!isMatch) {
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials'
      });
    }

    // Check if 2FA is enabled
    if (user.twoFactorEnabled) {
      return res.status(200).json({
        success: true,
        requires2FA: true,
        message: '2FA verification required'
      });
    }

    // Update last login
    await user.update({ lastLogin: new Date() });

    // Generate tokens
    const token = generateToken(user.id);
    const refreshToken = generateRefreshToken(user.id, user.tokenVersion);

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
        token,
        refreshToken
      }
    });
  } catch (error) {
    logger.error('Login error:', error);
    next(error);
  }
};

/**
 * @desc    Refresh token
 * @route   POST /api/v1/auth/refresh-token
 * @access  Public
 */
const refreshToken = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({
        success: false,
        error: 'Refresh token is required'
      });
    }

    // Verify refresh token
    const decoded = jwt.verify(refreshToken, getRefreshSecret());

    // Get user
    const user = await User.findByPk(decoded.id);

    if (!user || !user.isActive) {
      return res.status(401).json({
        success: false,
        error: 'Invalid refresh token'
      });
    }

    // Reject tokens issued before the user's last logout. Tokens signed
    // before this field existed carry no tokenVersion — treat that as 0 so
    // already-issued tokens for a never-logged-out user keep working.
    if ((decoded.tokenVersion || 0) !== (user.tokenVersion || 0)) {
      return res.status(401).json({
        success: false,
        error: 'Refresh token has been revoked, please log in again'
      });
    }

    // Generate new tokens
    const token = generateToken(user.id);
    const newRefreshToken = generateRefreshToken(user.id, user.tokenVersion);

    res.status(200).json({
      success: true,
      data: {
        token,
        refreshToken: newRefreshToken
      }
    });
  } catch (error) {
    logger.error('Refresh token error:', error);

    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        error: 'Invalid or expired refresh token'
      });
    }

    next(error);
  }
};

/**
 * @desc    Logout user
 * @route   POST /api/v1/auth/logout
 * @access  Private
 */
const logout = async (req, res, next) => {
  try {
    // Bump tokenVersion so every refresh token issued before this moment is
    // rejected by refreshToken() above — this is what makes logout actually
    // revoke access instead of just being a client-side localStorage clear.
    // Access tokens (short-lived) remain valid until natural expiry, matching
    // how most JWT-based APIs handle this tradeoff.
    if (req.user) {
      await req.user.update({ tokenVersion: req.user.tokenVersion + 1 });
    }

    // Destroy the server-side Express session so the browser's session cookie
    // becomes invalid on the next request.
    if (req.session) {
      await new Promise((resolve, reject) => {
        req.session.destroy((err) => {
          if (err) reject(err);
          else resolve(null);
        });
      });
    }
    res.status(200).json({
      success: true,
      message: 'Logged out successfully'
    });
  } catch (error) {
    logger.error('Logout error:', error);
    next(error);
  }
};

/**
 * @desc    Get current logged in user
 * @route   GET /api/v1/auth/me
 * @access  Private
 */
const getMe = async (req, res, next) => {
  try {
    const user = await User.findByPk(req.user.id, {
      attributes: { exclude: ['password', 'twoFactorSecret'] }
    });

    res.status(200).json({
      success: true,
      data: user
    });
  } catch (error) {
    logger.error('Get me error:', error);
    next(error);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// PASSWORD RESET
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Creates a Nodemailer transporter using the SMTP env vars.
 * Extracted so both forgotPassword and resetPassword can reuse it.
 */
const createTransporter = () =>
  nodemailer.createTransport({
    host:   process.env.SMTP_HOST,
    port:   parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true',
    auth:   { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });

/**
 * Builds the production-grade password reset email HTML.
 */
const buildResetEmail = (resetUrl, firstName) => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Reset your Projva password</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;background:#ffffff;border-radius:16px;border:1px solid #e5e7eb;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.06);">

        <!-- Header -->
        <tr>
          <td style="background:#4f46e5;padding:32px 48px;text-align:center;">
            <span style="color:#ffffff;font-size:22px;font-weight:700;letter-spacing:-0.5px;">Projva</span>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:40px 48px 32px;">
            <p style="margin:0 0 8px;font-size:13px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.8px;">Password Reset</p>
            <h1 style="margin:0 0 16px;font-size:26px;font-weight:700;color:#111827;line-height:1.3;">Reset your password</h1>
            <p style="margin:0 0 28px;font-size:15px;color:#6b7280;line-height:1.7;">
              Hi${firstName ? ` ${firstName}` : ''}, we received a request to reset the password for your Projva account.
              Click the button below to choose a new password.
            </p>

            <!-- CTA Button -->
            <table cellpadding="0" cellspacing="0" style="margin-bottom:32px;">
              <tr>
                <td style="background:#4f46e5;border-radius:10px;">
                  <a href="${resetUrl}"
                     style="display:inline-block;padding:14px 36px;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;letter-spacing:0.2px;">
                    Reset Password
                  </a>
                </td>
              </tr>
            </table>

            <!-- Expiry warning -->
            <table cellpadding="0" cellspacing="0" style="background:#fef9ec;border:1px solid #fde68a;border-radius:8px;margin-bottom:28px;width:100%;">
              <tr>
                <td style="padding:14px 18px;">
                  <p style="margin:0;font-size:13px;color:#92400e;">
                    ⏱ This link expires in <strong>1 hour</strong>. After that you'll need to request a new one.
                  </p>
                </td>
              </tr>
            </table>

            <!-- Fallback URL -->
            <p style="margin:0 0 6px;font-size:13px;color:#9ca3af;">If the button doesn't work, paste this URL into your browser:</p>
            <p style="margin:0;font-size:12px;color:#4f46e5;word-break:break-all;">${resetUrl}</p>
          </td>
        </tr>

        <!-- Divider -->
        <tr><td style="padding:0 48px;"><div style="height:1px;background:#e5e7eb;"></div></td></tr>

        <!-- Security Notice -->
        <tr>
          <td style="padding:24px 48px;">
            <p style="margin:0;font-size:13px;color:#9ca3af;line-height:1.6;">
              🔒 If you didn't request a password reset, you can safely ignore this email.
              Your password will remain unchanged. If you're concerned about your account security,
              please contact us at <a href="mailto:support@projva.dev" style="color:#4f46e5;text-decoration:none;">support@projva.dev</a>.
            </p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:24px 48px 32px;background:#f9fafb;border-top:1px solid #e5e7eb;">
            <p style="margin:0;font-size:12px;color:#9ca3af;text-align:center;">
              © ${new Date().getFullYear()} Projva · Project Management Platform<br/>
              This email was sent to you because an account recovery was requested.
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

/**
 * Builds the password-changed confirmation email HTML.
 */
const buildPasswordChangedEmail = (firstName) => `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><title>Password changed — Projva</title></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;background:#ffffff;border-radius:16px;border:1px solid #e5e7eb;overflow:hidden;">
        <tr><td style="background:#4f46e5;padding:32px 48px;text-align:center;">
          <span style="color:#ffffff;font-size:22px;font-weight:700;">Projva</span>
        </td></tr>
        <tr><td style="padding:40px 48px;">
          <h1 style="margin:0 0 16px;font-size:24px;font-weight:700;color:#111827;">Password changed successfully</h1>
          <p style="margin:0 0 24px;font-size:15px;color:#6b7280;line-height:1.7;">
            Hi${firstName ? ` ${firstName}` : ''}, your Projva account password was changed successfully.
            You can now sign in with your new password.
          </p>
          <table cellpadding="0" cellspacing="0" style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;width:100%;margin-bottom:24px;">
            <tr><td style="padding:14px 18px;">
              <p style="margin:0;font-size:13px;color:#166534;">✅ Password updated successfully</p>
            </td></tr>
          </table>
          <p style="margin:0;font-size:13px;color:#9ca3af;line-height:1.6;">
            If you didn't make this change, your account may be compromised. Please contact
            <a href="mailto:support@projva.dev" style="color:#4f46e5;">support@projva.dev</a> immediately.
          </p>
        </td></tr>
        <tr><td style="padding:24px 48px 32px;background:#f9fafb;border-top:1px solid #e5e7eb;">
          <p style="margin:0;font-size:12px;color:#9ca3af;text-align:center;">© ${new Date().getFullYear()} Projva</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

/**
 * @desc    Request password reset email
 * @route   POST /api/v1/auth/forgot-password
 * @access  Public
 */
const forgotPassword = async (req, res) => {
  const { email } = req.body;

  // Always 200 — never reveal whether email exists (prevents enumeration)
  const genericResponse = () =>
    res.status(200).json({
      success: true,
      message: 'If that email is registered, a reset link has been sent.'
    });

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ success: false, error: 'Please provide a valid email address.' });
  }

  try {
    const user = await User.findOne({ where: { email: email.toLowerCase().trim() } });

    // Silent exit — do not leak existence
    if (!user || !user.isActive) return genericResponse();

    // Generate raw token (sent in email) — store only the SHA-256 hash in DB
    const rawToken   = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiry      = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await user.update({ passwordResetToken: hashedToken, passwordResetExpiry: expiry });

    const resetUrl = `${process.env.FRONTEND_URL}/reset-password/${rawToken}`;

    // Send email (non-fatal — server continues even if SMTP fails)
    try {
      const transporter = createTransporter();
      await transporter.verify(); // fail fast if credentials are wrong
      await transporter.sendMail({
        from:    getMailFrom(),
        to:      user.email,
        subject: 'Reset your Projva password',
        html:    buildResetEmail(resetUrl, user.firstName),
      });
      logger.info(`Password reset email sent to ${user.email}`);
    } catch (emailErr) {
      logger.error(`Password reset email FAILED for ${user.email}: ${emailErr.message}`);
      // Token is already saved — user can retry. Do not reveal the error to client.
    }

    return genericResponse();
  } catch (error) {
    logger.error('Forgot password error:', error);
    return genericResponse(); // even on error — don't leak
  }
};

/**
 * @desc    Reset password with token
 * @route   POST /api/v1/auth/reset-password
 * @access  Public
 */
const resetPassword = async (req, res) => {
  const { token, password } = req.body;

  if (!token || !password) {
    return res.status(400).json({ success: false, error: 'Token and new password are required.' });
  }

  // Password strength validation
  const passwordErrors = [];
  if (password.length < 8)               passwordErrors.push('at least 8 characters');
  if (!/[A-Z]/.test(password))           passwordErrors.push('one uppercase letter');
  if (!/[a-z]/.test(password))           passwordErrors.push('one lowercase letter');
  if (!/[0-9]/.test(password))           passwordErrors.push('one number');
  if (passwordErrors.length) {
    return res.status(400).json({
      success: false,
      error: `Password must contain ${passwordErrors.join(', ')}.`
    });
  }

  try {
    // Hash incoming token and look up user
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    const user = await User.findOne({
      where: {
        passwordResetToken:  hashedToken,
        passwordResetExpiry: { [require('sequelize').Op.gt]: new Date() }
      }
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        error: 'This reset link is invalid or has expired. Please request a new one.'
      });
    }

    // Update password and clear the reset token in one operation
    await user.update({
      password:            password,  // model beforeUpdate hook will bcrypt-hash this
      passwordResetToken:  null,
      passwordResetExpiry: null,
    });

    // Send confirmation email (non-fatal)
    try {
      const transporter = createTransporter();
      await transporter.sendMail({
        from:    getMailFrom(),
        to:      user.email,
        subject: 'Your Projva password has been changed',
        html:    buildPasswordChangedEmail(user.firstName),
      });
    } catch (emailErr) {
      logger.warn('Password-changed confirmation email failed:', emailErr.message);
    }

    logger.info(`Password reset successful for user ${user.id}`);

    return res.status(200).json({
      success: true,
      message: 'Password reset successfully. You can now sign in with your new password.'
    });
  } catch (error) {
    logger.error('Reset password error:', error);
    return res.status(500).json({ success: false, error: 'Something went wrong. Please try again.' });
  }
};

module.exports = {
  generateToken,
  generateRefreshToken,
  register,
  login,
  refreshToken,
  logout,
  getMe,
  forgotPassword,
  resetPassword,
  buildResetEmail,
  buildPasswordChangedEmail,
  createTransporter,
};
