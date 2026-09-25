const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const PermissionOverride = sequelize.define('PermissionOverride', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  workspaceId: { type: DataTypes.UUID, allowNull: false, field: 'workspace_id' },
  projectId: { type: DataTypes.UUID, allowNull: true, field: 'project_id' },
  role: { type: DataTypes.STRING(40), allowNull: false },
  resource: { type: DataTypes.STRING(40), allowNull: false },
  action: { type: DataTypes.STRING(40), allowNull: false },
  value: { type: DataTypes.STRING(20), allowNull: false },
  updatedBy: { type: DataTypes.UUID, allowNull: true, field: 'updated_by' }
}, {
  tableName: 'permission_overrides',
  timestamps: true,
  underscored: true
});

module.exports = PermissionOverride;
