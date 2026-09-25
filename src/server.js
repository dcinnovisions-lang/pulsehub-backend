const http = require('http');
const app = require('./app');
const { sequelize } = require('./config/database');
const logger = require('./utils/logger');
const { initSocket } = require('./socket');
const { Op } = require('sequelize');

// Load models to ensure they're registered
require('./models');

const { Task, User, Status } = require('./models');
const { createNotification } = require('./controllers/notification.controller');

// ─── Due-soon / Overdue cron ──────────────────────────────────────────────────
// Finished tasks (Done / Closed / ...) must never trigger due or overdue reminders
const isOpenTask = (task) => !/^(done|closed|completed|resolved)$/i.test((task.status && task.status.name) || '');
const runDueSoonCron = async () => {
  try {
    const now = new Date();
    const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    // Tasks due in next 24 hours (not archived)
    const dueSoonTasks = await Task.findAll({
      where: {
        dueDate: { [Op.between]: [now, in24h] },
        isArchived: false,
      },
      include: [{ model: User, as: 'assignees', through: { attributes: [] } }, { model: Status, as: 'status', attributes: ['name'], required: false }],
    });

    await Promise.all(
      dueSoonTasks.filter(isOpenTask).flatMap((task) =>
        (task.assignees || []).map((assignee) =>
          createNotification({
            userId: assignee.id,
            type: 'task_due_soon',
            title: `Task due soon: "${task.title}"`,
            body: `This task is due in less than 24 hours.`,
            entityType: 'task',
            entityId: task.id,
            actorId: null,
            metadata: { url: `/app/tasks/${task.id}` },
          }).catch(() => {})
        )
      )
    );

    // Overdue tasks (past due, not archived)
    const overdueTasks = await Task.findAll({
      where: {
        dueDate: { [Op.lt]: now },
        isArchived: false,
      },
      include: [{ model: User, as: 'assignees', through: { attributes: [] } }, { model: Status, as: 'status', attributes: ['name'], required: false }],
    });

    await Promise.all(
      overdueTasks.filter(isOpenTask).flatMap((task) =>
        (task.assignees || []).map((assignee) =>
          createNotification({
            userId: assignee.id,
            type: 'task_overdue',
            title: `Task overdue: "${task.title}"`,
            body: `This task was due on ${new Date(task.dueDate).toLocaleDateString()}.`,
            entityType: 'task',
            entityId: task.id,
            actorId: null,
            metadata: { url: `/app/tasks/${task.id}` },
          }).catch(() => {})
        )
      )
    );
  } catch (e) {
    logger.warn('Due-soon cron error:', e.message);
  }
};

// ─── Recurring Tasks cron (runs daily at midnight) ────────────────────────────
/**
 * For each task that has a recurrence config and a dueDate in the past,
 * create a new copy of the task with the next calculated due date, then
 * leave the original task as-is (it remains in whatever status it was).
 */
const runRecurringTaskCron = async () => {
  try {
    const now = new Date();

    const recurringTasks = await Task.findAll({
      where: {
        recurrence: { [Op.ne]: null },
        dueDate:    { [Op.lt]: now },
        isArchived: false
      },
      include: [{ model: User, as: 'assignees', through: { attributes: [] } }]
    });

    await Promise.all(recurringTasks.map(async (task) => {
      try {
        const recurrence = task.recurrence;
        if (!recurrence || !recurrence.type || !task.dueDate) return;

        // Check endDate — stop recurring if past it
        if (recurrence.endDate && new Date(recurrence.endDate) < now) {
          // Clear recurrence so it won't trigger again
          await task.update({ recurrence: null });
          return;
        }

        const interval = recurrence.interval || 1;
        const nextDueDate = new Date(task.dueDate);

        switch (recurrence.type) {
          case 'daily':
            nextDueDate.setDate(nextDueDate.getDate() + interval);
            break;
          case 'weekly':
            nextDueDate.setDate(nextDueDate.getDate() + interval * 7);
            break;
          case 'monthly':
            nextDueDate.setMonth(nextDueDate.getMonth() + interval);
            break;
          default:
            return;
        }

        // Create the next task instance (copy key fields, reset progress)
        await Task.create({
          title:          task.title,
          description:    task.description,
          projectId:      task.projectId,
          listId:         task.listId,
          statusId:       task.statusId,
          priority:       task.priority,
          dueDate:        nextDueDate,
          startDate:      null,
          estimatedHours: task.estimatedHours,
          createdBy:      task.createdBy,
          labels:         task.labels || [],
          recurrence:     recurrence,
          progress:       0,
          position:       0
        });

        // Clear recurrence on original task so it doesn't spawn more copies
        await task.update({ recurrence: null });

        logger.info(`Recurring task spawned: "${task.title}" → next due ${nextDueDate.toISOString()}`);
      } catch (taskErr) {
        logger.warn(`Recurring task cron — error processing task ${task.id}:`, taskErr.message);
      }
    }));
  } catch (e) {
    logger.warn('Recurring task cron error:', e.message);
  }
};

/**
 * Schedule the recurring task cron at midnight each day.
 * We compute how many milliseconds until the next midnight, then
 * use setInterval with a 24h period.
 */
const scheduleRecurringTaskCron = () => {
  const now = new Date();
  const nextMidnight = new Date(now);
  nextMidnight.setHours(24, 0, 0, 0); // start of next day
  const msUntilMidnight = nextMidnight.getTime() - now.getTime();

  setTimeout(() => {
    runRecurringTaskCron();
    setInterval(runRecurringTaskCron, 24 * 60 * 60 * 1000);
  }, msUntilMidnight);

  logger.info(`Recurring task cron scheduled — first run in ${Math.round(msUntilMidnight / 1000 / 60)} minutes (at midnight)`);
};

const REQUIRED_ENV = ['JWT_SECRET', 'DB_NAME', 'DB_USERNAME', 'DB_PASSWORD', 'FRONTEND_URL'];
const missing = REQUIRED_ENV.filter(k => !process.env[k]);
if (missing.length) {
  console.error(`[FATAL] Missing required environment variables: ${missing.join(', ')}`);
  process.exit(1);
}
const OPTIONAL_ENV = ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS', 'RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET'];
OPTIONAL_ENV.filter(k => !process.env[k]).forEach(k => {
  console.warn(`[WARN] Optional env var not set: ${k} — related feature will be disabled`);
});

const PORT = process.env.PORT || 5000;

// Test database connection and sync models
sequelize
  .authenticate()
  .then(() => {
    logger.info('Database connection established successfully.');
    
    // Sync models in development (creates tables if they don't exist)
    if (process.env.NODE_ENV === 'development') {
      return sequelize.sync({ alter: false }).then(() => {
        logger.info('Database models synced successfully.');
      });
    }
  })
  .then(() => {
    const server = http.createServer(app);
    initSocket(server);

    server.listen(PORT, () => {
      logger.info(`Server is running on port ${PORT} in ${process.env.NODE_ENV} mode`);
      // Due-soon / overdue cron: run once 10s after start, then every hour
      setTimeout(runDueSoonCron, 10000);
      setInterval(runDueSoonCron, 60 * 60 * 1000);
      // Recurring task cron: scheduled at midnight daily
      scheduleRecurringTaskCron();
    });
  })
  .catch((error) => {
    logger.error('Unable to connect to the database:', error);
    process.exit(1);
  });

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  logger.error('Unhandled Rejection:', err);
  process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception:', err);
  process.exit(1);
});


