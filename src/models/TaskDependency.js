const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const TaskDependency = sequelize.define('TaskDependency', {
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
  dependsOnTaskId: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'depends_on_task_id',
    references: {
      model: 'tasks',
      key: 'id'
    }
  },
  type: {
    type: DataTypes.ENUM('blocks', 'precedes'),
    defaultValue: 'blocks',
    allowNull: false
  }
}, {
  tableName: 'task_dependencies',
  timestamps: true,
  underscored: true,
  indexes: [
    {
      fields: ['task_id']
    },
    {
      fields: ['depends_on_task_id']
    },
    {
      unique: true,
      fields: ['task_id', 'depends_on_task_id']
    }
  ]
});

// Associations
TaskDependency.associate = (models) => {
  TaskDependency.belongsTo(models.Task, {
    foreignKey: 'task_id',
    as: 'task'
  });
  
  TaskDependency.belongsTo(models.Task, {
    foreignKey: 'depends_on_task_id',
    as: 'dependsOnTask'
  });
};

module.exports = TaskDependency;


