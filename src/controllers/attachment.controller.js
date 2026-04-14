const { Attachment, Task, User, Project, WorkspaceMembers } = require('../models');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const logger = require('../utils/logger');

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../../uploads');
    try {
      await fs.mkdir(uploadDir, { recursive: true });
      cb(null, uploadDir);
    } catch (error) {
      cb(error, uploadDir);
    }
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const ALLOWED_MIME_TYPES = new Set([
  // Images
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
  // Documents
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  // Text
  'text/plain', 'text/csv', 'text/markdown',
  // Archives
  'application/zip', 'application/x-zip-compressed',
  // Video/Audio
  'video/mp4', 'video/webm', 'audio/mpeg', 'audio/wav',
]);

const fileFilter = (req, file, cb) => {
  if (ALLOWED_MIME_TYPES.has(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`File type "${file.mimetype}" is not allowed`), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 100 * 1024 * 1024 // 100MB limit
  }
});

/**
 * @desc    Get all attachments for a task
 * @route   GET /api/v1/tasks/:taskId/attachments
 * @access  Private
 */
const getAttachmentsByTask = async (req, res, next) => {
  try {
    const { taskId } = req.params;

    // Verify task exists
    const task = await Task.findByPk(taskId);
    if (!task) {
      return res.status(404).json({
        success: false,
        error: 'Task not found'
      });
    }

  const page   = Math.max(1, parseInt(req.query.page)  || 1);
    const limit  = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const offset = (page - 1) * limit;

    const { count, rows: attachments } = await Attachment.findAndCountAll({
      where: { taskId },
      include: [
        {
          model: User,
          as: 'uploader',
          attributes: ['id', 'email', 'firstName', 'lastName', 'avatar']
        }
      ],
      order: [['createdAt', 'DESC']],
      limit,
      offset,
      distinct: true
    });

    res.status(200).json({
      success: true,
      count: attachments.length,
      total: count,
      pagination: {
        page,
        limit,
        totalPages: Math.ceil(count / limit),
        hasNextPage: page < Math.ceil(count / limit),
        hasPrevPage: page > 1
      },
      data: attachments
    });
  } catch (error) {
    logger.error('Get attachments by task error:', error);
    next(error);
  }
};

/**
 * @desc    Upload attachment
 * @route   POST /api/v1/tasks/:taskId/attachments
 * @access  Private
 */
const uploadAttachment = async (req, res, next) => {
  try {
    const { taskId } = req.params;
    const userId = req.user.id;

    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No file uploaded'
      });
    }

    // Verify task exists
    const task = await Task.findByPk(taskId);
    if (!task) {
      // Delete uploaded file if task doesn't exist
      if (req.file.path) {
        try {
          await fs.unlink(req.file.path);
        } catch (err) {
          logger.error('Error deleting file:', err);
        }
      }
      return res.status(404).json({
        success: false,
        error: 'Task not found'
      });
    }

    const attachment = await Attachment.create({
      filename: req.file.filename,
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
      size: req.file.size,
      path: req.file.path,
      taskId,
      uploadedBy: userId
    });

    // Reload with associations
    await attachment.reload({
      include: [
        {
          model: User,
          as: 'uploader',
          attributes: ['id', 'email', 'firstName', 'lastName', 'avatar']
        }
      ]
    });

    res.status(201).json({
      success: true,
      data: attachment
    });
  } catch (error) {
    // Delete uploaded file on error
    if (req.file && req.file.path) {
      try {
        await fs.unlink(req.file.path);
      } catch (err) {
        logger.error('Error deleting file on error:', err);
      }
    }
    logger.error('Upload attachment error:', error);
    next(error);
  }
};

/**
 * @desc    Download attachment
 * @route   GET /api/v1/attachments/:id/download
 * @access  Private
 */
const downloadAttachment = async (req, res, next) => {
  try {
    const { id } = req.params;

    const attachment = await Attachment.findByPk(id, {
      include: [{
        model: Task,
        as: 'task',
        attributes: ['id', 'projectId'],
        include: [{
          model: Project,
          as: 'project',
          attributes: ['id', 'workspaceId']
        }]
      }]
    });
    if (!attachment) {
      return res.status(404).json({
        success: false,
        error: 'Attachment not found'
      });
    }

    // Authorization: verify user has access to the attachment's workspace
    const workspaceId = attachment.task?.project?.workspaceId;
    if (workspaceId && req.user.role !== 'super_admin') {
      const membership = await WorkspaceMembers.findOne({
        where: { workspaceId, userId: req.user.id }
      });
      if (!membership) {
        return res.status(403).json({ success: false, error: 'Access denied' });
      }
    }

    const filePath = attachment.path;
    const fileName = attachment.originalName;

    // Check if file exists
    try {
      await fs.access(filePath);
    } catch (error) {
      return res.status(404).json({
        success: false,
        error: 'File not found on server'
      });
    }

    res.download(filePath, fileName, (err) => {
      if (err) {
        logger.error('Download error:', err);
        if (!res.headersSent) {
          res.status(500).json({
            success: false,
            error: 'Error downloading file'
          });
        }
      }
    });
  } catch (error) {
    logger.error('Download attachment error:', error);
    next(error);
  }
};

/**
 * @desc    Delete attachment
 * @route   DELETE /api/v1/attachments/:id
 * @access  Private
 */
const deleteAttachment = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const attachment = await Attachment.findByPk(id);
    if (!attachment) {
      return res.status(404).json({
        success: false,
        error: 'Attachment not found'
      });
    }

    // Only the uploader can delete
    if (attachment.uploadedBy !== userId) {
      return res.status(403).json({
        success: false,
        error: 'You can only delete your own attachments'
      });
    }

    const filePath = attachment.path;

    // Delete file from filesystem
    try {
      await fs.unlink(filePath);
    } catch (error) {
      logger.warn('File not found for deletion:', filePath);
    }

    // Delete from database
    await attachment.destroy();

    res.status(200).json({
      success: true,
      data: {}
    });
  } catch (error) {
    logger.error('Delete attachment error:', error);
    next(error);
  }
};

// Export multer middleware separately for route usage
const uploadMiddleware = upload.single('file');

module.exports = {
  getAttachmentsByTask,
  uploadMiddleware,
  uploadAttachment,
  downloadAttachment,
  deleteAttachment
};

