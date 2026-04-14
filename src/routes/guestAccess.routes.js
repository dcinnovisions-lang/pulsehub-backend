const express = require('express');
const router = express.Router();
const guestAccessController = require('../controllers/guestAccess.controller');
const { authenticate } = require('../middleware/auth');
const { validateCreateGuestAccess } = require('../validators/guestAccess.validator');

router.use(authenticate);

router.get('/', guestAccessController.getGuestAccess);
router.post('/', validateCreateGuestAccess, guestAccessController.createGuestAccess);
router.delete('/:id', guestAccessController.revokeGuestAccess);

module.exports = router;
