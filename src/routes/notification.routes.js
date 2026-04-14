const express = require('express');
const router = express.Router();
const notifCtrl = require('../controllers/notification.controller');
const { authenticate } = require('../middleware/auth');

router.get('/',                   authenticate, notifCtrl.getNotifications);
router.get('/unread-count',       authenticate, notifCtrl.getUnreadCount);
router.put('/read-all',           authenticate, notifCtrl.markAllAsRead);
router.put('/:id/read',           authenticate, notifCtrl.markAsRead);
router.delete('/',                authenticate, notifCtrl.clearReadNotifications);
router.delete('/:id',             authenticate, notifCtrl.deleteNotification);

module.exports = router;
