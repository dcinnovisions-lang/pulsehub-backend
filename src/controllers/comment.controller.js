const { Comment, Task, User, TaskAssignees, ProjectMembers } = require('../models');
const logger = require('../utils/logger');
const { createNotification } = require('./notification.controller');
const { runAutomations } = require('../utils/automationEngine');

/**
 * @desc    Get all comments for a task
 * @route   GET /api/v1/tasks/:taskId/comments
 * @access  Private
 */
const getCommentsByTask = async (req, res, next) => {
  try {
    const { taskId } = req.params;
    const { page = 1, limit = 50 } = req.query;

    // Verify task exists
    const task = await Task.findByPk(taskId);
    if (!task) {
      return res.status(404).json({
        success: false,
        error: 'Task not found'
      });
    }

    const offset = (page - 1) * limit;

    const { count, rows: comments } = await Comment.findAndCountAll({
      where: { taskId },
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['id', 'email', 'firstName', 'lastName', 'avatar']
        },
        {
          model: Comment,
          as: 'parent',
          attributes: ['id', 'content', 'userId'],
          include: [{
            model: User,
            as: 'user',
            attributes: ['id', 'email', 'firstName', 'lastName', 'avatar']
          }]
        }
      ],
      order: [['createdAt', 'ASC']],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    // Organize comments into threads (parent comments with replies)
    const parentComments = comments.filter(c => !c.parentId);
    const repliesMap = comments
      .filter(c => c.parentId)
      .reduce((acc, reply) => {
        if (!acc[reply.parentId]) {
          acc[reply.parentId] = [];
        }
        acc[reply.parentId].push(reply);
        return acc;
      }, {});

    const commentsWithReplies = parentComments.map(comment => ({
      ...comment.toJSON(),
      replies: repliesMap[comment.id] || []
    }));

    res.status(200).json({
      success: true,
      count: commentsWithReplies.length,
      total: count,
      page: parseInt(page),
      limit: parseInt(limit),
      data: commentsWithReplies
    });
  } catch (error) {
    logger.error('Get comments by task error:', error);
    next(error);
  }
};

/**
 * @desc    Create a comment
 * @route   POST /api/v1/tasks/:taskId/comments
 * @access  Private
 */
const createComment = async (req, res, next) => {
  try {
    const { taskId } = req.params;
    const { content, parentId } = req.body;
    const userId = req.user.id;

    if (!content || !content.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Comment content is required'
      });
    }

    // Verify task exists
    const task = await Task.findByPk(taskId);
    if (!task) {
      return res.status(404).json({
        success: false,
        error: 'Task not found'
      });
    }

    // If parentId provided, verify parent comment exists
    if (parentId) {
      const parentComment = await Comment.findByPk(parentId);
      if (!parentComment || parentComment.taskId !== taskId) {
        return res.status(404).json({
          success: false,
          error: 'Parent comment not found'
        });
      }
    }

    const comment = await Comment.create({
      content: content.trim(),
      taskId,
      userId,
      parentId: parentId || null
    });

    // Reload with associations
    const reloadedComment = await Comment.findByPk(comment.id, {
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['id', 'email', 'firstName', 'lastName', 'avatar']
        },
        {
          model: Comment,
          as: 'parent',
          attributes: ['id', 'content', 'userId'],
          required: false,
          include: [{
            model: User,
            as: 'user',
            attributes: ['id', 'email', 'firstName', 'lastName', 'avatar']
          }]
        }
      ]
    });

    // Notify task assignees and creator about the new comment
    try {
      const actorName = `${req.user.firstName || ''} ${req.user.lastName || ''}`.trim() || 'Someone';
      const notifTitle = `New comment on "${task.title}"`;
      const notifBody  = `${actorName}: ${content.trim().substring(0, 100)}${content.trim().length > 100 ? '…' : ''}`;
      const notifMeta  = { url: `/app/tasks/${task.id}`, projectId: task.projectId };

      // Collect recipients: task creator + current assignees, deduplicated
      const assigneeRows = await TaskAssignees.findAll({ where: { taskId }, attributes: ['userId'] });
      const recipientIds = [...new Set([
        task.createdBy,
        ...assigneeRows.map(a => a.userId)
      ].filter(Boolean))];

      await Promise.allSettled(
        recipientIds.map(uid =>
          createNotification({
            userId:     uid,
            type:       'task_comment',
            title:      notifTitle,
            body:       notifBody,
            entityType: 'task',
            entityId:   taskId,
            actorId:    userId,
            metadata:   notifMeta
          })
        )
      );
    } catch (notifErr) {
      logger.warn('Failed to send comment notifications', notifErr);
    }

    // ── @mention notifications ────────────────────────────────────────────
    // Handles look like @firstnamelastname. Anyone with access to the project's workspace can be mentioned
    // (project members, workspace members and the workspace owner).
    try {
      const mentionMatches = [...new Set((content.match(/@(\w+)/g) || []).map(m => m.slice(1).toLowerCase()))];
      if (mentionMatches.length > 0) {
        const { WorkspaceMembers, Workspace, Project } = require('../models');
        const project = await Project.findByPk(task.projectId, { attributes: ['id', 'workspaceId'] });
        const [projectMembers, workspaceMembers, workspace] = await Promise.all([
          ProjectMembers.findAll({ where: { projectId: task.projectId }, attributes: ['userId'] }),
          project ? WorkspaceMembers.findAll({ where: { workspaceId: project.workspaceId }, attributes: ['userId'] }) : [],
          project ? Workspace.findByPk(project.workspaceId, { attributes: ['id', 'ownerId'] }) : null
        ]);
        const candidateIds = [...new Set([
          ...(projectMembers || []).map(m => m.userId),
          ...(workspaceMembers || []).map(m => m.userId),
          ...(workspace && workspace.ownerId ? [workspace.ownerId] : [])
        ])].filter(id => String(id) !== String(userId));

        const candidates = candidateIds.length
          ? await User.findAll({ where: { id: candidateIds }, attributes: ['id', 'firstName', 'lastName', 'email'] })
          : [];
        const actorName = `${req.user.firstName || ''} ${req.user.lastName || ''}`.trim() || 'Someone';
        await Promise.allSettled(
          candidates
            .filter(u => {
              const handle = `${u.firstName || ''}${u.lastName || ''}`.replace(/\s+/g, '').toLowerCase();
              const emailHandle = String(u.email || '').split('@')[0].toLowerCase();
              return mentionMatches.includes(handle) || mentionMatches.includes(emailHandle);
            })
            .map(u =>
              createNotification({
                userId: u.id,
                type: 'task_mentioned',
                title: `${actorName} mentioned you on "${task.title}"`,
                body: content.trim().substring(0, 200),
                entityType: 'task',
                entityId: taskId,
                actorId: userId,
                metadata: { url: `/app/tasks/${task.id}`, projectId: task.projectId },
              })
            )
        );
      }
    } catch (mentionErr) {
      logger.warn('Failed to send mention notifications in comment', mentionErr);
    }

    // Fire comment_added automations (non-fatal)
    runAutomations('comment_added', { task, actorId: userId }).catch(() => {});

    res.status(201).json({
      success: true,
      data: reloadedComment
    });
  } catch (error) {
    logger.error('Create comment error:', error);
    next(error);
  }
};

