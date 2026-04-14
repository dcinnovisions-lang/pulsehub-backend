const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const BudgetExpense = sequelize.define('BudgetExpense', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  budgetId: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'budget_id',
    references: {
      model: 'budgets',
      key: 'id'
    }
  },
  taskId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'task_id',
    references: {
      model: 'tasks',
      key: 'id'
    }
  },
  category: {
    type: DataTypes.ENUM('labor', 'materials', 'equipment', 'travel', 'other'),
    allowNull: false,
    defaultValue: 'labor'
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  amount: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false
  },
  date: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  },
  userId: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'user_id',
    references: {
      model: 'users',
      key: 'id'
    }
  }
}, {
  tableName: 'budget_expenses',
  timestamps: true,
  underscored: true,
  indexes: [
    {
      fields: ['budget_id']
    },
    {
      fields: ['task_id']
    },
    {
      fields: ['date']
    }
  ]
});

// Associations
BudgetExpense.associate = (models) => {
  BudgetExpense.belongsTo(models.Budget, {
    foreignKey: 'budget_id',
    as: 'budget'
  });
  
  BudgetExpense.belongsTo(models.Task, {
    foreignKey: 'task_id',
    as: 'task',
    required: false
  });
  
  BudgetExpense.belongsTo(models.User, {
    foreignKey: 'user_id',
    as: 'user',
    attributes: ['id', 'firstName', 'lastName', 'email']
  });
};

module.exports = BudgetExpense;

