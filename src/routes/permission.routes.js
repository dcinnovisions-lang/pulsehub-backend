const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { getPermissionMatrix } = require('../controllers/permission.controller');

router.get('/permissions/matrix', authenticate, getPermissionMatrix);

module.exports = router;
