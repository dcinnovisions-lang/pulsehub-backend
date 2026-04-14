// RBAC V2 — STEP 2
// Project-level membership table.
// Overrides workspace role for a specific project.
// Resolution order: super_admin → workspace owner → project role → workspace role → deny

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const PROJECT_ROLES = ['project_lead', 'contributor', 'reporter', 'reviewer', 'commenter', 'viewer'];

const ProjectMembers = sequelize.define('ProjectMembers', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
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
  userId: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'user_id',
    references: {
      model: 'users',
      key: 'id'
    }
  },
  // Project-level role — overrides workspace role for this project
  role: {
    type: DataTypes.ENUM(...PROJECT_ROLES),
    allowNull: false,
    defaultValue: 'contributor',
    validate: {
      isIn: [PROJECT_ROLES]
    }
  },
  // Who added this person to the project
  invitedBy: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'invited_by',
    references: {
      model: 'users',
      key: 'id'
    }
  },
  joinedAt: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    field: 'joined_at'
  }
}, {
  tableName: 'project_members',
  timestamps: true,
  underscored: true,
  indexes: [
    {
      unique: true,
      fields: ['project_id', 'user_id']  // One role per user per project
    },
    {
      fields: ['project_id']
    },
    {
      fields: ['user_id']
    },
    {
      fields: ['role']
    }
  ]
});

// Associations
ProjectMembers.associate = (models) => {
  ProjectMembers.belongsTo(models.Project, {
    foreignKey: 'project_id',
    as: 'project'
  });

  ProjectMembers.belongsTo(models.User, {
    foreignKey: 'user_id',
    as: 'user'
  });

  ProjectMembers.belongsTo(models.User, {
    foreignKey: 'invited_by',
    as: 'inviter'
  });
};

module.exports = ProjectMembers;
module.exports.PROJECT_ROLES = PROJECT_ROLES;
