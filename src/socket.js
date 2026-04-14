const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const logger = require('./utils/logger');
const { User, Workspace, WorkspaceMembers, Project, ChatRoom, Whiteboard } = require('./models');

let ioInstance = null;

// Track userId → socketId mapping for targeted notifications
const userSockets = new Map();

const ensureAccess = async (userId, { workspaceId, projectId }) => {
  if (projectId) {
    const project = await Project.findByPk(projectId);
    if (!project) return { status: 404, message: 'Project not found' };
    workspaceId = project.workspaceId;
  }

  if (!workspaceId) {
    return { status: 400, message: 'Workspace context required' };
  }

  const workspace = await Workspace.findByPk(workspaceId);
  if (!workspace) return { status: 404, message: 'Workspace not found' };

  if (workspace.ownerId === userId) return true;

  const member = await WorkspaceMembers.findOne({ where: { workspaceId, userId } });
  if (!member) return { status: 403, message: 'You do not have access to this workspace' };

  return true;
};

const authenticateSocket = async (socket, next) => {
  try {
    const headerToken = socket.handshake.headers?.authorization;
    const authToken = socket.handshake.auth?.token || (headerToken && headerToken.startsWith('Bearer ') ? headerToken.slice(7) : null);

    if (!authToken) {
      return next(new Error('Unauthorized'));
    }

    const decoded = jwt.verify(authToken, process.env.JWT_SECRET);
    const user = await User.findByPk(decoded.id);
    if (!user) return next(new Error('Unauthorized'));

    socket.user = user;
    return next();
  } catch (err) {
    logger.warn('Socket authentication failed:', err.message);
    return next(new Error('Unauthorized'));
  }
};

