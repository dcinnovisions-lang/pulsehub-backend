const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permissions');
const whiteboardController = require('../controllers/whiteboard.controller');
const { validateCreateWhiteboard, validateUpsertElements } = require('../validators/whiteboard.validator');

router.post('/whiteboards',    authenticate, checkPermission({ resource: 'whiteboard', action: 'create' }), validateCreateWhiteboard, whiteboardController.createWhiteboard);
router.get('/whiteboards',     authenticate, whiteboardController.getWhiteboards);
router.get('/whiteboards/:id', authenticate, checkPermission({ resource: 'whiteboard', action: 'read'   }), whiteboardController.getWhiteboard);
router.post('/whiteboards/:whiteboardId/elements',              authenticate, checkPermission({ resource: 'whiteboard', action: 'update' }), validateUpsertElements, whiteboardController.upsertElements);
router.delete('/whiteboards/:whiteboardId/elements/:elementId', authenticate, checkPermission({ resource: 'whiteboard', action: 'delete' }), whiteboardController.deleteElement);

module.exports = router;
