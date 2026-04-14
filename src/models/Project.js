const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Project = sequelize.define('Project', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  name: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  workspaceId: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'workspace_id',
    references: {
      model: 'workspaces',
      key: 'id'
    }
  },
  status: {
    type: DataTypes.ENUM('active', 'archived', 'completed'),
    defaultValue: 'active',
    allowNull: false
  },
  color: {
    type: DataTypes.STRING(7),
    allowNull: true,
    defaultValue: '#3B82F6'
  },
  isTemplate: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'is_template'
  },
  templateId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'template_id'
  }
}, {
  tableName: 'projects',
  timestamps: true,
  underscored: true,
  indexes: [
    {
      fields: ['workspace_id']
    },
    {
      fields: ['status']
    }
  ]
});

// Associations
Project.associate = (models) => {
  Project.belongsTo(models.Workspace, {
    foreignKey: 'workspace_id',
    as: 'workspace'
  });
  
  Project.hasMany(models.List, {
    foreignKey: 'project_id',
    as: 'lists'
  });
  
  Project.hasMany(models.Task, {
    foreignKey: 'project_id',
    as: 'tasks'
  });
  
  Project.hasOne(models.Workflow, {
    foreignKey: 'project_id',
    as: 'workflow'
  });
  
  Project.hasMany(models.Status, {
    foreignKey: 'project_id',
    as: 'statuses'
  });
  
  Project.hasMany(models.CustomField, {
    foreignKey: 'project_id',
    as: 'customFields'
  });

  // RBAC V2 — project-level membership
  Project.hasMany(models.ProjectMembers, {
    foreignKey: 'project_id',
    as: 'projectMembers'
  });

  Project.belongsToMany(models.User, {
    through: models.ProjectMembers,
    foreignKey: 'project_id',
    otherKey: 'user_id',
    as: 'members'
  });
};

module.exports = Project;


