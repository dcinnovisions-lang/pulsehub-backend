const express = require('express');
const router = express.Router();
const workflowController = require('../controllers/workflow.controller');
const { authenticate } = require('../middleware/auth');

// All routes require authentication
router.use(authenticate);

// Workflow routes
router.get('/', workflowController.getWorkflows);
router.get('/templates', workflowController.getWorkflowTemplates);
router.get('/:id', workflowController.getWorkflowById);
router.post('/', workflowController.createWorkflow);
router.put('/:id', workflowController.updateWorkflow);
router.delete('/:id', workflowController.deleteWorkflow);
router.post('/:id/apply', workflowController.applyWorkflowTemplate);

module.exports = router;




