const express = require('express');
const router = express.Router();
const customFieldController = require('../controllers/customField.controller');
const { authenticate } = require('../middleware/auth');
const { validateCreateCustomField, validateUpdateCustomField } = require('../validators/customField.validator');

// Project custom fields routes
router.get('/projects/:projectId/custom-fields', authenticate, customFieldController.getCustomFields);
router.post('/projects/:projectId/custom-fields', authenticate, validateCreateCustomField, customFieldController.createCustomField);

// Custom field CRUD routes
router.put('/custom-fields/:id', authenticate, validateUpdateCustomField, customFieldController.updateCustomField);
router.delete('/custom-fields/:id', authenticate, customFieldController.deleteCustomField);

// Task custom field value routes
router.get('/tasks/:taskId/custom-fields', authenticate, customFieldController.getTaskCustomFields);
router.put('/tasks/:taskId/custom-fields/:customFieldId', authenticate, customFieldController.setTaskCustomFieldValue);

module.exports = router;


