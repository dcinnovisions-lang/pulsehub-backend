const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Document = sequelize.define('Document', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  title: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  content: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  contentType: {
    type: DataTypes.ENUM('html', 'markdown'),
    allowNull: false,
    defaultValue: 'html',
    field: 'content_type'
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
  },
  updatedBy: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'updated_by'
  },
  isArchived: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    field: 'is_archived'
  },
  version: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 1
  },
  shareToken: {
    type: DataTypes.UUID,
    allowNull: true,
    defaultValue: null,
    field: 'share_token'
  },
  isPublic: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    field: 'is_public'
  },
}, {
  tableName: 'documents',
  timestamps: true,
  underscored: true,
  indexes: [
    { fields: ['workspace_id'] },
    { fields: ['project_id'] },
    { fields: ['created_by'] },
    { fields: ['is_archived'] },
    { fields: ['share_token'] }
  ]
});

Document.associate = (models) => {
  Document.belongsTo(models.Workspace, { foreignKey: 'workspace_id', as: 'workspace' });
  Document.belongsTo(models.Project, { foreignKey: 'project_id', as: 'project' });
  Document.belongsTo(models.User, { foreignKey: 'created_by', as: 'creator', attributes: ['id', 'firstName', 'lastName', 'email'] });
  Document.belongsTo(models.User, { foreignKey: 'updated_by', as: 'updater', attributes: ['id', 'firstName', 'lastName', 'email'] });
};

module.exports = Document;
