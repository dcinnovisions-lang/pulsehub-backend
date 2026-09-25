const { Whiteboard, WhiteboardElement } = require('../models');
const logger = require('../utils/logger');
const { emitWhiteboardUpdate } = require('../socket');
const { ensureWorkspaceAccess } = require('../utils/accessControl');

const requireAccess = (req, { workspaceId, projectId }) =>
  ensureWorkspaceAccess(req.user, { workspaceId, projectId });

exports.createWhiteboard = async (req, res, next) => {
  try {
    const { title, workspaceId, projectId } = req.body;
    const access = await requireAccess(req, { workspaceId, projectId });
    if (access !== true) return res.status(access.status).json({ success: false, error: access.message });
    if (req.user.role === 'guest') return res.status(403).json({ success: false, error: 'Guests cannot create whiteboards' });

    const wb = await Whiteboard.create({ title, workspaceId, projectId, createdBy: req.user.id });
    res.status(201).json({ success: true, data: wb });
  } catch (error) {
    logger.error('Create whiteboard error:', error);
    next(error);
  }
};

exports.getWhiteboards = async (req, res, next) => {
  try {
    const { workspaceId, projectId } = req.query;
    const access = await requireAccess(req, { workspaceId, projectId });
    if (access !== true) return res.status(access.status).json({ success: false, error: access.message });

    const where = {};
    if (workspaceId) where.workspaceId = workspaceId;
    if (projectId) where.projectId = projectId;
    const boards = await Whiteboard.findAll({ where, order: [['updatedAt', 'DESC']] });
    res.status(200).json({ success: true, data: boards });
  } catch (error) {
    logger.error('Get whiteboards error:', error);
    next(error);
  }
};

exports.getWhiteboard = async (req, res, next) => {
  try {
    const wb = await Whiteboard.findByPk(req.params.id);
    if (!wb) return res.status(404).json({ success: false, error: 'Whiteboard not found' });
    const access = await requireAccess(req, { workspaceId: wb.workspaceId, projectId: wb.projectId });
    if (access !== true) return res.status(access.status).json({ success: false, error: access.message });

    const elements = await WhiteboardElement.findAll({ where: { whiteboardId: wb.id }, order: [['z_index', 'ASC']] });
    res.status(200).json({ success: true, data: { whiteboard: wb, elements } });
  } catch (error) {
    logger.error('Get whiteboard error:', error);
    next(error);
  }
};

exports.upsertElements = async (req, res, next) => {
  try {
    const { whiteboardId } = req.params;
    const wb = await Whiteboard.findByPk(whiteboardId);
    if (!wb) return res.status(404).json({ success: false, error: 'Whiteboard not found' });
    const access = await requireAccess(req, { workspaceId: wb.workspaceId, projectId: wb.projectId });
    if (access !== true) return res.status(access.status).json({ success: false, error: access.message });
    if (req.user.role === 'guest') return res.status(403).json({ success: false, error: 'Guests cannot edit whiteboards' });

    const { elements = [] } = req.body;
    // Each element is an independent row (update-existing or create-new) —
    // Promise.all keeps this a single round of concurrent writes instead of
    // one sequential DB round-trip per element. .map() preserves the input
    // order in `saved` regardless of which write resolves first.
    const saved = await Promise.all(elements.map(async (el) => {
      if (el.id) {
        const existing = await WhiteboardElement.findByPk(el.id);
        if (existing) {
          await existing.update({
            type: el.type,
            data: el.data,
            x: el.x,
            y: el.y,
            width: el.width,
            height: el.height,
            rotation: el.rotation,
            zIndex: el.zIndex,
            color: el.color,
            locked: !!el.locked,
            updatedBy: req.user.id
          });
          return existing;
        }
      }
      return WhiteboardElement.create({
        whiteboardId,
        type: el.type || 'sticky',
        data: el.data,
        x: el.x || 0,
        y: el.y || 0,
        width: el.width || 200,
        height: el.height || 160,
        rotation: el.rotation || 0,
        zIndex: el.zIndex || 1,
        color: el.color || '#fde68a',
        locked: !!el.locked,
        createdBy: req.user.id,
        updatedBy: req.user.id
      });
    }));

    emitWhiteboardUpdate(whiteboardId, { whiteboardId, elements: saved });
    res.status(200).json({ success: true, data: saved });
  } catch (error) {
    logger.error('Upsert whiteboard elements error:', error);
    next(error);
  }
};

exports.deleteElement = async (req, res, next) => {
  try {
    const { whiteboardId, elementId } = req.params;
    const wb = await Whiteboard.findByPk(whiteboardId);
    if (!wb) return res.status(404).json({ success: false, error: 'Whiteboard not found' });
    const access = await requireAccess(req, { workspaceId: wb.workspaceId, projectId: wb.projectId });
    if (access !== true) return res.status(access.status).json({ success: false, error: access.message });
    if (req.user.role === 'guest') return res.status(403).json({ success: false, error: 'Guests cannot delete whiteboard elements' });

    const element = await WhiteboardElement.findByPk(elementId);
    if (!element || element.whiteboardId !== whiteboardId) {
      return res.status(404).json({ success: false, error: 'Element not found' });
    }

    await element.destroy();
    emitWhiteboardUpdate(whiteboardId, { whiteboardId, deletedElementId: elementId });
    res.status(200).json({ success: true, data: { id: elementId, deleted: true } });
  } catch (error) {
    logger.error('Delete whiteboard element error:', error);
    next(error);
  }
};
