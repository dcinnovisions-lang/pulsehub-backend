const { Document } = require('../models');
const { Op } = require('sequelize');
const logger = require('../utils/logger');
const { ensureWorkspaceAccess } = require('../utils/accessControl');

const requireAccess = (req, { workspaceId, projectId }) =>
  ensureWorkspaceAccess(req.user, { workspaceId, projectId });

exports.createDocument = async (req, res, next) => {
  try {
    const { title, content, contentType = 'html', workspaceId, projectId } = req.body;

    const access = await requireAccess(req, { workspaceId, projectId });
    if (access !== true) return res.status(access.status).json({ success: false, error: access.message });

    if (req.user.role === 'guest') {
      return res.status(403).json({ success: false, error: 'Guests cannot create documents' });
    }

    const doc = await Document.create({
      title,
      content,
      contentType,
      workspaceId,
      projectId,
      createdBy: req.user.id,
      updatedBy: req.user.id
    });

    res.status(201).json({ success: true, data: doc });
  } catch (error) {
    logger.error('Create document error:', error);
    next(error);
  }
};

exports.getDocuments = async (req, res, next) => {
  try {
    const { workspaceId, projectId, search } = req.query;
    const access = await requireAccess(req, { workspaceId, projectId });
    if (access !== true) return res.status(access.status).json({ success: false, error: access.message });

    const page   = Math.max(1, parseInt(req.query.page)  || 1);
    const limit  = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const offset = (page - 1) * limit;

    const where = { isArchived: false };
    if (workspaceId) where.workspaceId = workspaceId;
    if (projectId) where.projectId = projectId;
    if (search) {
      where.title = { [Op.iLike]: `%${search}%` };
    }

    const { count, rows: docs } = await Document.findAndCountAll({
      where,
      order: [['updatedAt', 'DESC']],
      limit,
      offset
    });

    res.status(200).json({
      success: true,
      count: docs.length,
      total: count,
      pagination: {
        page,
        limit,
        totalPages: Math.ceil(count / limit),
        hasNextPage: page < Math.ceil(count / limit),
        hasPrevPage: page > 1
      },
      data: docs
    });
  } catch (error) {
    logger.error('Get documents error:', error);
    next(error);
  }
};

exports.getDocumentById = async (req, res, next) => {
  try {
    const doc = await Document.findByPk(req.params.id);
    if (!doc || doc.isArchived) {
      return res.status(404).json({ success: false, error: 'Document not found' });
    }

    const access = await requireAccess(req, { workspaceId: doc.workspaceId, projectId: doc.projectId });
    if (access !== true) return res.status(access.status).json({ success: false, error: access.message });

    res.status(200).json({ success: true, data: doc });
  } catch (error) {
    logger.error('Get document error:', error);
    next(error);
  }
};

exports.updateDocument = async (req, res, next) => {
  try {
    const doc = await Document.findByPk(req.params.id);
    if (!doc || doc.isArchived) {
      return res.status(404).json({ success: false, error: 'Document not found' });
    }

    const access = await requireAccess(req, { workspaceId: doc.workspaceId, projectId: doc.projectId });
    if (access !== true) return res.status(access.status).json({ success: false, error: access.message });

    if (req.user.role === 'guest') {
      return res.status(403).json({ success: false, error: 'Guests cannot update documents' });
    }

    const { title, content, contentType } = req.body;
    if (title !== undefined) doc.title = title;
    if (content !== undefined) doc.content = content;
    if (contentType !== undefined) doc.contentType = contentType;
    doc.version += 1;
    doc.updatedBy = req.user.id;

    await doc.save();

    res.status(200).json({ success: true, data: doc });
  } catch (error) {
    logger.error('Update document error:', error);
    next(error);
  }
};

exports.shareDocument = async (req, res, next) => {
  try {
    const doc = await Document.findByPk(req.params.id);
    if (!doc || doc.isArchived) return res.status(404).json({ success: false, error: 'Document not found' });

    const access = await requireAccess(req, { workspaceId: doc.workspaceId, projectId: doc.projectId });
    if (access !== true) return res.status(access.status).json({ success: false, error: access.message });
    if (req.user.role === 'guest') return res.status(403).json({ success: false, error: 'Guests cannot share documents' });

    const { v4: uuidv4 } = require('uuid');
    if (!doc.shareToken) doc.shareToken = uuidv4();
    doc.isPublic = true;
    await doc.save();

    res.json({ success: true, data: { shareToken: doc.shareToken, isPublic: true } });
  } catch (error) {
    logger.error('Share document error:', error);
    next(error);
  }
};

exports.unshareDocument = async (req, res, next) => {
  try {
    const doc = await Document.findByPk(req.params.id);
    if (!doc || doc.isArchived) return res.status(404).json({ success: false, error: 'Document not found' });

    const access = await requireAccess(req, { workspaceId: doc.workspaceId, projectId: doc.projectId });
    if (access !== true) return res.status(access.status).json({ success: false, error: access.message });

    doc.isPublic = false;
    await doc.save();

    res.json({ success: true, data: { isPublic: false } });
  } catch (error) {
    logger.error('Unshare document error:', error);
    next(error);
  }
};

exports.getPublicDocument = async (req, res, next) => {
  try {
    const { shareToken } = req.params;
    const doc = await Document.findOne({ where: { shareToken, isPublic: true, isArchived: false } });
    if (!doc) return res.status(404).json({ success: false, error: 'Document not found or no longer shared' });

    res.json({
      success: true,
      data: {
        id: doc.id,
        title: doc.title,
        content: doc.content,
        contentType: doc.contentType,
        version: doc.version,
      }
    });
  } catch (error) {
    logger.error('Get public document error:', error);
    next(error);
  }
};

exports.deleteDocument = async (req, res, next) => {
  try {
    const doc = await Document.findByPk(req.params.id);
    if (!doc || doc.isArchived) {
      return res.status(404).json({ success: false, error: 'Document not found' });
    }

    const access = await requireAccess(req, { workspaceId: doc.workspaceId, projectId: doc.projectId });
    if (access !== true) return res.status(access.status).json({ success: false, error: access.message });

    if (req.user.role === 'guest') {
      return res.status(403).json({ success: false, error: 'Guests cannot delete documents' });
    }

    doc.isArchived = true;
    await doc.save();

    res.status(200).json({ success: true, data: { id: doc.id, archived: true } });
  } catch (error) {
    logger.error('Delete document error:', error);
    next(error);
  }
};
