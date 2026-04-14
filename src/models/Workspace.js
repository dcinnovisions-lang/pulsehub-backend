const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Workspace = sequelize.define('Workspace', {
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
  ownerId: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'owner_id',
    references: {
      model: 'users',
      key: 'id'
    }
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    field: 'is_active'
  },
  logo: {
    type: DataTypes.STRING(500),
    allowNull: true
  }
}, {
  tableName: 'workspaces',
  timestamps: true,
  underscored: true,
  defaultScope: {
    where: {
      isActive: true
    }
  },
  scopes: {
    withDeleted: {
      // empty scope - used with .scope('withDeleted') or use .unscoped() to bypass default
    }
  },
  indexes: [
    {
      fields: ['owner_id']
    }
  ]
});

// Associations
Workspace.associate = (models) => {
  Workspace.belongsTo(models.User, {
    foreignKey: 'owner_id',
    as: 'owner'
  });
  
  Workspace.belongsToMany(models.User, {
    through: models.WorkspaceMembers,
    foreignKey: 'workspace_id',
    otherKey: 'user_id',
    as: 'members'
  });
  
  Workspace.hasMany(models.Project, {
    foreignKey: 'workspace_id',
    as: 'projects'
  });
};

module.exports = Workspace;

