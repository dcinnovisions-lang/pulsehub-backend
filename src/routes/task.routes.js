const express = require('express');
const router = express.Router();
const taskController = require('../controllers/task.controller');
const kanbanController = require('../controllers/kanban.controller');
const timeTrackingController = require('../controllers/timeTracking.controller');
const { authenticate } = require('../middleware/auth');
const { searchLimiter, uploadLimiter } = require('../middleware/rateLimiter');

const { checkPermission } = require('../middleware/permissions');
const {
  validateCreateTask, validateUpdateTask, validateMoveTask,
  validateBulkCreate, validateBulkUpdate, validateBulkDelete,
  validateCreateSubtask, validateUpdateSubtask
} = require('../validators/task.validator');

// ── Static / collection routes — MUST be defined before /:id to avoid shadowing ──

router.get('/',    authenticate, taskController.getTasks);
router.post('/',   authenticate, checkPermission({ resource: 'task', action: 'create' }), validateCreateTask,  taskController.createTask);
router.get('/export',        authenticate, searchLimiter, taskController.exportTasksToCSV);
router.post('/bulk',         authenticate, checkPermission({ resource: 'task', action: 'create' }), validateBulkCreate,  taskController.bulkCreateTasks);
router.put('/bulk',          authenticate, checkPermission({ resource: 'task', action: 'update' }), validateBulkUpdate,  taskController.bulkUpdateTasks);
router.delete('/bulk',       authenticate, checkPermission({ resource: 'task', action: 'delete' }), validateBulkDelete,  taskController.bulkDeleteTasks);
router.post('/bulk-archive', authenticate, checkPermission({ resource: 'task', action: 'delete' }), validateBulkDelete,  taskController.bulkArchiveTasks);
router.post('/import',       authenticate, checkPermission({ resource: 'task', action: 'create' }), uploadLimiter, taskController.importTasksFromCSV);
router.put('/reorder',       authenticate, taskController.reorderTasks);

// ── Parameterised routes — /:id and /:taskId/subtasks ──────────────────────────

router.get('/:id',    authenticate, checkPermission({ resource: 'task', action: 'read'   }), taskController.getTaskById);
router.put('/:id',    authenticate, checkPermission({ resource: 'task', action: 'update' }), validateUpdateTask, taskController.updateTask);
router.put('/:id/move', authenticate, checkPermission({ resource: 'task', action: 'update' }), validateMoveTask, kanbanController.moveTask);
router.delete('/:id', authenticate, checkPermission({ resource: 'task', action: 'delete' }), taskController.deleteTask);
router.get('/:taskId/subtasks',               authenticate, checkPermission({ resource: 'subtask', action: 'read'   }), taskController.getSubtasks);
router.post('/:taskId/subtasks',              authenticate, checkPermission({ resource: 'subtask', action: 'create' }), validateCreateSubtask, taskController.createSubtask);
router.put('/:taskId/subtasks/:subtaskId',    authenticate, checkPermission({ resource: 'subtask', action: 'update' }), validateUpdateSubtask, taskController.updateSubtask);
router.delete('/:taskId/subtasks/:subtaskId', authenticate, checkPermission({ resource: 'subtask', action: 'delete' }), taskController.deleteSubtask);
router.get('/:taskId/time-logs',              authenticate, (req, res, next) => { req.query.taskId = req.params.taskId; next(); }, timeTrackingController.getTimeLogs);

module.exports = router;


