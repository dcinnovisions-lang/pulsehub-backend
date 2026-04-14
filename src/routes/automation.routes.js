'use strict';

const express = require('express');
const router = express.Router();
const { authenticate: protect } = require('../middleware/auth');
const { validateCreateAutomation, validateUpdateAutomation } = require('../validators/automation.validator');
const {
  getAutomations,
  getAutomation,
  createAutomation,
  updateAutomation,
  deleteAutomation,
  toggleAutomation,
  getAutomationLogs
} = require('../controllers/automation.controller');

router.use(protect);

router.get('/',               getAutomations);
router.post('/',              validateCreateAutomation, createAutomation);
router.get('/:id',            getAutomation);
router.put('/:id',            validateUpdateAutomation, updateAutomation);
router.delete('/:id',         deleteAutomation);
router.patch('/:id/toggle',   toggleAutomation);
router.get('/:id/logs',       getAutomationLogs);

module.exports = router;
