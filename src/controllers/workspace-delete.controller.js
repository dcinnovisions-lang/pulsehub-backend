const {
  Workspace, Project, Task, Subtask, Attachment, Comment, TimeLog,
  TaskAssignees, TaskDependency, List, Status, Workflow, CustomField,
  TaskCustomField, WorkspaceMembers, SavedView, Document, Whiteboard,
  WhiteboardElement, ChatMessage, ChatRoom, Resource, Budget,
  BudgetExpense, Invite, ActivityLog, GuestAccess, ProjectMembers, sequelize
} = require('../models');
const logger = require('../utils/logger');
const { createActivityLog } = require('./activityLog.controller');
const { getIO } = require('../socket');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { Op } = require('sequelize');

/**
 * @desc    Delete workspace
 * @route   DELETE /api/v1/workspaces/:id
 * @access  Private
 */
const deleteWorkspace = async (req, res, next) => {
  try {
    const workspace = await Workspace.findByPk(req.params.id);

    if (!workspace) {
      return res.status(404).json({
        success: false,
        error: 'Workspace not found'
      });
    }

    // Require deletion reason
    if (!req.body || !req.body.reason || String(req.body.reason).trim().length < 5) {
      return res.status(400).json({ success: false, error: 'Delete reason is required and should be at least 5 characters.' });
    }

    // Soft delete workspace and cascade archive related projects/tasks in a transaction
    const t = await sequelize.transaction();
    try {
      await workspace.update({ isActive: false }, { transaction: t });

      // Archive projects under this workspace
      const projects = await Project.findAll({ where: { workspaceId: workspace.id }, attributes: ['id'], transaction: t });
      const projectIds = projects.map(p => p.id);

      if (projectIds.length) {
        await Project.update({ status: 'archived' }, { where: { id: projectIds }, transaction: t });
        // Archive tasks under those projects
        await Task.update({ isArchived: true }, { where: { projectId: projectIds }, transaction: t });
      }

      await t.commit();

      // Activity log with reason (required)
      try {
        await createActivityLog('workspace', workspace.id, 'deleted', req.user.id, null, {
          reason: req.body.reason
        });
      } catch (logErr) {
        logger.warn('Failed to create activity log for workspace delete', logErr);
      }

      res.status(200).json({
        success: true,
        message: 'Workspace deleted successfully'
      });
    } catch (err) {
      await t.rollback();
      throw err;
    }
  } catch (error) {
    logger.error('Delete workspace error:', error);
    next(error);
  }
};

/**
 * @desc    Restore (undelete) workspace
 * @route   POST /api/v1/workspaces/:id/restore
 * @access  Private (super_admin or owner/admin)
 */
const restoreWorkspace = async (req, res, next) => {
  try {
    // Use unscoped to find soft-deleted
    const workspace = await Workspace.unscoped().findByPk(req.params.id);

    if (!workspace) {
      return res.status(404).json({
        success: false,
        error: 'Workspace not found'
      });
    }

    // Transactional restore: workspace -> projects -> tasks
    const t = await sequelize.transaction();
    try {
      await workspace.update({ isActive: true }, { transaction: t });

      // Reactivate projects under this workspace that were archived
      const projects = await Project.findAll({ where: { workspaceId: workspace.id }, attributes: ['id', 'status'], transaction: t });
      const projectIds = projects.map(p => p.id);

      if (projectIds.length) {
        await Project.update({ status: 'active' }, { where: { id: projectIds }, transaction: t });
        // Un-archive tasks under those projects
        await Task.update({ isArchived: false }, { where: { projectId: projectIds }, transaction: t });
      }

      await t.commit();

      // Require restore reason
      if (!req.body || !req.body.reason || String(req.body.reason).trim().length < 3) {
        // rollback is already committed; still record restore but return error
        try {
          await createActivityLog('workspace', workspace.id, 'restored', req.user.id, null, {
            reason: req.body?.reason || null
          });
        } catch (logErr) {
          logger.warn('Failed to create activity log for workspace restore', logErr);
        }
        return res.status(400).json({ success: false, error: 'Restore reason is required and should be at least 3 characters.' });
      }

      // Activity log with required reason
      try {
        await createActivityLog('workspace', workspace.id, 'restored', req.user.id, null, {
          reason: req.body.reason
        });
      } catch (logErr) {
        logger.warn('Failed to create activity log for workspace restore', logErr);
      }

      // Reload with associations (unscoped)
      await workspace.reload({ include: [
        { model: User, as: 'owner', attributes: ['id', 'email', 'firstName', 'lastName', 'avatar'] },
        { model: User, as: 'members', attributes: ['id', 'email', 'firstName', 'lastName', 'avatar'], through: { attributes: ['role'] } }
      ] });

      res.status(200).json({ success: true, data: workspace });
    } catch (err) {
      await t.rollback();
      throw err;
    }
  } catch (error) {
    logger.error('Restore workspace error:', error);
    next(error);
  }
};

/**
 * @desc    Hard delete workspace and all related data (PERMANENT)
 * @route   POST /api/v1/workspaces/:id/hard-delete
 * @access  Private (super_admin only)
 */
