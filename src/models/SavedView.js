const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const SavedView = sequelize.define('SavedView', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  name: {
    type: DataTypes.STRING(255),
    allowNull: false
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
  workspaceId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'workspace_id',
    references: {
      model: 'workspaces',
      key: 'id'
    }
  },
  projectId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'project_id',
    references: {
      model: 'projects',
      key: 'id'
    }
  },
  viewType: {
    type: DataTypes.ENUM('list', 'kanban', 'calendar', 'gantt', 'workload'),
    allowNull: false,
    field: 'view_type',
    defaultValue: 'list'
  },
  filters: {
    type: DataTypes.JSONB,
    allowNull: true,
    comment: 'Stores filter configuration: { status: [], assignee: [], priority: [], dateRange: {} }'
  },
  sortBy: {
    type: DataTypes.JSONB,
    allowNull: true,
    field: 'sort_by',
    comment: 'Stores sort configuration: [{ field: "dueDate", direction: "asc" }]'
  },
  groupBy: {
    type: DataTypes.STRING(50),
    allowNull: true,
    field: 'group_by',
    comment: 'Group by: project, assignee, status, priority, date'
  },
  columns: {
    type: DataTypes.JSONB,
    allowNull: true,
    comment: 'Stores visible columns configuration'
  },
  isDefault: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'is_default'
  },
  isPublic: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'is_public'
  }
}, {
  tableName: 'saved_views',
  timestamps: true,
  underscored: true,
  indexes: [
    {
      fields: ['user_id']
    },
    {
      fields: ['workspace_id']
    },
    {
      fields: ['project_id']
    },
    {
      fields: ['view_type']
    }
  ]
});

// Associations
SavedView.associate = (models) => {
  SavedView.belongsTo(models.User, {
    foreignKey: 'user_id',
    as: 'user'
  });
  
  SavedView.belongsTo(models.Workspace, {
    foreignKey: 'workspace_id',
    as: 'workspace'
  });
  
  SavedView.belongsTo(models.Project, {
    foreignKey: 'project_id',
    as: 'project'
  });
};

module.exports = SavedView;




