const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const chatController = require('../controllers/chat.controller');
const { uploadLimiter, searchLimiter } = require('../middleware/rateLimiter');
const { validateCreateRoom, validatePostMessage, validateEditMessage, validateChatReaction } = require('../validators/chat.validator');

router.post('/chat/rooms', authenticate, validateCreateRoom, chatController.createRoom);
router.get('/chat/rooms', authenticate, chatController.getRooms);
router.get('/chat/rooms/:roomId/messages', authenticate, chatController.getMessages);
router.post('/chat/rooms/:roomId/messages', authenticate, validatePostMessage, chatController.postMessage);

// Message management
router.put('/chat/messages/:id', authenticate, validateEditMessage, chatController.editMessage);
router.delete('/chat/messages/:id', authenticate, chatController.deleteMessage);

// Reactions
router.post('/chat/messages/:id/reactions', authenticate, validateChatReaction, chatController.addReaction);
router.delete('/chat/messages/:id/reactions/:emoji', authenticate, chatController.removeReaction);

// Thread
router.get('/chat/messages/:id/thread', authenticate, chatController.getThread);

// Search
router.get('/chat/messages/search', authenticate, searchLimiter, chatController.searchMessages);

// File upload
router.post('/chat/rooms/:roomId/upload', authenticate, uploadLimiter, chatController.uploadFile);

module.exports = router;
