const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Attachment = sequelize.define('Attachment', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  filename: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  originalName: {
    type: DataTypes.STRING(255),
    allowNull: false,
    field: 'original_name'
  },
  mimeType: {
    type: DataTypes.STRING(100),
    allowNull: false,
    field: 'mime_type'
  },
  size: {
    type: DataTypes.INTEGER,
    allowNull: false // Size in bytes
  },
  path: {
    type: DataTypes.STRING(500),
    allowNull: false // File path or S3 key
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
  uploadedBy: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'uploaded_by',
    references: {
      model: 'users',
      key: 'id'
    }
  }
}, {
  tableName: 'attachments',
  timestamps: true,
  underscored: true,
  indexes: [
    {
      fields: ['task_id']
    },
    {
      fields: ['uploaded_by']
    }
  ]
});

// Associations
Attachment.associate = (models) => {
  Attachment.belongsTo(models.Task, {
    foreignKey: 'task_id',
    as: 'task'
  });
  
  Attachment.belongsTo(models.User, {
    foreignKey: 'uploaded_by',
    as: 'uploader'
  });
};

module.exports = Attachment;


