const express = require('express');
const router = express.Router();
const taskDependencyController = require('../controllers/taskDependency.controller');
const { authenticate } = require('../middleware/auth');

// Task dependency routes
router.get('/tasks/:taskId/dependencies', authenticate, taskDependencyController.getDependencies);
router.post('/tasks/:taskId/dependencies', authenticate, taskDependencyController.createDependency);
router.delete('/tasks/:taskId/dependencies/:dependencyId', authenticate, taskDependencyController.deleteDependency);
router.get('/tasks/:taskId/dependency-graph', authenticate, taskDependencyController.getDependencyGraph);

module.exports = router;


