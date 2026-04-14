const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const WhiteboardElement = sequelize.define('WhiteboardElement', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  whiteboardId: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'whiteboard_id'
  },
  type: {
    type: DataTypes.ENUM('sticky', 'text', 'shape'),
    allowNull: false,
    defaultValue: 'sticky'
  },
  data: {
    type: DataTypes.JSONB,
    allowNull: true,
    defaultValue: {}
  },
  x: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    defaultValue: 0
  },
  y: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    defaultValue: 0
  },
  width: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    defaultValue: 200
  },
  height: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    defaultValue: 160
  },
  rotation: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    defaultValue: 0
  },
  zIndex: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 1,
    field: 'z_index'
  },
  color: {
    type: DataTypes.STRING(20),
    allowNull: true,
    defaultValue: '#fde68a'
  },
  locked: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false
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
  }
}, {
  tableName: 'whiteboard_elements',
  timestamps: true,
  underscored: true,
  indexes: [
    { fields: ['whiteboard_id'] },
    { fields: ['created_by'] },
    { fields: ['z_index'] }
  ]
});

WhiteboardElement.associate = (models) => {
  WhiteboardElement.belongsTo(models.Whiteboard, { foreignKey: 'whiteboard_id', as: 'whiteboard' });
  WhiteboardElement.belongsTo(models.User, { foreignKey: 'created_by', as: 'creator', attributes: ['id', 'firstName', 'lastName', 'email'] });
};

module.exports = WhiteboardElement;
