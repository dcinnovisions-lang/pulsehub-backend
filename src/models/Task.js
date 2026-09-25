const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');
const { allocateTaskNumber } = require('../utils/issueKeys');

const ISSUE_TYPES = ['task', 'bug', 'story', 'epic'];
const SEVERITIES = ['critical', 'major', 'minor', 'trivial'];

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
  issueType: {
    type: DataTypes.STRING(20),
    allowNull: false,
    defaultValue: 'task',
    field: 'issue_type',
    validate: { isIn: [ISSUE_TYPES] }
  },
  taskNumber: { type: DataTypes.INTEGER, allowNull: true, field: 'task_number' },
  taskKey: { type: DataTypes.STRING(30), allowNull: true, field: 'task_key' },
  storyPoints: { type: DataTypes.DECIMAL(6, 1), allowNull: true, field: 'story_points' },
  epicId: { type: DataTypes.UUID, allowNull: true, field: 'epic_id' },
  sprintId: { type: DataTypes.UUID, allowNull: true, field: 'sprint_id' },
  releaseId: { type: DataTypes.UUID, allowNull: true, field: 'release_id' },
  severity: { type: DataTypes.STRING(20), allowNull: true, validate: { isIn: [SEVERITIES] } },
  environment: { type: DataTypes.TEXT, allowNull: true },
  stepsToReproduce: { type: DataTypes.TEXT, allowNull: true, field: 'steps_to_reproduce' },
  expectedResult: { type: DataTypes.TEXT, allowNull: true, field: 'expected_result' },
  actualResult: { type: DataTypes.TEXT, allowNull: true, field: 'actual_result' },
  fixedBy: { type: DataTypes.UUID, allowNull: true, field: 'fixed_by' },
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
  ],
  hooks: {
    // Every path that creates a task gets the next per-project number and key (e.g. SCH-12)
    beforeCreate: async (task, options) => {
      if (task.taskNumber) return;
      const { number, key } = await allocateTaskNumber(task.projectId, options.transaction);
      task.taskNumber = number;
      task.taskKey = key;
    }
  }
});

Task.ISSUE_TYPES = ISSUE_TYPES;
Task.SEVERITIES = SEVERITIES;

// Associations
Task.associate = (models) => {
  Task.belongsTo(models.Sprint, { foreignKey: 'sprintId', as: 'sprint' });
  Task.belongsTo(models.Release, { foreignKey: 'releaseId', as: 'release' });
  Task.belongsTo(models.Task, { foreignKey: 'epicId', as: 'epic' });
  Task.hasMany(models.Task, { foreignKey: 'epicId', as: 'epicChildren' });
  Task.belongsTo(models.User, { foreignKey: 'fixedBy', as: 'fixer' });

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


