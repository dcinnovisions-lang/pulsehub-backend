const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Workflow = sequelize.define('Workflow', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  name: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  projectId: {
    type: DataTypes.UUID,
    allowNull: false,
    unique: true,
    field: 'project_id',
    references: {
      model: 'projects',
      key: 'id'
    }
  },
  definition: {
    type: DataTypes.JSONB,
    allowNull: true, // Stores workflow node definitions and transitions
    comment: 'Workflow definition: { nodes: [], transitions: [], statuses: [] }'
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    field: 'is_active'
  },
  isTemplate: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'is_template'
  }
}, {
  tableName: 'workflows',
  timestamps: true,
  underscored: true,
  indexes: [
    {
      fields: ['project_id']
    }
  ]
});

// Associations
Workflow.associate = (models) => {
  Workflow.belongsTo(models.Project, {
    foreignKey: 'project_id',
    as: 'project'
  });
};

module.exports = Workflow;


