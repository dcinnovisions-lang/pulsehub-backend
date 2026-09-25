const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const ApiKey = sequelize.define('ApiKey', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  userId: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'user_id',
    references: { model: 'users', key: 'id' }
  },
  name: { type: DataTypes.STRING(100), allowNull: false },
  keyHash: { type: DataTypes.STRING(64), allowNull: false, unique: true, field: 'key_hash' },
  prefix: { type: DataTypes.STRING(12), allowNull: false },
  lastUsed: { type: DataTypes.DATE, allowNull: true, field: 'last_used' }
}, {
  tableName: 'api_keys',
  underscored: true,
  timestamps: true
});

module.exports = ApiKey;
