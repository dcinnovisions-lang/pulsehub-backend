'use strict';

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Automation = sequelize.define('Automation', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
    allowNull: false
  },
  workspaceId: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'workspace_id'
  },
  projectId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'project_id'
  },
  createdBy: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'created_by'
  },
  name: {
    type: DataTypes.STRING(255),
    allowNull: false,
    validate: { notEmpty: true, len: [1, 255] }
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    allowNull: false,
    field: 'is_active'
  },
  // trigger: { type, conditions: [{ field, operator, value }] }
  trigger: {
    type: DataTypes.JSONB,
    allowNull: false
  },
  // actions: [{ type, params }]
  actions: {
    type: DataTypes.JSONB,
    allowNull: false,
    defaultValue: []
  },
  runCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    allowNull: false,
    field: 'run_count'
  },
  lastRunAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'last_run_at'
  },
  // recentLogs: last 50 execution log entries
  recentLogs: {
    type: DataTypes.JSONB,
    allowNull: true,
    defaultValue: [],
    field: 'recent_logs'
  }
}, {
  tableName: 'automations',
  underscored: true,
  timestamps: true
});

Automation.associate = (models) => {
  Automation.belongsTo(models.Workspace, { foreignKey: 'workspaceId', as: 'workspace' });
  Automation.belongsTo(models.Project,   { foreignKey: 'projectId',   as: 'project' });
  Automation.belongsTo(models.User,      { foreignKey: 'createdBy',   as: 'creator' });
};

module.exports = Automation;
