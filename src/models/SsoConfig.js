const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const SsoConfig = sequelize.define('SsoConfig', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  workspaceId: { type: DataTypes.UUID, allowNull: false, unique: true, field: 'workspace_id' },
  enabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  issuer: { type: DataTypes.STRING(500), allowNull: true },
  clientId: { type: DataTypes.STRING(255), allowNull: true, field: 'client_id' },
  clientSecretEnc: { type: DataTypes.TEXT, allowNull: true, field: 'client_secret_enc' },
  allowedDomains: { type: DataTypes.JSONB, allowNull: false, defaultValue: [], field: 'allowed_domains' },
  autoProvision: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true, field: 'auto_provision' },
  defaultRole: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'member', field: 'default_role' },
  enforce: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  updatedBy: { type: DataTypes.UUID, allowNull: true, field: 'updated_by' }
}, {
  tableName: 'sso_configs',
  timestamps: true,
  underscored: true
});

module.exports = SsoConfig;
