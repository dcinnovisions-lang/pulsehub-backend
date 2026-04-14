const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const TaskAssignees = sequelize.define('TaskAssignees', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  taskId: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'task_id',
    references: {
      model: 'tasks',
      key: 'id'
    }
  },
  userId: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'user_id',
    references: {
      model: 'users',
      key: 'id'
    }
  }
}, {
  tableName: 'task_assignees',
  timestamps: true,
  underscored: true,
  indexes: [
    {
      unique: true,
      fields: ['task_id', 'user_id']
    },
    {
      fields: ['task_id']
    },
    {
      fields: ['user_id']
    }
  ]
});

module.exports = TaskAssignees;


