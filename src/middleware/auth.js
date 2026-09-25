const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { User, ApiKey } = require('../models');
const logger = require('../utils/logger');

/**
 * Authentication middleware to verify JWT token
 */
const authenticate = async (req, res, next) => {
  try {
    // Get token from header
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'No token provided, authorization denied'
      });
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Personal API key (pk_...) instead of a JWT
    if (token.startsWith('pk_')) {
      const keyHash = crypto.createHash('sha256').update(token).digest('hex');
      const apiKey = await ApiKey.findOne({ where: { keyHash } });
      const keyUser = apiKey && await User.findByPk(apiKey.userId, { attributes: { exclude: ['password'] } });
      if (!keyUser) {
        return res.status(401).json({ success: false, error: 'Invalid API key' });
      }
      apiKey.update({ lastUsed: new Date() }).catch(() => {});
      req.user = keyUser;
      return next();
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Get user from token
    const user = await User.findByPk(decoded.id, {
      attributes: { exclude: ['password'] }
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Token is not valid, user not found'
      });
    }

    // Attach user to request object
    req.user = user;
    next();
  } catch (error) {
    logger.error('Authentication error:', error);
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        error: 'Invalid token'
      });
    }
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        error: 'Token expired'
      });
    }

    res.status(500).json({
      success: false,
      error: 'Server error during authentication'
    });
  }
};

/**
 * Authorization middleware to check user roles
 */
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Not authenticated'
      });
    }

    // Super admin has access to everything
    if (req.user.role === 'super_admin') {
      return next();
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: `User role '${req.user.role}' is not authorized to access this route`
      });
    }

    next();
  };
};

module.exports = {
  authenticate,
  authorize
};


