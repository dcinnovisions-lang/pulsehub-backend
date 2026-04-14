const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const TimeLog = sequelize.define('TimeLog', {
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
  },
  hours: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  loggedDate: {
    type: DataTypes.DATE,
    allowNull: false,
    field: 'logged_date'
  },
  startedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'started_at'
  },
  endedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'ended_at'
  },
  isBillable: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    field: 'is_billable'
  }
}, {
  tableName: 'time_logs',
  timestamps: true,
  underscored: true,
  indexes: [
    {
      fields: ['task_id']
    },
    {
      fields: ['user_id']
    },
    {
      fields: ['logged_date']
    }
  ]
});

// Associations
TimeLog.associate = (models) => {
  TimeLog.belongsTo(models.Task, {
    foreignKey: 'task_id',
    as: 'task'
  });
  
  TimeLog.belongsTo(models.User, {
    foreignKey: 'user_id',
    as: 'user'
  });
};

module.exports = TimeLog;


