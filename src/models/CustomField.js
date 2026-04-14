const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const CustomField = sequelize.define('CustomField', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  name: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  type: {
    type: DataTypes.ENUM('text', 'number', 'dropdown', 'date', 'multi_select', 'label'),
    allowNull: false
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
  options: {
    type: DataTypes.JSONB,
    allowNull: true // For dropdown and multi_select options
  },
  isRequired: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'is_required'
  },
  position: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    allowNull: false
  }
}, {
  tableName: 'custom_fields',
  timestamps: true,
  underscored: true,
  indexes: [
    {
      fields: ['project_id']
    }
  ]
});

// Associations
CustomField.associate = (models) => {
  CustomField.belongsTo(models.Project, {
    foreignKey: 'project_id',
    as: 'project'
  });
  
  CustomField.belongsToMany(models.Task, {
    through: models.TaskCustomField,
    foreignKey: 'custom_field_id',
    otherKey: 'task_id',
    as: 'tasks'
  });
};

module.exports = CustomField;


