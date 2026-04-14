const { ChatRoom, ChatMessage, Project, User, WorkspaceMembers, sequelize } = require('../models');
const { Op } = require('sequelize');
const logger = require('../utils/logger');
const { emitChatMessage } = require('../socket');
const { createNotification } = require('./notification.controller');
const multer = require('multer');
const path = require('path');
const fsPromises = require('fs').promises;

// Create chat upload directory once at module load
const CHAT_UPLOAD_DIR = path.join(__dirname, '../../uploads/chat');
fsPromises.mkdir(CHAT_UPLOAD_DIR, { recursive: true }).catch(() => {});

const requireAccess = async (req, { workspaceId, projectId }) => {
  if (req.user.role === 'super_admin') return true;
  if (projectId) {
    const project = await Project.findByPk(projectId);
    if (!project) return { status: 404, message: 'Project not found' };
    workspaceId = project.workspaceId;
  }
  if (!workspaceId) return { status: 400, message: 'Workspace context required' };
  const { WorkspaceMembers, Workspace } = require('../models');
  const workspace = await Workspace.findByPk(workspaceId);
  if (!workspace) return { status: 404, message: 'Workspace not found' };
  if (workspace.ownerId === req.user.id) return true;
  const member = await WorkspaceMembers.findOne({ where: { workspaceId, userId: req.user.id } });
  if (!member) return { status: 403, message: 'You do not have access to this workspace' };
  return true;
};

exports.createRoom = async (req, res, next) => {
  try {
    const { name, scope = 'project', workspaceId, projectId } = req.body;
    const access = await requireAccess(req, { workspaceId, projectId });
    if (access !== true) return res.status(access.status).json({ success: false, error: access.message });
    if (req.user.role === 'guest') return res.status(403).json({ success: false, error: 'Guests cannot create chat rooms' });

    const room = await ChatRoom.create({ name, scope, workspaceId, projectId, createdBy: req.user.id });
    res.status(201).json({ success: true, data: room });
  } catch (error) {
    logger.error('Create chat room error:', error);
    next(error);
  }
};

exports.getRooms = async (req, res, next) => {
  try {
    const { workspaceId, projectId } = req.query;
    const access = await requireAccess(req, { workspaceId, projectId });
    if (access !== true) return res.status(access.status).json({ success: false, error: access.message });

    const where = {};
    if (workspaceId) where[Op.or] = [{ workspaceId }, { scope: 'global' }];
    if (projectId) where.projectId = projectId;

    const rooms = await ChatRoom.findAll({ where, order: [['updatedAt', 'DESC']] });
    res.status(200).json({ success: true, data: rooms });
  } catch (error) {
    logger.error('Get chat rooms error:', error);
    next(error);
  }
};

exports.getMessages = async (req, res, next) => {
  try {
    const { roomId } = req.params;
    const { cursor, limit = 30 } = req.query;
    const room = await ChatRoom.findByPk(roomId);
    if (!room) return res.status(404).json({ success: false, error: 'Room not found' });

    const access = await requireAccess(req, { workspaceId: room.workspaceId, projectId: room.projectId });
    if (access !== true) return res.status(access.status).json({ success: false, error: access.message });

    const where = { roomId };
    if (cursor) {
      where.createdAt = { [Op.lt]: new Date(cursor) };
    }

    const messages = await ChatMessage.findAll({
      where,
      include: [
        { model: User, as: 'user', attributes: ['id', 'firstName', 'lastName', 'email', 'avatar'] },
        {
          model: ChatMessage,
          as: 'parent',
          attributes: ['id', 'content', 'userId'],
          include: [{ model: User, as: 'user', attributes: ['id', 'firstName', 'lastName'] }],
        },
      ],
      order: [['createdAt', 'DESC']],
      limit: Math.min(Number(limit), 100)
    });

    // Add reply counts to each message
    const messageIds = messages.map(m => m.id);
    let replyCountMap = {};
    if (messageIds.length > 0) {
      const replyCounts = await ChatMessage.findAll({
        where: { parentId: { [Op.in]: messageIds } },
        attributes: ['parentId', [sequelize.fn('COUNT', sequelize.col('id')), 'count']],
        group: ['parentId'],
        raw: true,
      });
      replyCounts.forEach(r => { replyCountMap[r.parentId] = parseInt(r.count, 10); });
    }

    const result = messages.reverse().map(m => ({
      ...m.toJSON(),
      replyCount: replyCountMap[m.id] || 0,
    }));

    res.status(200).json({ success: true, data: result });
  } catch (error) {
    logger.error('Get chat messages error:', error);
    next(error);
  }
};

