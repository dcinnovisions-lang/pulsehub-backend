const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const { User } = require('../models');
const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');

// Serialize user for session
passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findByPk(id);
    done(null, user);
  } catch (error) {
    done(error, null);
  }
});

// Configure Google OAuth Strategy
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_CALLBACK_URL || 'http://localhost:5000/api/v1/auth/google/callback'
  }, async (accessToken, refreshToken, profile, done) => {
    try {
      // Find or create user
      let user = await User.findOne({ where: { email: profile.emails[0].value } });

      if (user) {
        // Update last login
        await user.update({ lastLogin: new Date() });
        return done(null, user);
      }

      // Create new user
      user = await User.create({
        email: profile.emails[0].value,
        firstName: profile.name.givenName,
        lastName: profile.name.familyName,
        password: 'oauth_user_' + profile.id, // Dummy password for OAuth users
        avatar: profile.photos[0]?.value,
        isActive: true
      });

      return done(null, user);
    } catch (error) {
      logger.error('Google OAuth error:', error);
      return done(error, null);
    }
  }));
}

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
 */
const generateRefreshToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRE || '30d'
  });
};

/**
 * @desc    Initiate Google OAuth
 * @route   GET /api/v1/auth/google
 * @access  Public
 */
const googleAuth = (req, res, next) => {
  // Check if Google OAuth is configured
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return res.status(503).json({
      success: false,
      error: 'Google OAuth is not configured. Please set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET environment variables.'
    });
  }
  
  return passport.authenticate('google', {
    scope: ['profile', 'email']
  })(req, res, next);
};

/**
 * @desc    Google OAuth callback
 * @route   GET /api/v1/auth/google/callback
 * @access  Public
 */
const googleCallback = (req, res, next) => {
  // Check if Google OAuth is configured
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/login?error=oauth_not_configured`);
  }

  return passport.authenticate('google', { session: false }, (err, user) => {
    if (err || !user) {
      return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/login?error=oauth_failed`);
    }

    // Generate tokens
    const token = generateToken(user.id);
    const refreshToken = generateRefreshToken(user.id);

    // Redirect to frontend with tokens
    const redirectUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/auth/callback?token=${token}&refreshToken=${refreshToken}`;
    res.redirect(redirectUrl);
  })(req, res, next);
};

module.exports = {
  googleAuth,
  googleCallback
};
