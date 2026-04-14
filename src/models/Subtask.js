const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Subtask = sequelize.define('Subtask', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  title: {
    type: DataTypes.STRING(500),
    allowNull: false
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
  isCompleted: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'is_completed'
  },
  position: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    allowNull: false
  },
  assigneeId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'assignee_id',
    references: {
      model: 'users',
      key: 'id'
    }
  },
  dueDate: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'due_date'
  },
  estimatedHours: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true,
    field: 'estimated_hours'
  }
}, {
  tableName: 'subtasks',
  timestamps: true,
  underscored: true,
  indexes: [
    {
      fields: ['task_id']
    },
    {
      fields: ['position']
    },
    {
      fields: ['assignee_id']
    },
    {
      fields: ['due_date']
    }
  ]
});

// Associations
Subtask.associate = (models) => {
  Subtask.belongsTo(models.Task, {
    foreignKey: 'task_id',
    as: 'task'
  });
  
  Subtask.belongsTo(models.User, {
    foreignKey: 'assignee_id',
    as: 'assignee'
  });
};

module.exports = Subtask;


