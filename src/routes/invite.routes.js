const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { validateSendInvite } = require('../validators/invite.validator');
const {
  sendInvite,
  getInviteByToken,
  acceptInvite,
  listInvites,
  cancelInvite
} = require('../controllers/invite.controller');

// Protected routes (must come before parameterized routes)
router.post('/', authenticate, validateSendInvite, sendInvite);
router.get('/', authenticate, listInvites);

// Public routes
router.get('/:token', getInviteByToken);
router.post('/:token/accept', acceptInvite);

// Protected routes with parameters
router.delete('/:id', authenticate, cancelInvite);

module.exports = router;

