const express = require('express');
const router = express.Router();
const statusController = require('../controllers/status.controller');
const { authenticate } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permissions');
const { validateCreateStatus, validateUpdateStatus } = require('../validators/status.validator');

// Status routes — authenticate applied per-route (this router is mounted at '/', so
// router.use(authenticate) would run for every unmatched request and cause double
// authentication on routes mounted after this one).
router.get('/projects/:projectId/statuses', authenticate, checkPermission({ resource: 'status', action: 'read' }), statusController.getStatusesByProject);
router.post('/projects/:projectId/statuses', authenticate, checkPermission({ resource: 'status', action: 'update' }), validateCreateStatus, statusController.createStatus);
router.put('/statuses/:id', authenticate, validateUpdateStatus, statusController.updateStatus); // Permission check in controller
router.delete('/statuses/:id', authenticate, statusController.deleteStatus); // Permission check in controller

module.exports = router;

