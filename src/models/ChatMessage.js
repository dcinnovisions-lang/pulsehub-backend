const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const ChatMessage = sequelize.define('ChatMessage', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  roomId: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'room_id'
  },
  userId: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'user_id'
  },
  content: {
    type: DataTypes.TEXT,
    allowNull: false,
    defaultValue: '',
  },
  reactions: {
    type: DataTypes.JSONB,
    allowNull: true,
    defaultValue: {},
  },
  editedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'edited_at',
  },
  parentId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'parent_id',
    references: { model: 'chat_messages', key: 'id' },
  },
  attachment: {
    type: DataTypes.JSONB,
    allowNull: true,
    defaultValue: null,
    // shape: { url: string, name: string, mimeType: string, size: number }
  },
}, {
  tableName: 'chat_messages',
  timestamps: true,
  underscored: true,
  indexes: [
    { fields: ['room_id'] },
    { fields: ['user_id'] },
    { fields: ['created_at'] }
  ]
});

ChatMessage.associate = (models) => {
  ChatMessage.belongsTo(models.ChatRoom, { foreignKey: 'room_id', as: 'room' });
  ChatMessage.belongsTo(models.User, { foreignKey: 'user_id', as: 'user', attributes: ['id', 'firstName', 'lastName', 'email', 'avatar'] });
  ChatMessage.belongsTo(models.ChatMessage, { foreignKey: 'parent_id', as: 'parent' });
  ChatMessage.hasMany(models.ChatMessage, { foreignKey: 'parent_id', as: 'replies' });
};

module.exports = ChatMessage;
