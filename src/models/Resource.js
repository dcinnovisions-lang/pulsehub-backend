const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Resource = sequelize.define('Resource', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
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
  capacityHours: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    defaultValue: 40,
    field: 'capacity_hours',
    comment: 'Weekly capacity in hours'
  },
  availability: {
    type: DataTypes.ENUM('available', 'busy', 'unavailable', 'on_leave'),
    defaultValue: 'available',
    allowNull: false
  },
  skills: {
    type: DataTypes.JSONB,
    allowNull: true,
    defaultValue: [],
    comment: 'Array of skill tags'
  },
  hourlyRate: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true,
    field: 'hourly_rate',
    comment: 'Hourly rate for billing'
  },
  startDate: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'start_date'
  },
  endDate: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'end_date'
  }
}, {
  tableName: 'resources',
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
      fields: ['availability']
    }
  ]
});

// Associations
Resource.associate = (models) => {
  Resource.belongsTo(models.User, {
    foreignKey: 'user_id',
    as: 'user',
    attributes: ['id', 'firstName', 'lastName', 'email', 'avatar']
  });
  
  Resource.belongsTo(models.Workspace, {
    foreignKey: 'workspace_id',
    as: 'workspace',
    attributes: ['id', 'name'],
    required: false
  });
};

module.exports = Resource;