exports.postMessage = async (req, res, next) => {
  try {
    const { roomId } = req.params;
    const { content, parentId } = req.body;
    const room = await ChatRoom.findByPk(roomId);
    if (!room) return res.status(404).json({ success: false, error: 'Room not found' });

    const access = await requireAccess(req, { workspaceId: room.workspaceId, projectId: room.projectId });
    if (access !== true) return res.status(access.status).json({ success: false, error: access.message });

    const message = await ChatMessage.create({ roomId, userId: req.user.id, content, parentId: parentId || null });
    const hydrated = await ChatMessage.findByPk(message.id, {
      include: [
        { model: User, as: 'user', attributes: ['id', 'firstName', 'lastName', 'email', 'avatar'] },
        {
          model: ChatMessage,
          as: 'parent',
          attributes: ['id', 'content', 'userId'],
          include: [{ model: User, as: 'user', attributes: ['id', 'firstName', 'lastName'] }],
        },
      ]
    });

    const mentions = [];
    if (/@channel\b/i.test(content) || /@all\b/i.test(content)) {
      mentions.push('channel');
    }

    const payload = { ...hydrated.toJSON(), mentions };
    emitChatMessage(roomId, payload);

    // ── @mention notifications ────────────────────────────────────────────
    try {
      const mentionMatches = [...new Set((content.match(/@(\w+)/g) || []).map(m => m.slice(1).toLowerCase()))];
      if (mentionMatches.length > 0) {
        // Get userIds of workspace members
        const wsRows = await WorkspaceMembers.findAll({
          where: { workspaceId: room.workspaceId },
          attributes: ['userId'],
          raw: true,
        });
        const memberIds = wsRows.map(r => r.userId).filter(id => String(id) !== String(req.user.id));
        if (memberIds.length > 0) {
          const members = await User.findAll({
            where: { id: { [Op.in]: memberIds } },
            attributes: ['id', 'firstName', 'lastName'],
          });
          const actorName = `${hydrated.user?.firstName || ''} ${hydrated.user?.lastName || ''}`.trim() || 'Someone';
          await Promise.allSettled(
            members
              .filter(u => {
                const handle = `${u.firstName || ''}${u.lastName || ''}`.replace(/\s+/g, '').toLowerCase();
                return mentionMatches.includes(handle);
              })
              .map(u =>
                createNotification({
                  userId: u.id,
                  type: 'mention',
                  title: `${actorName} mentioned you in #${room.name}`,
                  body: content.trim().substring(0, 120),
                  entityType: 'comment',
                  entityId: message.id,
                  actorId: req.user.id,
                  metadata: { roomId, messageId: message.id },
                })
              )
          );
        }
      }
    } catch (mentionErr) {
      logger.warn('Failed to send mention notifications', mentionErr);
    }

    res.status(201).json({ success: true, data: payload });
  } catch (error) {
    logger.error('Post chat message error:', error);
    next(error);
  }
};

exports.editMessage = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { content } = req.body;
    if (!content?.trim()) return res.status(400).json({ success: false, error: 'Content required' });

    const message = await ChatMessage.findByPk(id, {
      include: [{ model: User, as: 'user', attributes: ['id', 'firstName', 'lastName', 'email', 'avatar'] }]
    });
    if (!message) return res.status(404).json({ success: false, error: 'Message not found' });
    if (message.userId !== req.user.id) return res.status(403).json({ success: false, error: 'Not your message' });

    await message.update({ content: content.trim(), editedAt: new Date() });
    await message.reload({ include: [{ model: User, as: 'user', attributes: ['id', 'firstName', 'lastName', 'email', 'avatar'] }] });

    // Broadcast edit
    try {
      const { getIO } = require('../socket');
      getIO().to(`chat:${message.roomId}`).emit('chat:message_edited', { messageId: id, content: message.content, editedAt: message.editedAt });
    } catch {}

    res.json({ success: true, data: message });
  } catch (error) {
    logger.error('Edit message error:', error);
    next(error);
  }
};

exports.deleteMessage = async (req, res, next) => {
  try {
    const { id } = req.params;
    const message = await ChatMessage.findByPk(id);
    if (!message) return res.status(404).json({ success: false, error: 'Message not found' });
    if (message.userId !== req.user.id && req.user.role !== 'super_admin' && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Not authorized' });
    }

    const roomId = message.roomId;
    await message.destroy();

    try {
      const { getIO } = require('../socket');
      getIO().to(`chat:${roomId}`).emit('chat:message_deleted', { messageId: id, roomId });
    } catch {}

    res.json({ success: true, data: {} });
  } catch (error) {
    logger.error('Delete message error:', error);
    next(error);
  }
};

exports.addReaction = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { emoji } = req.body;
    if (!emoji) return res.status(400).json({ success: false, error: 'Emoji required' });

    const message = await ChatMessage.findByPk(id);
    if (!message) return res.status(404).json({ success: false, error: 'Message not found' });

    const reactions = { ...(message.reactions || {}) };
    if (!reactions[emoji]) reactions[emoji] = [];
    if (!reactions[emoji].includes(req.user.id)) {
      reactions[emoji].push(req.user.id);
    }
    await message.update({ reactions });

    try {
      const { getIO } = require('../socket');
      getIO().to(`chat:${message.roomId}`).emit('chat:reaction', {
        messageId: id, emoji, userId: req.user.id, reactions
      });
    } catch {}

    res.json({ success: true, data: reactions });
  } catch (error) {
    logger.error('Add reaction error:', error);
    next(error);
  }
};

