'use strict';

/**
 * Automation Engine
 * Evaluates trigger conditions and executes actions.
 *
 * Usage:
 *   const { runAutomations } = require('../utils/automationEngine');
 *   await runAutomations('task_created', { task, actorId });
 */

const logger = require('./logger');

// ─── Condition evaluator ──────────────────────────────────────────────────────

const operators = {
  eq:       (a, b) => String(a) === String(b),
  neq:      (a, b) => String(a) !== String(b),
  contains: (a, b) => String(a).toLowerCase().includes(String(b).toLowerCase()),
  gt:       (a, b) => Number(a) > Number(b),
  lt:       (a, b) => Number(a) < Number(b),
  any:      ()     => true
};

const evaluateCondition = (condition, context) => {
  const { field, operator, value } = condition;
  const ctxValue = context[field];
  const fn = operators[operator] || operators.eq;
  return fn(ctxValue, value);
};

const evaluateTrigger = (trigger, context) => {
  if (!trigger.conditions || trigger.conditions.length === 0) return true;
  return trigger.conditions.every(c => evaluateCondition(c, context));
};

// ─── Action executor ──────────────────────────────────────────────────────────

const executeAction = async (action, context, automation) => {
  const { Task, User, Status, TaskAssignees } = require('../models');
  const { createNotification } = require('../controllers/notification.controller');

  const { type, params } = action;
  const task = context.task;
  if (!task) return;

  switch (type) {
    case 'change_status': {
      if (params.statusId) {
        await task.update({ statusId: params.statusId });
      }
      break;
    }

    case 'set_priority': {
      if (params.priority) {
        await task.update({ priority: params.priority });
      }
      break;
    }

    case 'assign_user': {
      if (params.userId) {
        // Add user as assignee (idempotent)
        const exists = await TaskAssignees.findOne({ where: { task_id: task.id, user_id: params.userId } });
        if (!exists) {
          await TaskAssignees.create({ task_id: task.id, user_id: params.userId });
          // Notify
          await createNotification({
            userId: params.userId,
            type: 'task_assigned',
            title: `You were assigned to "${task.title}" by automation`,
            body: `Automation "${automation.name}" assigned you to this task.`,
            entityType: 'task',
            entityId: task.id,
            actorId: automation.createdBy,
            metadata: { url: `/app/projects/${task.projectId}/tasks/${task.id}`, projectId: task.projectId }
          });
        }
      }
      break;
    }

    case 'send_notification': {
      // Notify all current assignees (or specific userId in params)
      const recipients = params.userId
        ? [params.userId]
        : (await TaskAssignees.findAll({ where: { task_id: task.id }, attributes: ['user_id'] })).map(a => a.user_id);

      await Promise.allSettled(
        recipients.map(uid =>
          createNotification({
            userId: uid,
            type: 'task_updated',
            title: params.title || `Automation: ${automation.name}`,
            body: params.message || `Automation "${automation.name}" triggered on task "${task.title}"`,
            entityType: 'task',
            entityId: task.id,
            actorId: automation.createdBy,
            metadata: { url: `/app/projects/${task.projectId}/tasks/${task.id}`, projectId: task.projectId }
          })
        )
      );
      break;
    }

    case 'post_comment': {
      if (params.text) {
        const { Comment } = require('../models');
        await Comment.create({
          content: params.text.replace(/\{\{automation\}\}/g, automation.name),
          taskId: task.id,
          userId: automation.createdBy,
          isSystemComment: true
        });
      }
      break;
    }

    case 'create_subtask': {
      if (params.title) {
        const { Task } = require('../models');
        await Task.create({
          title: params.title.replace(/\{\{task\}\}/g, task.title),
          description: params.description || null,
          projectId: task.projectId,
          parentId: task.id,
          priority: params.priority || task.priority || 'medium',
          statusId: task.statusId,
          createdBy: automation.createdBy
        });
      }
      break;
    }

    default:
      logger.warn(`Unknown automation action type: ${type}`);
  }
};

// ─── Main runner ──────────────────────────────────────────────────────────────

/**
 * Run all active automations matching the given trigger event.
 *
 * @param {string} triggerType   — e.g. 'task_created', 'task_status_changed'
 * @param {object} context       — event context ({ task, oldStatusId, actorId, ... })
 */
const runAutomations = async (triggerType, context) => {
  try {
    const { Automation } = require('../models');
    const { Op } = require('sequelize');

    const task = context.task;
    if (!task) return;

    // Find active automations scoped to this project (or workspace-wide)
    const automations = await Automation.findAll({
      where: {
        isActive: true,
        workspaceId: task.workspaceId || context.workspaceId,
        [Op.or]: [
          { projectId: task.projectId },
          { projectId: null }   // workspace-wide automations
        ]
      }
    });

    for (const automation of automations) {
      try {
        if (automation.trigger.type !== triggerType) continue;

        // Build condition context from task fields
        const condCtx = {
          priority:  task.priority,
          statusId:  task.statusId,
          projectId: task.projectId,
          ...context
        };

        if (!evaluateTrigger(automation.trigger, condCtx)) continue;

        // Execute all actions sequentially
        let execError = null;
        const actionsRun = [];
        for (const action of automation.actions) {
          try {
            await executeAction(action, context, automation);
            actionsRun.push(action.type);
          } catch (aErr) {
            execError = aErr.message;
            logger.warn(`Action ${action.type} in automation ${automation.id} failed:`, aErr.message);
          }
        }

        // Build log entry
        const logEntry = {
          ts: new Date().toISOString(),
          status: execError ? 'error' : 'success',
          taskId: task.id,
          taskTitle: task.title,
          actionsRun,
          error: execError || null
        };

        // Keep last 50 log entries
        const existingLogs = Array.isArray(automation.recentLogs) ? automation.recentLogs : [];
        const updatedLogs = [logEntry, ...existingLogs].slice(0, 50);

        // Update run stats + logs
        await automation.update({
          runCount: automation.runCount + 1,
          lastRunAt: new Date(),
          recentLogs: updatedLogs
        });

      } catch (err) {
        logger.warn(`Automation ${automation.id} execution error:`, err.message);
      }
    }
  } catch (err) {
    logger.warn('runAutomations error (non-fatal):', err.message);
  }
};

module.exports = { runAutomations };
