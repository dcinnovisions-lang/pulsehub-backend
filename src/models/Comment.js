const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Comment = sequelize.define('Comment', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  content: {
    type: DataTypes.TEXT,
    allowNull: false
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
  userId: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'user_id',
    references: {
      model: 'users',
      key: 'id'
    }
  },
  parentId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'parent_id',
    references: {
      model: 'comments',
      key: 'id'
    }
  },
  reactions: {
    type: DataTypes.JSONB,
    defaultValue: {},
    allowNull: true // Store emoji reactions: { '👍': [user_id1, user_id2] }
  }
}, {
  tableName: 'comments',
  timestamps: true,
  underscored: true,
  indexes: [
    {
      fields: ['task_id']
    },
    {
      fields: ['user_id']
    },
    {
      fields: ['parent_id']
    }
  ]
});

// Associations
Comment.associate = (models) => {
  Comment.belongsTo(models.Task, {
    foreignKey: 'task_id',
    as: 'task'
  });
  
  Comment.belongsTo(models.User, {
    foreignKey: 'user_id',
    as: 'user'
  });
  
  Comment.belongsTo(models.Comment, {
    foreignKey: 'parent_id',
    as: 'parent'
  });
  
  Comment.hasMany(models.Comment, {
    foreignKey: 'parent_id',
    as: 'replies'
  });
};

module.exports = Comment;


