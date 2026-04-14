const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permissions');
const documentController = require('../controllers/document.controller');
const { validateCreateDocument, validateUpdateDocument } = require('../validators/document.validator');

// Public document access (no auth required) — MUST be before /:id routes
router.get('/documents/public/:shareToken', documentController.getPublicDocument);

router.post('/documents',      authenticate, checkPermission({ resource: 'document', action: 'create' }), validateCreateDocument, documentController.createDocument);
router.get('/documents',       authenticate, documentController.getDocuments);
router.get('/documents/:id',   authenticate, checkPermission({ resource: 'document', action: 'read'   }), documentController.getDocumentById);
router.put('/documents/:id',   authenticate, checkPermission({ resource: 'document', action: 'update' }), validateUpdateDocument, documentController.updateDocument);
router.delete('/documents/:id', authenticate, checkPermission({ resource: 'document', action: 'delete' }), documentController.deleteDocument);

// Share / unshare (update-level permission)
router.post('/documents/:id/share',   authenticate, checkPermission({ resource: 'document', action: 'update' }), documentController.shareDocument);
router.delete('/documents/:id/share', authenticate, checkPermission({ resource: 'document', action: 'update' }), documentController.unshareDocument);

module.exports = router;
