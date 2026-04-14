const express = require('express');
const router = express.Router();
const commentController = require('../controllers/comment.controller');
const { authenticate } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permissions');
const { validateCreateComment, validateUpdateComment, validateReaction } = require('../validators/comment.validator');

// Comment routes
router.get('/tasks/:taskId/comments', authenticate, commentController.getCommentsByTask);
router.post('/tasks/:taskId/comments',             authenticate, checkPermission({ resource: 'comment', action: 'create' }), validateCreateComment, commentController.createComment);
router.put('/comments/:id',                        authenticate, checkPermission({ resource: 'comment', action: 'update' }), validateUpdateComment, commentController.updateComment);
router.delete('/comments/:id',                     authenticate, checkPermission({ resource: 'comment', action: 'delete' }), commentController.deleteComment);
router.post('/comments/:id/reactions',             authenticate, checkPermission({ resource: 'comment', action: 'create' }), validateReaction, commentController.addReaction);
router.delete('/comments/:id/reactions/:emoji',    authenticate, checkPermission({ resource: 'comment', action: 'delete' }), commentController.removeReaction);

module.exports = router;

