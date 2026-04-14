const express = require('express');
const router = express.Router();

// Import route modules
const authRoutes = require('./auth.routes');
const userRoutes = require('./user.routes');
const workspaceRoutes = require('./workspace.routes');
const projectRoutes = require('./project.routes');
const taskRoutes = require('./task.routes');
const customFieldRoutes = require('./customField.routes');
const taskDependencyRoutes = require('./taskDependency.routes');
const inviteRoutes = require('./invite.routes');
const statusRoutes = require('./status.routes');
const commentRoutes = require('./comment.routes');
const attachmentRoutes = require('./attachment.routes');
const dashboardRoutes = require('./dashboard.routes');
const activityLogRoutes = require('./activityLog.routes');
const calendarRoutes = require('./calendar.routes');
const timeTrackingRoutes = require('./timeTracking.routes');
const resourceRoutes = require('./resource.routes');
const budgetRoutes = require('./budget.routes');
const ganttRoutes = require('./gantt.routes');
const savedViewRoutes = require('./savedView.routes');
const workflowRoutes = require('./workflow.routes');
const documentRoutes = require('./document.routes');
const whiteboardRoutes = require('./whiteboard.routes');
const chatRoutes = require('./chat.routes');
const permissionRoutes = require('./permission.routes');
const notificationRoutes = require('./notification.routes');
const searchRoutes = require('./search.routes');
const automationRoutes = require('./automation.routes');
const guestAccessRoutes = require('./guestAccess.routes');
const billingRoutes     = require('./billing.routes');

// Health check
router.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'API is healthy',
    timestamp: new Date().toISOString()
  });
});

// Route definitions
router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/workspaces', workspaceRoutes);
// Status routes must come before project routes to avoid route conflicts
router.use('/', statusRoutes); // Status routes (includes /projects/:projectId/statuses)
router.use('/projects', projectRoutes);
router.use('/tasks', taskRoutes);
router.use('/', customFieldRoutes); // Custom fields routes (includes /projects/:id/custom-fields and /tasks/:id/custom-fields)
router.use('/', taskDependencyRoutes); // Task dependency routes
router.use('/invites', inviteRoutes); // Invite routes
router.use('/', commentRoutes); // Comment routes (includes /tasks/:taskId/comments)
router.use('/', attachmentRoutes); // Attachment routes (includes /tasks/:taskId/attachments)
router.use('/dashboard', dashboardRoutes); // Dashboard routes
router.use('/activity-logs', activityLogRoutes); // Activity log routes
router.use('/calendar', calendarRoutes); // Calendar routes
router.use('/time-logs', timeTrackingRoutes); // Time tracking routes
router.use('/resources', resourceRoutes); // Resource management routes
router.use('/budgets', budgetRoutes); // Budget management routes
router.use('/gantt', ganttRoutes); // Gantt view routes
router.use('/saved-views', savedViewRoutes); // Saved view routes
router.use('/workflows', workflowRoutes); // Workflow routes
router.use('/', permissionRoutes); // Permissions matrix
router.use('/notifications', notificationRoutes); // In-app notifications
router.use('/search', searchRoutes); // Global search
router.use('/automations', automationRoutes); // Automation Builder
router.use('/guest-access', guestAccessRoutes); // Guest Access
router.use('/', documentRoutes); // Documents
router.use('/', whiteboardRoutes); // Whiteboards
router.use('/', chatRoutes);    // Chat
router.use('/billing', billingRoutes); // Billing / Razorpay

module.exports = router;