const hardDeleteWorkspace = async (req, res, next) => {
  try {
    const workspace = await Workspace.unscoped().findByPk(req.params.id);
    if (!workspace) {
      return res.status(404).json({ success: false, error: 'Workspace not found' });
    }

    const { reason, confirmName } = req.body || {};
    if (!reason || String(reason).trim().length < 5) {
      return res.status(400).json({ success: false, error: 'Deletion reason is required (min 5 characters).' });
    }
    if (!confirmName || String(confirmName).trim() !== workspace.name) {
      return res.status(400).json({ success: false, error: 'Confirmation name does not match workspace name.' });
    }

    const t = await sequelize.transaction();
    try {
      // ── Step 1: Collect IDs ─────────────────────────────────────────────────
      // Use unscoped() so soft-deleted projects/tasks are also cleaned up
      const projects = await Project.unscoped().findAll({
        where: { workspaceId: workspace.id },
        attributes: ['id'],
        transaction: t
      });
      const projectIds = projects.map(p => p.id);

      let taskIds = [];
      if (projectIds.length) {
        const tasks = await Task.unscoped().findAll({
          where: { projectId: projectIds },
          attributes: ['id'],
          transaction: t
        });
        taskIds = tasks.map(tsk => tsk.id);
      }

      // ── Step 2: Delete task-level data ────────────────────────────────────
      // NOTE: No .catch() inside a transaction — any error aborts the whole
      // transaction in PostgreSQL. Guard with array-length checks instead.
      if (taskIds.length) {
        await Attachment.destroy({ where: { taskId: taskIds }, transaction: t });
        await Comment.destroy({ where: { taskId: taskIds }, transaction: t });
        await TimeLog.destroy({ where: { taskId: taskIds }, transaction: t });
        await TaskAssignees.destroy({ where: { taskId: taskIds }, transaction: t });
        await Subtask.destroy({ where: { taskId: taskIds }, transaction: t });
        // Split into two queries — Op.or with potentially empty arrays causes
        // "invalid input syntax" in PostgreSQL which aborts the transaction
        await TaskDependency.destroy({ where: { taskId: taskIds }, transaction: t });
        await TaskDependency.destroy({ where: { dependsOnTaskId: taskIds }, transaction: t });
        await TaskCustomField.destroy({ where: { taskId: taskIds }, transaction: t });
        await Task.unscoped().destroy({ where: { id: taskIds }, transaction: t });
      }

      // ── Step 3: Delete project-level data ────────────────────────────────
      if (projectIds.length) {
        await List.destroy({ where: { projectId: projectIds }, transaction: t });
        await Status.destroy({ where: { projectId: projectIds }, transaction: t });
        await Workflow.destroy({ where: { projectId: projectIds }, transaction: t });
        await CustomField.destroy({ where: { projectId: projectIds }, transaction: t });
        await ProjectMembers.destroy({ where: { projectId: projectIds }, transaction: t });
        await GuestAccess.destroy({ where: { workspaceId: workspace.id }, transaction: t });
        await Project.unscoped().destroy({ where: { id: projectIds }, transaction: t });
      }

      // ── Step 4: Delete workspace-level data ──────────────────────────────
      await WorkspaceMembers.destroy({ where: { workspaceId: workspace.id }, transaction: t });
      await SavedView.destroy({ where: { workspaceId: workspace.id }, transaction: t });
      await Document.destroy({ where: { workspaceId: workspace.id }, transaction: t });
      await WhiteboardElement.destroy({ where: { workspaceId: workspace.id }, transaction: t });
      await Whiteboard.destroy({ where: { workspaceId: workspace.id }, transaction: t });
      await ChatMessage.destroy({ where: { workspaceId: workspace.id }, transaction: t });
      await ChatRoom.destroy({ where: { workspaceId: workspace.id }, transaction: t });
      await Resource.destroy({ where: { workspaceId: workspace.id }, transaction: t });
      await BudgetExpense.destroy({ where: { workspaceId: workspace.id }, transaction: t });
      await Budget.destroy({ where: { workspaceId: workspace.id }, transaction: t });
      await Invite.destroy({ where: { workspaceId: workspace.id }, transaction: t });
      await ActivityLog.destroy({ where: { entityType: 'workspace', entityId: workspace.id }, transaction: t });

      // ── Step 5: Delete the workspace itself ──────────────────────────────
      // Use instance.destroy() — bypasses the defaultScope (isActive: true) that
      // would cause Workspace.destroy({ where: { id } }) to skip soft-deleted rows
      await workspace.destroy({ transaction: t });

      await t.commit();

      // Audit log after commit (non-blocking, outside transaction)
      try {
        await createActivityLog('workspace', workspace.id, 'hard_deleted', req.user.id, null, { reason, confirmName });
      } catch (logErr) {
        logger.warn('Failed to create activity log for workspace hard delete', logErr);
      }

      res.status(200).json({ success: true, message: 'Workspace permanently deleted' });
    } catch (err) {
      await t.rollback();
      logger.error('Hard delete transaction failed:', err.message);
      throw err;
    }
  } catch (error) {
    logger.error('Hard delete workspace error:', error);
    next(error);
  }
};

// ─── Logo upload ───────────────────────────────────────────────────────────────

const logoStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '../../uploads/workspace-logos');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `logo_${req.params.id}_${Date.now()}${ext}`);
  },
});
const logoUpload = multer({
  storage: logoStorage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only image files allowed'));
  }
});

const uploadWorkspaceLogo = [logoUpload.single('logo'), async (req, res, next) => {
  try {
    const workspace = await Workspace.findByPk(req.params.id);
    if (!workspace) return res.status(404).json({ success: false, error: 'Workspace not found' });
    if (!req.file) return res.status(400).json({ success: false, error: 'No file uploaded' });
    const logoUrl = `/uploads/workspace-logos/${req.file.filename}`;
    await workspace.update({ logo: logoUrl });
    res.json({ success: true, logoUrl });
  } catch (error) {
    logger.error('Upload workspace logo error:', error);
    next(error);
  }
}];

module.exports = {
  deleteWorkspace,
  restoreWorkspace,
  hardDeleteWorkspace,
  uploadWorkspaceLogo,
};
