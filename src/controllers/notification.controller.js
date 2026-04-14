// Notification controller
// Handles fetching, marking as read, and deleting notifications.
// Notifications are created internally by other controllers via createNotification().

'use strict';

const { Notification, User } = require('../models');
const { Op } = require('sequelize');
const logger = require('../utils/logger');

// ─── Internal helper — called by other controllers ──────────────────────────
/**
 * Create a notification for a user.
 * Non-fatal: errors are logged but never thrown.
 *
 * @param {object} opts
 * @param {string}  opts.userId     — recipient
 * @param {string}  opts.type       — NOTIFICATION_TYPES value
 * @param {string}  opts.title      — short title
 * @param {string}  [opts.body]     — detail text
 * @param {string}  [opts.entityType]
 * @param {string}  [opts.entityId]
 * @param {string}  [opts.actorId]  — who triggered it
 * @param {object}  [opts.metadata] — extra context { url, projectId, ... }
 */
const createNotification = async (opts) => {
  try {
    // Never notify the actor about their own action
    if (opts.userId === opts.actorId) return null;

    const notification = await Notification.create({
      userId:     opts.userId,
      type:       opts.type,
      title:      opts.title,
      body:       opts.body       || null,
      entityType: opts.entityType || null,
      entityId:   opts.entityId   || null,
      actorId:    opts.actorId    || null,
      metadata:   opts.metadata   || {}
    });

    // Push real-time notification to recipient via Socket.io
    try {
      const { getIO, userSockets } = require('../socket');
      const io = getIO();
      if (io && userSockets) {
        const socketId = userSockets.get(String(opts.userId));
        if (socketId) {
          io.to(socketId).emit('notification:new', notification.toJSON());
        }
      }
    } catch (e) { /* non-fatal — socket may not be initialized yet */ }

    return notification;
  } catch (err) {
    logger.warn('createNotification failed (non-fatal):', err.message);
    return null;
  }
};

// ─── GET /api/v1/notifications ───────────────────────────────────────────────
/**
 * @desc    Get notifications for the authenticated user
 * @route   GET /api/v1/notifications
 * @access  Private
 * @query   unreadOnly (bool), page, limit
 */
const getNotifications = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const unreadOnly = req.query.unreadOnly === 'true';
    const page  = Math.max(1, parseInt(req.query.page  || '1'));
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit || '20')));
    const offset = (page - 1) * limit;

    const whereClause = { userId };
    if (unreadOnly) whereClause.isRead = false;

    const { count, rows } = await Notification.findAndCountAll({
      where: whereClause,
      include: [
        {
          model: User,
          as: 'actor',
          attributes: ['id', 'firstName', 'lastName', 'avatar'],
          required: false
        }
      ],
      order: [['createdAt', 'DESC']],
      limit,
      offset
    });

    // Also return unread count (always, regardless of filter)
    const unreadCount = await Notification.count({
      where: { userId, isRead: false }
    });

    res.status(200).json({
      success: true,
      count,
      unreadCount,
      page,
      totalPages: Math.ceil(count / limit),
      data: rows
    });
  } catch (error) {
    logger.error('getNotifications error:', error);
    next(error);
  }
};

// ─── GET /api/v1/notifications/unread-count ───────────────────────────────────
/**
 * @desc    Get just the unread count (lightweight poll)
 * @route   GET /api/v1/notifications/unread-count
 * @access  Private
 */
const getUnreadCount = async (req, res, next) => {
  try {
    const count = await Notification.count({
      where: { userId: req.user.id, isRead: false }
    });
    res.status(200).json({ success: true, count });
  } catch (error) {
    logger.error('getUnreadCount error:', error);
    next(error);
  }
};

// ─── PUT /api/v1/notifications/:id/read ─────────────────────────────────────
/**
 * @desc    Mark a single notification as read
 * @route   PUT /api/v1/notifications/:id/read
 * @access  Private
 */
const markAsRead = async (req, res, next) => {
  try {
    const notif = await Notification.findOne({
      where: { id: req.params.id, userId: req.user.id }
    });
    if (!notif) {
      return res.status(404).json({ success: false, error: 'Notification not found' });
    }
    if (!notif.isRead) {
      await notif.update({ isRead: true, readAt: new Date() });
    }
    res.status(200).json({ success: true, data: notif });
  } catch (error) {
    logger.error('markAsRead error:', error);
    next(error);
  }
};

// ─── PUT /api/v1/notifications/read-all ─────────────────────────────────────
/**
 * @desc    Mark all notifications as read
 * @route   PUT /api/v1/notifications/read-all
 * @access  Private
 */
const markAllAsRead = async (req, res, next) => {
  try {
    const [count] = await Notification.update(
      { isRead: true, readAt: new Date() },
      { where: { userId: req.user.id, isRead: false } }
    );
    res.status(200).json({ success: true, marked: count });
  } catch (error) {
    logger.error('markAllAsRead error:', error);
    next(error);
  }
};

// ─── DELETE /api/v1/notifications/:id ────────────────────────────────────────
/**
 * @desc    Delete a notification
 * @route   DELETE /api/v1/notifications/:id
 * @access  Private
 */
const deleteNotification = async (req, res, next) => {
  try {
    const notif = await Notification.findOne({
      where: { id: req.params.id, userId: req.user.id }
    });
    if (!notif) {
      return res.status(404).json({ success: false, error: 'Notification not found' });
    }
    await notif.destroy();
    res.status(200).json({ success: true, message: 'Notification deleted' });
  } catch (error) {
    logger.error('deleteNotification error:', error);
    next(error);
  }
};

// ─── DELETE /api/v1/notifications ────────────────────────────────────────────
/**
 * @desc    Delete all read notifications for the user
 * @route   DELETE /api/v1/notifications
 * @access  Private
 */
const clearReadNotifications = async (req, res, next) => {
  try {
    const count = await Notification.destroy({
      where: { userId: req.user.id, isRead: true }
    });
    res.status(200).json({ success: true, deleted: count });
  } catch (error) {
    logger.error('clearReadNotifications error:', error);
    next(error);
  }
};

module.exports = {
  createNotification,
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  clearReadNotifications
};
