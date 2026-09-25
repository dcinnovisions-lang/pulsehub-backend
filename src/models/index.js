const { sequelize, Sequelize } = require('../config/database');
const logger = require('../utils/logger');

// Import models
const User = require('./User');
const Workspace = require('./Workspace');
const Project = require('./Project');
const List = require('./List');
const Task = require('./Task');
const Subtask = require('./Subtask');
const TaskDependency = require('./TaskDependency');
const CustomField = require('./CustomField');
const TaskCustomField = require('./TaskCustomField');
const Status = require('./Status');
const Workflow = require('./Workflow');
const Comment = require('./Comment');
const Attachment = require('./Attachment');
const TimeLog = require('./TimeLog');
const TaskAssignees = require('./TaskAssignees');
const WorkspaceMembers = require('./WorkspaceMembers');
const Invite = require('./Invite');
const ActivityLog = require('./ActivityLog');
const Resource = require('./Resource');
const Budget = require('./Budget');
const BudgetExpense = require('./BudgetExpense');
const SavedView = require('./SavedView');
const ApiKey = require('./ApiKey');
const Sprint = require('./Sprint');
const Release = require('./Release');
const AuditLog = require('./AuditLog');
const PermissionOverride = require('./PermissionOverride');
const SsoConfig = require('./SsoConfig');
const Document = require('./Document');
const Whiteboard = require('./Whiteboard');
const WhiteboardElement = require('./WhiteboardElement');
const ChatRoom = require('./ChatRoom');
const ChatMessage = require('./ChatMessage');
// RBAC V2 — STEP 7: New models
const ProjectMembers = require('./ProjectMembers');
const GuestAccess = require('./GuestAccess');
const Notification = require('./Notification');
const Automation = require('./Automation');

// Initialize models
const models = {
  User,
  Workspace,
  Project,
  List,
  Task,
  Subtask,
  TaskDependency,
  CustomField,
  TaskCustomField,
  Status,
  Workflow,
  Comment,
  Attachment,
  TimeLog,
  TaskAssignees,
  WorkspaceMembers,
  ProjectMembers,  // NEW V2 — project-level roles
  GuestAccess,     // NEW V2 — guest scoped access
  Notification,    // In-app notification system
  Automation,      // No-code automation engine
  Invite,
  ActivityLog,
  Resource,
  Budget,
  BudgetExpense,
  SavedView,
  ApiKey,
  Sprint,
  Release,
  AuditLog,
  PermissionOverride,
  SsoConfig,
  Document,
  Whiteboard,
  WhiteboardElement,
  ChatRoom,
  ChatMessage,
  sequelize,
  Sequelize
};

// Define associations
Object.keys(models).forEach(modelName => {
  if (models[modelName].associate) {
    models[modelName].associate(models);
  }
});

// Test connection
sequelize
  .authenticate()
  .then(() => {
    logger.info('Database models loaded successfully');
  })
  .catch((err) => {
    logger.error('Error loading models:', err);
  });

module.exports = models;

