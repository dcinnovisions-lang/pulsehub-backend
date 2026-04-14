const express = require('express');
const router = express.Router();
const resourceController = require('../controllers/resource.controller');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/auth');

// All routes require authentication
router.use(authenticate);

// Resource routes
router.get('/', resourceController.listResources);
router.get('/workload', resourceController.getWorkload);
router.post('/', authorize('super_admin', 'admin'), resourceController.createOrUpdateResource);
router.put('/:id', resourceController.updateResource);
router.delete('/:id', resourceController.deleteResource);

module.exports = router;

