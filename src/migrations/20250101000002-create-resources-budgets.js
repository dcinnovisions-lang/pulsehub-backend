'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Create resources table
    await queryInterface.createTable('resources', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
        allowNull: false
      },
      user_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      workspace_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'workspaces',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      capacity_hours: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 40
      },
      availability: {
        type: Sequelize.ENUM('available', 'busy', 'unavailable', 'on_leave'),
        defaultValue: 'available',
        allowNull: false
      },
      skills: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: []
      },
      hourly_rate: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: true
      },
      start_date: {
        type: Sequelize.DATE,
        allowNull: true
      },
      end_date: {
        type: Sequelize.DATE,
        allowNull: true
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      }
    });

    // Create budgets table
    await queryInterface.createTable('budgets', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
        allowNull: false
      },
      project_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'projects',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      name: {
        type: Sequelize.STRING(255),
        allowNull: false
      },
      budget_amount: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: false
      },
      currency: {
        type: Sequelize.STRING(3),
        defaultValue: 'USD',
        allowNull: false
      },
      start_date: {
        type: Sequelize.DATE,
        allowNull: true
      },
      end_date: {
        type: Sequelize.DATE,
        allowNull: true
      },
      allocated_amount: {
        type: Sequelize.DECIMAL(15, 2),
        defaultValue: 0,
        allowNull: false
      },
      spent_amount: {
        type: Sequelize.DECIMAL(15, 2),
        defaultValue: 0,
        allowNull: false
      },
      status: {
        type: Sequelize.ENUM('draft', 'active', 'closed', 'exceeded'),
        defaultValue: 'draft',
        allowNull: false
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      }
    });

    // Create budget_expenses table
    await queryInterface.createTable('budget_expenses', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
        allowNull: false
      },
      budget_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'budgets',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      task_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'tasks',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      category: {
        type: Sequelize.ENUM('labor', 'materials', 'equipment', 'travel', 'other'),
        allowNull: false,
        defaultValue: 'labor'
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      amount: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: false
      },
      date: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      user_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      }
    });

    // Add indexes
    await queryInterface.addIndex('resources', ['user_id'], { name: 'resources_user_idx' });
    await queryInterface.addIndex('resources', ['workspace_id'], { name: 'resources_workspace_idx' });
    await queryInterface.addIndex('budgets', ['project_id'], { name: 'budgets_project_idx' });
    await queryInterface.addIndex('budget_expenses', ['budget_id'], { name: 'budget_expenses_budget_idx' });
    await queryInterface.addIndex('budget_expenses', ['task_id'], { name: 'budget_expenses_task_idx' });
    await queryInterface.addIndex('budget_expenses', ['date'], { name: 'budget_expenses_date_idx' });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('budget_expenses');
    await queryInterface.dropTable('budgets');
    await queryInterface.dropTable('resources');
  }
};

