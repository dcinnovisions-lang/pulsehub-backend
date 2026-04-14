const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const NOTIFICATION_TYPES = [
  'task_assigned',        // Task assigned to you
  'task_mentioned',       // @mentioned in a task
  'task_comment',         // Comment on a task you're watching
  'task_status_changed',  // Status changed on assigned/watching task
  'task_due_soon',        // Task due date approaching
  'task_overdue',         // Task is overdue
  'project_member_added', // You were added to a project
  'project_member_removed',
  'workspace_member_added',
  'invite_accepted',      // Someone accepted your invite
  'mention',              // @mention in a comment or description
];

const Notification = sequelize.define('Notification', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  userId: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'user_id',
    comment: 'The user who receives this notification'
  },
  type: {
    type: DataTypes.ENUM(...NOTIFICATION_TYPES),
    allowNull: false
  },
  title: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  body: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  // The entity this notification relates to
  entityType: {
    type: DataTypes.ENUM('task', 'project', 'workspace', 'comment', 'invite'),
    allowNull: true,
    field: 'entity_type'
  },
  entityId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'entity_id'
  },
  // Who triggered this notification
  actorId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'actor_id',
    comment: 'The user who triggered this notification (null = system)'
  },
  isRead: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    allowNull: false,
    field: 'is_read'
  },
  readAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'read_at'
  },
  // Additional context for the frontend to build links
  metadata: {
    type: DataTypes.JSONB,
    allowNull: true,
    defaultValue: {},
    comment: 'Extra context: { url, projectId, taskId, workspaceId, ... }'
  }
}, {
  tableName: 'notifications',
  timestamps: true,
  underscored: true,
  indexes: [
    { fields: ['user_id'] },
    { fields: ['user_id', 'is_read'] },
    { fields: ['entity_type', 'entity_id'] },
    { fields: ['created_at'] }
  ]
});

Notification.associate = (models) => {
  Notification.belongsTo(models.User, {
    as: 'recipient',
    foreignKey: 'userId',
    onDelete: 'CASCADE'
  });
  Notification.belongsTo(models.User, {
    as: 'actor',
    foreignKey: 'actorId',
    onDelete: 'SET NULL'
  });
};

module.exports = Notification;
module.exports.NOTIFICATION_TYPES = NOTIFICATION_TYPES;
