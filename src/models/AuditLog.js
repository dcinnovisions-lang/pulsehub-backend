const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const AuditLog = sequelize.define('AuditLog', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  actorId: { type: DataTypes.UUID, allowNull: true, field: 'actor_id' },
  actorEmail: { type: DataTypes.STRING(255), allowNull: true, field: 'actor_email' },
  workspaceId: { type: DataTypes.UUID, allowNull: true, field: 'workspace_id' },
  projectId: { type: DataTypes.UUID, allowNull: true, field: 'project_id' },
  action: { type: DataTypes.STRING(80), allowNull: false },
  targetType: { type: DataTypes.STRING(40), allowNull: true, field: 'target_type' },
  targetId: { type: DataTypes.STRING(64), allowNull: true, field: 'target_id' },
  targetLabel: { type: DataTypes.STRING(255), allowNull: true, field: 'target_label' },
  metadata: { type: DataTypes.JSONB, allowNull: true },
  ip: { type: DataTypes.STRING(64), allowNull: true },
  userAgent: { type: DataTypes.STRING(255), allowNull: true, field: 'user_agent' }
}, {
  tableName: 'audit_logs',
  timestamps: true,
  updatedAt: false,
  underscored: true
});

AuditLog.associate = (models) => {
  AuditLog.belongsTo(models.User, { foreignKey: 'actorId', as: 'actor' });
};

module.exports = AuditLog;
