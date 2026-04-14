require('dotenv').config();
const { sequelize } = require('../config/database');

async function addAssigneeColumn() {
  try {
    await sequelize.authenticate();
    console.log('Database connection established.');

    // Check if column already exists
    const [results] = await sequelize.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name='subtasks' AND column_name='assignee_id'
    `);

    if (results.length > 0) {
      console.log('Column assignee_id already exists in subtasks table.');
      process.exit(0);
    }

    // Add the column
    await sequelize.query(`
      ALTER TABLE subtasks 
      ADD COLUMN assignee_id UUID REFERENCES users(id) ON UPDATE CASCADE ON DELETE SET NULL
    `);

    // Add index
    await sequelize.query(`
      CREATE INDEX IF NOT EXISTS subtasks_assignee_id ON subtasks(assignee_id)
    `);

    console.log('Successfully added assignee_id column to subtasks table.');
    process.exit(0);
  } catch (error) {
    console.error('Error adding column:', error);
    process.exit(1);
  }
}

addAssigneeColumn();

