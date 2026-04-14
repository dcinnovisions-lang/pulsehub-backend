const express = require('express');
const router = express.Router();
const attachmentController = require('../controllers/attachment.controller');
const { authenticate } = require('../middleware/auth');
const { uploadLimiter } = require('../middleware/rateLimiter');

// Attachment routes
router.get('/tasks/:taskId/attachments', authenticate, attachmentController.getAttachmentsByTask);
router.post('/tasks/:taskId/attachments', authenticate, uploadLimiter, attachmentController.uploadMiddleware, attachmentController.uploadAttachment);
router.get('/attachments/:id/download', authenticate, attachmentController.downloadAttachment);
router.delete('/attachments/:id', authenticate, attachmentController.deleteAttachment);

module.exports = router;

