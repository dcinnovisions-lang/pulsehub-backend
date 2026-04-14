const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Task = sequelize.define('Task', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  title: {
    type: DataTypes.STRING(500),
    allowNull: false
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  projectId: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'project_id',
    references: {
      model: 'projects',
      key: 'id'
    }
  },
  listId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'list_id',
    references: {
      model: 'lists',
      key: 'id'
    }
  },
  statusId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'status_id',
    references: {
      model: 'statuses',
      key: 'id'
    }
  },
  priority: {
    type: DataTypes.ENUM('urgent', 'high', 'medium', 'low'),
    defaultValue: 'medium',
    allowNull: false
  },
  dueDate: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'due_date'
  },
  startDate: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'start_date'
  },
  estimatedHours: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true,
    field: 'estimated_hours'
  },
  position: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    allowNull: false
  },
  createdBy: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'created_by',
    references: {
      model: 'users',
      key: 'id'
    }
  },
  isArchived: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'is_archived'
  },
  progress: {
    type: DataTypes.DECIMAL(5, 2),
    defaultValue: 0,
    allowNull: false,
    validate: {
      min: 0,
      max: 100
    }
  },
  labels: { type: DataTypes.JSONB, defaultValue: [] },
  recurrence: {
    type: DataTypes.JSONB,
    allowNull: true,
    defaultValue: null,
    comment: 'Stores recurrence config: { type: "daily"|"weekly"|"monthly", interval: number, endDate: string|null }'
  }
}, {
  tableName: 'tasks',
  timestamps: true,
  underscored: true,
  indexes: [
    {
      fields: ['project_id']
    },
    {
      fields: ['list_id']
    },
    {
      fields: ['status_id']
    },
    {
      fields: ['created_by']
    },
    {
      fields: ['due_date']
    },
    {
      fields: ['priority']
    },
    {
      fields: ['position']
    }
  ]
});

// Associations
Task.associate = (models) => {
  Task.belongsTo(models.Project, {
    foreignKey: 'project_id',
    as: 'project'
  });
  
  Task.belongsTo(models.List, {
    foreignKey: 'list_id',
    as: 'list'
  });
  
  Task.belongsTo(models.Status, {
    foreignKey: 'status_id',
    as: 'status'
  });
  
  Task.belongsTo(models.User, {
    foreignKey: 'created_by',
    as: 'creator'
  });
  
  Task.belongsToMany(models.User, {
    through: 'TaskAssignees',
    foreignKey: 'task_id',
    otherKey: 'user_id',
    as: 'assignees'
  });
  
  Task.hasMany(models.Subtask, {
    foreignKey: 'task_id',
    as: 'subtasks'
  });
  
  Task.hasMany(models.Comment, {
    foreignKey: 'task_id',
    as: 'comments'
  });
  
  Task.hasMany(models.Attachment, {
    foreignKey: 'task_id',
    as: 'attachments'
  });
  
  Task.hasMany(models.TimeLog, {
    foreignKey: 'task_id',
    as: 'timeLogs'
  });
  
  Task.belongsToMany(models.CustomField, {
    through: models.TaskCustomField,
    foreignKey: 'task_id',
    otherKey: 'custom_field_id',
    as: 'customFields'
  });
  
  // Task dependencies (self-referential)
  Task.belongsToMany(models.Task, {
    through: models.TaskDependency,
    foreignKey: 'task_id',
    otherKey: 'depends_on_task_id',
    as: 'dependencies'
  });
  
  Task.belongsToMany(models.Task, {
    through: models.TaskDependency,
    foreignKey: 'depends_on_task_id',
    otherKey: 'task_id',
    as: 'dependentTasks'
  });
};

module.exports = Task;


