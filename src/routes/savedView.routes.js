const express = require('express');
const router = express.Router();
const savedViewController = require('../controllers/savedView.controller');
const { authenticate } = require('../middleware/auth');
const { validateCreateSavedView, validateUpdateSavedView } = require('../validators/savedView.validator');

// All routes require authentication
router.use(authenticate);

// Saved view routes
router.get('/', savedViewController.getSavedViews);
router.get('/:id', savedViewController.getSavedViewById);
router.post('/', validateCreateSavedView, savedViewController.createSavedView);
router.put('/:id', validateUpdateSavedView, savedViewController.updateSavedView);
router.delete('/:id', savedViewController.deleteSavedView);

module.exports = router;




