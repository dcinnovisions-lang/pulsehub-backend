const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Budget = sequelize.define('Budget', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  projectId: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'project_id',
    references: {
      model: 'projects',
      key: 'id'
    }
  },
  name: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  budgetAmount: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    field: 'budget_amount'
  },
  currency: {
    type: DataTypes.STRING(3),
    defaultValue: 'USD',
    allowNull: false
  },
  startDate: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'start_date'
  },
  endDate: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'end_date'
  },
  allocatedAmount: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0,
    field: 'allocated_amount',
    comment: 'Amount allocated to tasks/items'
  },
  spentAmount: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0,
    field: 'spent_amount',
    comment: 'Actual amount spent'
  },
  status: {
    type: DataTypes.ENUM('draft', 'active', 'closed', 'exceeded'),
    defaultValue: 'draft',
    allowNull: false
  }
}, {
  tableName: 'budgets',
  timestamps: true,
  underscored: true,
  indexes: [
    {
      fields: ['project_id']
    },
    {
      fields: ['status']
    }
  ]
});

// Associations
Budget.associate = (models) => {
  Budget.belongsTo(models.Project, {
    foreignKey: 'project_id',
    as: 'project',
    attributes: ['id', 'name']
  });
  
  Budget.hasMany(models.BudgetExpense, {
    foreignKey: 'budget_id',
    as: 'expenses'
  });
};

module.exports = Budget;

