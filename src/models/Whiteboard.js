const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Whiteboard = sequelize.define('Whiteboard', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  title: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  workspaceId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'workspace_id'
  },
  projectId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'project_id'
  },
  createdBy: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'created_by'
  }
}, {
  tableName: 'whiteboards',
  timestamps: true,
  underscored: true,
  indexes: [
    { fields: ['workspace_id'] },
    { fields: ['project_id'] },
    { fields: ['created_by'] }
  ]
});

Whiteboard.associate = (models) => {
  Whiteboard.belongsTo(models.Workspace, { foreignKey: 'workspace_id', as: 'workspace' });
  Whiteboard.belongsTo(models.Project, { foreignKey: 'project_id', as: 'project' });
  Whiteboard.belongsTo(models.User, { foreignKey: 'created_by', as: 'creator', attributes: ['id', 'firstName', 'lastName', 'email'] });
  Whiteboard.hasMany(models.WhiteboardElement, { foreignKey: 'whiteboard_id', as: 'elements', onDelete: 'CASCADE' });
};

module.exports = Whiteboard;