exports.removeReaction = async (req, res, next) => {
  try {
    const { id, emoji } = req.params;
    const message = await ChatMessage.findByPk(id);
    if (!message) return res.status(404).json({ success: false, error: 'Message not found' });

    const reactions = { ...(message.reactions || {}) };
    if (reactions[emoji]) {
      reactions[emoji] = reactions[emoji].filter(uid => uid !== req.user.id);
      if (reactions[emoji].length === 0) delete reactions[emoji];
    }
    await message.update({ reactions });

    try {
      const { getIO } = require('../socket');
      getIO().to(`chat:${message.roomId}`).emit('chat:reaction', {
        messageId: id, emoji, userId: req.user.id, reactions
      });
    } catch {}

    res.json({ success: true, data: reactions });
  } catch (error) {
    logger.error('Remove reaction error:', error);
    next(error);
  }
};

// ── Chat file upload ──────────────────────────────────────────────────────────
const chatStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, CHAT_UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
  }
});

const chatUploadMiddleware = multer({
  storage: chatStorage,
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB
}).single('file');

exports.uploadFile = (req, res, next) => {
  chatUploadMiddleware(req, res, async (err) => {
    try {
      if (err) return res.status(400).json({ success: false, error: err.message });
      if (!req.file) return res.status(400).json({ success: false, error: 'No file uploaded' });

      const { roomId } = req.params;
      const room = await ChatRoom.findByPk(roomId);
      if (!room) return res.status(404).json({ success: false, error: 'Room not found' });

      const access = await requireAccess(req, { workspaceId: room.workspaceId, projectId: room.projectId });
      if (access !== true) return res.status(access.status).json({ success: false, error: access.message });

      const attachment = {
        url: `/uploads/chat/${req.file.filename}`,
        name: req.file.originalname,
        mimeType: req.file.mimetype,
        size: req.file.size,
      };

      const content = req.body.content || '';
      const message = await ChatMessage.create({
        roomId,
        userId: req.user.id,
        content,
        parentId: req.body.parentId || null,
        attachment,
      });

      const hydrated = await ChatMessage.findByPk(message.id, {
        include: [
          { model: User, as: 'user', attributes: ['id', 'firstName', 'lastName', 'email', 'avatar'] },
          {
            model: ChatMessage,
            as: 'parent',
            attributes: ['id', 'content', 'userId'],
            include: [{ model: User, as: 'user', attributes: ['id', 'firstName', 'lastName'] }],
          },
        ]
      });

      const payload = hydrated.toJSON();
      emitChatMessage(roomId, payload);

      res.status(201).json({ success: true, data: payload });
    } catch (error) {
      logger.error('Upload chat file error:', error);
      next(error);
    }
  });
};

exports.getThread = async (req, res, next) => {
  try {
    const { id } = req.params;
    const parent = await ChatMessage.findByPk(id, {
      include: [
        { model: User, as: 'user', attributes: ['id', 'firstName', 'lastName', 'email', 'avatar'] },
      ]
    });
    if (!parent) return res.status(404).json({ success: false, error: 'Message not found' });

    const room = await ChatRoom.findByPk(parent.roomId);
    const access = await requireAccess(req, { workspaceId: room?.workspaceId, projectId: room?.projectId });
    if (access !== true) return res.status(access.status).json({ success: false, error: access.message });

    const replies = await ChatMessage.findAll({
      where: { parentId: id },
      include: [
        { model: User, as: 'user', attributes: ['id', 'firstName', 'lastName', 'email', 'avatar'] },
      ],
      order: [['createdAt', 'ASC']],
    });

    res.json({ success: true, data: { parent: parent.toJSON(), replies: replies.map(r => r.toJSON()) } });
  } catch (error) {
    logger.error('Get thread error:', error);
    next(error);
  }
};

exports.searchMessages = async (req, res, next) => {
  try {
    const { roomId, q } = req.query;
    if (!roomId || !q?.trim()) return res.status(400).json({ success: false, error: 'roomId and q required' });

    const room = await ChatRoom.findByPk(roomId);
    if (!room) return res.status(404).json({ success: false, error: 'Room not found' });

    const messages = await ChatMessage.findAll({
      where: {
        roomId,
        content: { [Op.iLike]: `%${q.trim()}%` }
      },
      include: [{ model: User, as: 'user', attributes: ['id', 'firstName', 'lastName', 'email', 'avatar'] }],
      order: [['createdAt', 'DESC']],
      limit: 50,
    });

    res.json({ success: true, data: messages });
  } catch (error) {
    logger.error('Search messages error:', error);
    next(error);
  }
};
