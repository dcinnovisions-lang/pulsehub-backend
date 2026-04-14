const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const TimeTracking = sequelize.define('TimeTracking', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  taskId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'Tasks',
      key: 'id',
    },
    onDelete: 'CASCADE',
  },
  userId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'Users',
      key: 'id',
    },
    onDelete: 'CASCADE',
  },
  projectId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'Projects',
      key: 'id',
    },
    onDelete: 'CASCADE',
  },
  workspaceId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'Workspaces',
      key: 'id',
    },
    onDelete: 'CASCADE',
  },
  // Time duration in minutes
  duration: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    validate: {
      min: 0,
      max: 1440, // Max 24 hours in minutes
    },
  },
  // For timer-based tracking
  startTime: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  endTime: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  // Manual or timer-based
  type: {
    type: DataTypes.ENUM('manual', 'timer'),
    defaultValue: 'manual',
  },
  // Is timer currently running
  isRunning: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  // Optional description of work done
  description: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  // Date the time was logged
  logDate: {
    type: DataTypes.DATEONLY,
    allowNull: false,
    defaultValue: DataTypes.NOW,
  },
  // Status: pending, approved, rejected
  status: {
    type: DataTypes.ENUM('pending', 'approved', 'rejected'),
    defaultValue: 'pending',
  },
  // Billable or not
  isBillable: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
  // Tags for categorization
  tags: {
    type: DataTypes.JSON,
    defaultValue: [],
  },
  createdAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
  updatedAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
}, {
  tableName: 'TimeTracking',
  timestamps: true,
  indexes: [
    { fields: ['taskId'] },
    { fields: ['userId'] },
    { fields: ['projectId'] },
    { fields: ['workspaceId'] },
    { fields: ['logDate'] },
    { fields: ['status'] },
  ],
});

module.exports = TimeTracking;
