const nodemailer = require('nodemailer');
const crypto = require('crypto');
const { User } = require('../models');
const logger = require('../utils/logger');
const { createTransporter } = require('./auth-core.controller');

/**
 * @desc    Verify email address via token
 * @route   GET /api/v1/auth/verify-email/:token
 * @access  Public
 */
exports.verifyEmail = async (req, res) => {
  try {
    const { token } = req.params;
    const user = await User.findOne({
      where: { emailVerificationToken: token },
    });
    if (!user) return res.status(400).json({ success: false, error: 'Invalid or expired verification link' });
    if (user.emailVerificationExpiry < new Date()) {
      return res.status(400).json({ success: false, error: 'Verification link has expired. Please request a new one.' });
    }
    await user.update({ isEmailVerified: true, emailVerificationToken: null, emailVerificationExpiry: null });
    res.json({ success: true, message: 'Email verified successfully. You can now log in.' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * @desc    Resend email verification link
 * @route   POST /api/v1/auth/resend-verification
 * @access  Private
 */
exports.resendVerification = async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id);
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });
    if (user.isEmailVerified) return res.status(400).json({ success: false, error: 'Email already verified' });

    const verificationToken = crypto.randomBytes(32).toString('hex');
    await user.update({
      emailVerificationToken: verificationToken,
      emailVerificationExpiry: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });

    try {
      const transporter = nodemailer.createTransporter({
        host: process.env.SMTP_HOST, port: parseInt(process.env.SMTP_PORT || '587'),
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      });
      const verifyUrl = `${process.env.FRONTEND_URL}/verify-email/${verificationToken}`;
      await transporter.sendMail({
        from: process.env.SMTP_FROM || 'Projva <noreply@projva.dev>',
        to: user.email, subject: 'Verify your Projva account',
        html: `<p>Click to verify: <a href="${verifyUrl}">Verify Email</a></p>`,
      });
    } catch (e) { console.warn('Email send failed:', e.message); }

    res.json({ success: true, message: 'Verification email sent' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};
