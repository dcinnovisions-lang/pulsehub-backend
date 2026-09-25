const { Status, TaskAssignees } = require('../models');
const logger = require('./logger');

const RETEST = 'ready for retest';
const REOPENED = 'reopened';

// QA hand-off rules for bugs:
//   -> Ready for Retest : remember who fixed it, hand the bug back to the reporter
//   -> Reopened         : hand the bug back to whoever fixed it
const bugTransition = async (task, newStatusId, actorId) => {
  if (task.issueType !== 'bug' || !newStatusId || newStatusId === task.statusId) return null;
  const status = await Status.findByPk(newStatusId, { attributes: ['id', 'name'] });
  if (!status) return null;
  const name = status.name.trim().toLowerCase();

  if (name === RETEST) {
    return { assigneeIds: [task.createdBy], fixedBy: actorId, kind: 'retest', statusName: status.name };
  }
  if (name === REOPENED && task.fixedBy) {
    return { assigneeIds: [task.fixedBy], fixedBy: task.fixedBy, kind: 'reopened', statusName: status.name };
  }
  return null;
};

// Applies the hand-off (reassign + remember fixer + notify). Call BEFORE the status is saved.
// Returns the transition that was applied, or null when no rule matched.
const applyBugHandoff = async ({ task, statusId, actor }) => {
  const bt = await bugTransition(task, statusId, actor.id);
  if (!bt) return null;

  await TaskAssignees.destroy({ where: { task_id: task.id } });
  await TaskAssignees.bulkCreate(bt.assigneeIds.map((userId) => ({ task_id: task.id, user_id: userId })));
  await task.update({ fixedBy: bt.fixedBy });

  try {
    const { createNotification } = require('../controllers/notification.controller');
    const actorName = `${actor.firstName || ''} ${actor.lastName || ''}`.trim() || 'Someone';
    const ref = task.taskKey ? `${task.taskKey} ` : '';
    const isRetest = bt.kind === 'retest';
    await createNotification({
      userId: bt.assigneeIds[0],
      type: 'task_assigned',
      title: isRetest ? `Ready for retest: ${ref}${task.title}` : `Bug reopened: ${ref}${task.title}`,
      body: isRetest
        ? `${actorName} marked this bug as fixed. Please verify it and close it, or reopen it.`
        : `${actorName} reopened this bug because the fix did not pass retest.`,
      entityType: 'task',
      entityId: task.id,
      actorId: actor.id,
      metadata: { url: `/app/tasks/${task.id}`, projectId: task.projectId }
    });
  } catch (err) {
    logger.warn('Bug hand-off notification failed (non-fatal):', err.message);
  }
  return bt;
};

module.exports = { bugTransition, applyBugHandoff };