/**
 * @desc    Update a comment
 * @route   PUT /api/v1/comments/:id
 * @access  Private
 */
const updateComment = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { content } = req.body;
    const userId = req.user.id;

    const comment = await Comment.findByPk(id);
    if (!comment) {
      return res.status(404).json({
        success: false,
        error: 'Comment not found'
      });
    }

    // Only the comment author can update
    if (comment.userId !== userId) {
      return res.status(403).json({
        success: false,
        error: 'You can only update your own comments'
      });
    }

    if (!content || !content.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Comment content is required'
      });
    }

    await comment.update({
      content: content.trim()
    });

    // Reload with associations
    const reloadedComment = await Comment.findByPk(comment.id, {
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['id', 'email', 'firstName', 'lastName', 'avatar']
        }
      ]
    });

    res.status(200).json({
      success: true,
      data: reloadedComment
    });
  } catch (error) {
    logger.error('Update comment error:', error);
    next(error);
  }
};

/**
 * @desc    Delete a comment
 * @route   DELETE /api/v1/comments/:id
 * @access  Private
 */
const deleteComment = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const comment = await Comment.findByPk(id);
    if (!comment) {
      return res.status(404).json({
        success: false,
        error: 'Comment not found'
      });
    }

    // Only the comment author can delete
    if (comment.userId !== userId) {
      return res.status(403).json({
        success: false,
        error: 'You can only delete your own comments'
      });
    }

    await comment.destroy();

    res.status(200).json({
      success: true,
      data: {}
    });
  } catch (error) {
    logger.error('Delete comment error:', error);
    next(error);
  }
};

/**
 * @desc    Add emoji reaction to comment
 * @route   POST /api/v1/comments/:id/reactions
 * @access  Private
 */
const addReaction = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { emoji } = req.body;
    const userId = req.user.id;

    if (!emoji) {
      return res.status(400).json({
        success: false,
        error: 'Emoji is required'
      });
    }

    const comment = await Comment.findByPk(id);
    if (!comment) {
      return res.status(404).json({
        success: false,
        error: 'Comment not found'
      });
    }

    const reactions = comment.reactions || {};
    if (!reactions[emoji]) {
      reactions[emoji] = [];
    }

    // Add user if not already reacted
    if (!reactions[emoji].includes(userId)) {
      reactions[emoji].push(userId);
    }

    await comment.update({ reactions });

    // Reload with associations
    const reloadedComment = await Comment.findByPk(comment.id, {
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['id', 'email', 'firstName', 'lastName', 'avatar']
        }
      ]
    });

    res.status(200).json({
      success: true,
      data: reloadedComment
    });
  } catch (error) {
    logger.error('Add reaction error:', error);
    next(error);
  }
};

/**
 * @desc    Remove emoji reaction from comment
 * @route   DELETE /api/v1/comments/:id/reactions/:emoji
 * @access  Private
 */
const removeReaction = async (req, res, next) => {
  try {
    const { id, emoji } = req.params;
    const userId = req.user.id;

    const comment = await Comment.findByPk(id);
    if (!comment) {
      return res.status(404).json({
        success: false,
        error: 'Comment not found'
      });
    }

    const reactions = comment.reactions || {};
    if (reactions[emoji]) {
      reactions[emoji] = reactions[emoji].filter(id => id !== userId);
      if (reactions[emoji].length === 0) {
        delete reactions[emoji];
      }
    }

    await comment.update({ reactions });

    // Reload with associations
    const reloadedComment = await Comment.findByPk(comment.id, {
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['id', 'email', 'firstName', 'lastName', 'avatar']
        }
      ]
    });

    res.status(200).json({
      success: true,
      data: reloadedComment
    });
  } catch (error) {
    logger.error('Remove reaction error:', error);
    next(error);
  }
};

module.exports = {
  getCommentsByTask,
  createComment,
  updateComment,
  deleteComment,
  addReaction,
  removeReaction
};

