const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const ActivityLog = sequelize.define('ActivityLog', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  entityType: {
    type: DataTypes.ENUM('task', 'project', 'workspace', 'comment', 'attachment'),
    allowNull: false,
    field: 'entity_type'
  },
  entityId: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'entity_id'
  },
  action: {
    type: DataTypes.ENUM(
      'created', 'updated', 'deleted', 'archived', 'restored',
      'status_changed', 'assigned', 'unassigned', 'commented',
      'attachment_added', 'attachment_removed', 'moved', 'duplicated'
    ),
    allowNull: false
  },
  userId: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'user_id',
    references: {
      model: 'users',
      key: 'id'
    }
  },
  changes: {
    type: DataTypes.JSONB,
    allowNull: true,
    comment: 'Stores field changes: { field: { old: value, new: value } }'
  },
  metadata: {
    type: DataTypes.JSONB,
    allowNull: true,
    comment: 'Additional context: { ip, userAgent, etc. }'
  }
}, {
  tableName: 'activity_logs',
  timestamps: true,
  underscored: true,
  indexes: [
    {
      fields: ['entity_type', 'entity_id']
    },
    {
      fields: ['user_id']
    },
    {
      fields: ['created_at']
    }
  ]
});

// Associations
ActivityLog.associate = (models) => {
  ActivityLog.belongsTo(models.User, {
    foreignKey: 'user_id',
    as: 'user',
    attributes: ['id', 'firstName', 'lastName', 'email', 'avatar']
  });
};

module.exports = ActivityLog;