const initSocket = (server) => {
  ioInstance = new Server(server, {
    cors: {
      origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
      credentials: true
    }
  });

  ioInstance.use(authenticateSocket);

  ioInstance.on('connection', (socket) => {
    const userLabel = socket.user ? `${socket.user.email} (${socket.user.id})` : socket.id;
    logger.info(`Socket connected: ${userLabel}`);

    // Auto-register authenticated user (JWT already verified on connection)
    if (socket.user) {
      userSockets.set(String(socket.user.id), socket.id);
      socket.userId = socket.user.id;
    }

    socket.on('authenticate', (userId) => {
      userSockets.set(String(userId), socket.id);
      socket.userId = userId;
    });

    socket.on('disconnect', () => {
      logger.info(`Socket disconnected: ${userLabel}`);
      if (socket.userId) userSockets.delete(String(socket.userId));
    });

    socket.on('chat:join', async ({ roomId }) => {
      try {
        const room = await ChatRoom.findByPk(roomId);
        if (!room) return socket.emit('chat:error', { message: 'Room not found' });

        const access = await ensureAccess(socket.user.id, { workspaceId: room.workspaceId, projectId: room.projectId });
        if (access !== true) return socket.emit('chat:error', { message: access.message });

        socket.join(`chat:${roomId}`);
        socket.emit('chat:joined', { roomId });
      } catch (err) {
        logger.error('chat:join error', err);
        socket.emit('chat:error', { message: 'Failed to join chat room' });
      }
    });

    socket.on('chat:leave', ({ roomId }) => {
      socket.leave(`chat:${roomId}`);
      socket.emit('chat:left', { roomId });
    });

    socket.on('chat:typing', ({ roomId }) => {
      socket.to(`chat:${roomId}`).emit('chat:typing', { roomId, userId: socket.user.id });
    });

    // ── Read receipts ────────────────────────────────────────────────────────
    // Track reads in-memory: roomId → messageId → Set<userId>
    const chatReadReceipts = new Map(); // roomId → Map<messageId, Set<userId>>

    socket.on('chat:read', ({ roomId, messageId }) => {
      if (!roomId || !messageId) return;
      if (!chatReadReceipts.has(roomId)) chatReadReceipts.set(roomId, new Map());
      const roomReads = chatReadReceipts.get(roomId);
      if (!roomReads.has(messageId)) roomReads.set(messageId, new Set());
      const msgReads = roomReads.get(messageId);
      // Avoid duplicate entries for same user
      if (!msgReads.has(socket.user.id)) {
        msgReads.add(socket.user.id);
        // Broadcast to all others in the room
        socket.to(`chat:${roomId}`).emit('chat:message_read', {
          roomId,
          messageId,
          userId: socket.user.id,
        });
      }
    });

    socket.on('chat:read_batch', ({ roomId, messageIds }) => {
      if (!roomId || !Array.isArray(messageIds) || messageIds.length === 0) return;
      const roomReads = chatReadReceipts.get(roomId) || new Map();
      const newlySeen = [];
      messageIds.forEach(messageId => {
        if (!roomReads.has(messageId)) roomReads.set(messageId, new Set());
        const msgReads = roomReads.get(messageId);
        if (!msgReads.has(socket.user.id)) {
          msgReads.add(socket.user.id);
          newlySeen.push(messageId);
        }
      });
      chatReadReceipts.set(roomId, roomReads);
      if (newlySeen.length > 0) {
        socket.to(`chat:${roomId}`).emit('chat:message_read_batch', {
          roomId,
          messageIds: newlySeen,
          userId: socket.user.id,
        });
      }
    });

    socket.on('whiteboard:join', async ({ whiteboardId }) => {
      try {
        const whiteboard = await Whiteboard.findByPk(whiteboardId);
        if (!whiteboard) return socket.emit('whiteboard:error', { message: 'Whiteboard not found' });

        const access = await ensureAccess(socket.user.id, { workspaceId: whiteboard.workspaceId, projectId: whiteboard.projectId });
        if (access !== true) return socket.emit('whiteboard:error', { message: access.message });

        socket.join(`whiteboard:${whiteboardId}`);
        socket.emit('whiteboard:joined', { whiteboardId });
      } catch (err) {
        logger.error('whiteboard:join error', err);
        socket.emit('whiteboard:error', { message: 'Failed to join whiteboard' });
      }
    });

    socket.on('whiteboard:leave', ({ whiteboardId }) => {
      socket.leave(`whiteboard:${whiteboardId}`);
      socket.emit('whiteboard:left', { whiteboardId });
    });

    socket.on('whiteboard:cursor', ({ whiteboardId, x, y }) => {
      socket.to(`whiteboard:${whiteboardId}`).emit('whiteboard:cursor', { whiteboardId, userId: socket.user.id, x, y });
    });

    // ── Project rooms (for task:updated live refresh) ──────────────────────
    socket.on('project:join', async ({ projectId }) => {
      try {
        const project = await Project.findByPk(projectId);
        if (!project) return;
        const access = await ensureAccess(socket.user.id, { projectId });
        if (access !== true) return;
        socket.join(`project:${projectId}`);
        socket.emit('project:joined', { projectId });
      } catch (err) {
        logger.error('project:join error', err);
      }
    });

    socket.on('project:leave', ({ projectId }) => {
      socket.leave(`project:${projectId}`);
    });

    // ── Workspace rooms (for member:added live refresh) ────────────────────
    socket.on('workspace:join', async ({ workspaceId }) => {
      try {
        const access = await ensureAccess(socket.user.id, { workspaceId });
        if (access !== true) return;
        socket.join(`workspace:${workspaceId}`);
        socket.emit('workspace:joined', { workspaceId });
      } catch (err) {
        logger.error('workspace:join error', err);
      }
    });

    socket.on('workspace:leave', ({ workspaceId }) => {
      socket.leave(`workspace:${workspaceId}`);
    });
  });

  return ioInstance;
};

const getIO = () => {
  if (!ioInstance) {
    throw new Error('Socket.io has not been initialized');
  }
  return ioInstance;
};

const emitChatMessage = (roomId, payload) => {
  try {
    getIO().to(`chat:${roomId}`).emit('chat:message', payload);
  } catch (err) {
    logger.warn('emitChatMessage failed:', err.message);
  }
};

const emitWhiteboardUpdate = (whiteboardId, payload) => {
  try {
    getIO().to(`whiteboard:${whiteboardId}`).emit('whiteboard:update', payload);
  } catch (err) {
    logger.warn('emitWhiteboardUpdate failed:', err.message);
  }
};

/**
 * Emit task:updated to all members of the project room.
 * KanbanBoardPage and other listeners can subscribe to this event.
 */
const emitTaskUpdated = (projectId, payload) => {
  try {
    getIO().to(`project:${projectId}`).emit('task:updated', payload);
  } catch (err) {
    logger.warn('emitTaskUpdated failed:', err.message);
  }
};

module.exports = {
  initSocket,
  getIO,
  userSockets,
  emitChatMessage,
  emitWhiteboardUpdate,
  emitTaskUpdated
};
