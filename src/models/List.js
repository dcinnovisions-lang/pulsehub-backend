const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const List = sequelize.define('List', {
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
    field: 'project_id',
    references: {
      model: 'projects',
      key: 'id'
    }
  },
  position: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    allowNull: false
  },
  isArchived: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'is_archived'
  }
}, {
  tableName: 'lists',
  timestamps: true,
  underscored: true,
  indexes: [
    {
      fields: ['project_id']
    },
    {
      fields: ['position']
    }
  ]
});

// Associations
List.associate = (models) => {
  List.belongsTo(models.Project, {
    foreignKey: 'project_id',
    as: 'project'
  });
  
  List.hasMany(models.Task, {
    foreignKey: 'list_id',
    as: 'tasks'
  });
};

module.exports = List;


