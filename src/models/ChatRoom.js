const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const ChatRoom = sequelize.define('ChatRoom', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  name: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  scope: {
    type: DataTypes.ENUM('global', 'workspace', 'project'),
    allowNull: false,
    defaultValue: 'project'
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
  tableName: 'chat_rooms',
  timestamps: true,
  underscored: true,
  indexes: [
    { fields: ['workspace_id'] },
    { fields: ['project_id'] },
    { fields: ['scope'] }
  ]
});

ChatRoom.associate = (models) => {
  ChatRoom.belongsTo(models.Workspace, { foreignKey: 'workspace_id', as: 'workspace' });
  ChatRoom.belongsTo(models.Project, { foreignKey: 'project_id', as: 'project' });
  ChatRoom.belongsTo(models.User, { foreignKey: 'created_by', as: 'creator', attributes: ['id', 'firstName', 'lastName', 'email'] });
  ChatRoom.hasMany(models.ChatMessage, { foreignKey: 'room_id', as: 'messages', onDelete: 'CASCADE' });
};

module.exports = ChatRoom;
