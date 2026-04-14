const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const TaskCustomField = sequelize.define('TaskCustomField', {
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
  customFieldId: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'custom_field_id',
    references: {
      model: 'custom_fields',
      key: 'id'
    }
  },
  value: {
    type: DataTypes.TEXT,
    allowNull: true // JSON string for complex types
  }
}, {
  tableName: 'task_custom_fields',
  timestamps: true,
  underscored: true,
  indexes: [
    {
      fields: ['task_id']
    },
    {
      fields: ['custom_field_id']
    },
    {
      unique: true,
      fields: ['task_id', 'custom_field_id']
    }
  ]
});

// Associations
TaskCustomField.associate = (models) => {
  TaskCustomField.belongsTo(models.Task, {
    foreignKey: 'task_id',
    as: 'task'
  });
  
  TaskCustomField.belongsTo(models.CustomField, {
    foreignKey: 'custom_field_id',
    as: 'customField'
  });
};

module.exports = TaskCustomField;


