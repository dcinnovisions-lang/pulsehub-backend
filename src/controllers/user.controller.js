const { User } = require('../models');
const logger = require('../utils/logger');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const avatarStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '../../uploads/avatars');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `avatar_${req.user.id}_${Date.now()}${ext}`);
  },
});
const avatarUpload = multer({ storage: avatarStorage, limits: { fileSize: 2 * 1024 * 1024 }, fileFilter: (req, file, cb) => {
  if (file.mimetype.startsWith('image/')) cb(null, true);
  else cb(new Error('Only image files allowed'));
}});

/**
 * @desc    Get all users
 * @route   GET /api/v1/users
 * @access  Private (Super Admin/Admin/PM)
 */
const getAllUsers = async (req, res, next) => {
  try {
    const page   = Math.max(1, parseInt(req.query.page)  || 1);
    const limit  = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const offset = (page - 1) * limit;

    const { count, rows: users } = await User.findAndCountAll({
      attributes: { exclude: ['password', 'twoFactorSecret'] },
      order: [['createdAt', 'DESC']],
      limit,
      offset
    });

    res.status(200).json({
      success: true,
      count: users.length,
      total: count,
      pagination: {
        page,
        limit,
        totalPages: Math.ceil(count / limit),
        hasNextPage: page < Math.ceil(count / limit),
        hasPrevPage: page > 1
      },
      data: users
    });
  } catch (error) {
    logger.error('Get all users error:', error);
    next(error);
  }
};

/**
 * @desc    Update user role (Super Admin only)
 * @route   PUT /api/v1/users/:id/role
 * @access  Private (Super Admin)
 */
const updateUserRole = async (req, res, next) => {
  try {
    const { role } = req.body;
    const { id } = req.params;

    // Validate role
    const validRoles = ['super_admin', 'admin', 'pm', 'member', 'viewer'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid role. Must be one of: super_admin, admin, pm, member, viewer'
      });
    }

    // Prevent super admin from changing their own role
    if (id === req.user.id && role !== 'super_admin') {
      return res.status(403).json({
        success: false,
        error: 'You cannot change your own role from super_admin'
      });
    }

    const user = await User.findByPk(id);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Prevent changing another super admin's role
    if (user.role === 'super_admin' && id !== req.user.id) {
      return res.status(403).json({
        success: false,
        error: 'Cannot modify another super admin\'s role'
      });
    }

    await user.update({ role });

    res.status(200).json({
      success: true,
      data: {
        id: user.id,
        email: user.email,
        role: user.role
      },
      message: 'User role updated successfully'
    });
  } catch (error) {
    logger.error('Update user role error:', error);
    next(error);
  }
};

/**
 * @desc    Get user by ID
 * @route   GET /api/v1/users/:id
 * @access  Private
 */
const getUserById = async (req, res, next) => {
  try {
    const user = await User.findByPk(req.params.id, {
      attributes: { exclude: ['password', 'twoFactorSecret'] }
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    res.status(200).json({
      success: true,
      data: user
    });
  } catch (error) {
    logger.error('Get user by ID error:', error);
    next(error);
  }
};

/**
 * @desc    Update user
 * @route   PUT /api/v1/users/:id
 * @access  Private
 */
const updateUser = async (req, res, next) => {
  try {
    // Users can only update their own profile unless they're admin
    if (req.user.id !== req.params.id && !['admin', 'super_admin', 'owner'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: 'Not authorized to update this user'
      });
    }

    const { firstName, lastName, avatar, currentPassword, newPassword, timezone } = req.body;

    const user = await User.findByPk(req.params.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Handle password change if requested
    if (newPassword) {
      if (!currentPassword) {
        return res.status(400).json({ success: false, error: 'Current password is required to set a new password.' });
      }
      const bcrypt = require('bcryptjs');
      const isMatch = await bcrypt.compare(currentPassword, user.password);
      if (!isMatch) {
        return res.status(400).json({ success: false, error: 'Current password is incorrect.' });
      }
      const pwErrors = [];
      if (newPassword.length < 8)         pwErrors.push('at least 8 characters');
      if (!/[A-Z]/.test(newPassword))     pwErrors.push('one uppercase letter');
      if (!/[a-z]/.test(newPassword))     pwErrors.push('one lowercase letter');
      if (!/[0-9]/.test(newPassword))     pwErrors.push('one number');
      if (pwErrors.length) {
        return res.status(400).json({ success: false, error: `Password must contain ${pwErrors.join(', ')}.` });
      }
      const hashed = await bcrypt.hash(newPassword, 12);
      await user.update({ password: hashed });
      return res.status(200).json({ success: true, message: 'Password updated successfully.' });
    }

    // Update profile fields — explicit whitelist prevents mass-assignment of role/isActive/etc.
    await user.update({
      firstName: firstName !== undefined ? firstName : user.firstName,
      lastName: lastName !== undefined ? lastName : user.lastName,
      avatar: avatar !== undefined ? avatar : user.avatar,
      ...(timezone !== undefined && { timezone }),
    }, { fields: ['firstName', 'lastName', 'avatar', 'timezone'] });

    // Reload to get updated data
    await user.reload({
      attributes: { exclude: ['password', 'twoFactorSecret'] }
    });

    res.status(200).json({
      success: true,
      data: user
    });
  } catch (error) {
    logger.error('Update user error:', error);
    next(error);
  }
};

/**
 * @desc    Delete user
 * @route   DELETE /api/v1/users/:id
 * @access  Private (Admin)
 */
const deleteUser = async (req, res, next) => {
  try {
    const user = await User.findByPk(req.params.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Soft delete (set isActive to false) instead of hard delete
    await user.update({ isActive: false });

    res.status(200).json({
      success: true,
      message: 'User deactivated successfully'
    });
  } catch (error) {
    logger.error('Delete user error:', error);
    next(error);
  }
};

/**
 * @desc    Delete own account (soft delete with password confirmation)
 * @route   DELETE /api/v1/users/me
 * @access  Private
 */
const deleteAccount = async (req, res, next) => {
  try {
    const user = await User.findByPk(req.user.id);
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });

    const { password } = req.body;
    if (!password) return res.status(400).json({ success: false, error: 'Password required to delete account' });

    const isValid = await require('bcryptjs').compare(password, user.password);
    if (!isValid) return res.status(400).json({ success: false, error: 'Incorrect password' });

    // Soft delete: deactivate account
    await user.update({ isActive: false, email: `deleted_${Date.now()}_${user.email}`, firstName: 'Deleted', lastName: 'User' });

    res.json({ success: true, message: 'Account deleted successfully' });
  } catch (error) {
    logger.error('Delete account error:', error);
    next(error);
  }
};

/**
 * @desc    Upload user avatar
 * @route   POST /api/v1/users/me/avatar
 * @access  Private
 */
const uploadAvatar = [avatarUpload.single('avatar'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, error: 'No file uploaded' });
    const avatarUrl = `/uploads/avatars/${req.file.filename}`;
    await User.findByPk(req.user.id).then(u => u.update({ avatar: avatarUrl }));
    res.json({ success: true, avatarUrl });
  } catch (error) {
    logger.error('Upload avatar error:', error);
    next(error);
  }
}];

module.exports = {
  getAllUsers,
  getUserById,
  updateUser,
  deleteUser,
  updateUserRole,
  deleteAccount,
  uploadAvatar
};


