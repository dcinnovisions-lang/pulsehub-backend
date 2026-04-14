const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Status = sequelize.define('Status', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  name: {
    type: DataTypes.STRING(100),
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
  color: {
    type: DataTypes.STRING(7),
    allowNull: true,
    defaultValue: '#94A3B8'
  },
  position: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    allowNull: false
  },
  isDefault: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'is_default'
  }
}, {
  tableName: 'statuses',
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
Status.associate = (models) => {
  Status.belongsTo(models.Project, {
    foreignKey: 'project_id',
    as: 'project'
  });
  
  Status.hasMany(models.Task, {
    foreignKey: 'status_id',
    as: 'tasks'
  });
};

module.exports = Status;


