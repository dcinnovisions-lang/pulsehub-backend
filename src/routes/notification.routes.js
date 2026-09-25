const express = require('express');
const router = express.Router();
const notifCtrl = require('../controllers/notification.controller');
const prefsCtrl = require('../controllers/notificationPrefs.controller');
const { authenticate } = require('../middleware/auth');

router.get('/',                   authenticate, notifCtrl.getNotifications);
router.get('/unread-count',       authenticate, notifCtrl.getUnreadCount);
router.get('/preferences',        authenticate, prefsCtrl.getPreferences);
router.put('/preferences',        authenticate, prefsCtrl.updatePreferences);
router.put('/read-all',           authenticate, notifCtrl.markAllAsRead);
router.put('/:id/read',           authenticate, notifCtrl.markAsRead);
router.delete('/',                authenticate, notifCtrl.clearReadNotifications);
router.delete('/:id',             authenticate, notifCtrl.deleteNotification);

module.exports = router;
