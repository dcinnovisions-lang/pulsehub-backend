const { sequelize } = require('../config/database');
const logger = require('../utils/logger');

async function createInvitesTable() {
  try {
    // Check if table already exists
    const [results] = await sequelize.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'invites'
      );
    `);

    if (results[0].exists) {
      logger.info('Invites table already exists');
      return;
    }

    // Create invites table
    await sequelize.query(`
      CREATE TABLE invites (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email VARCHAR(255) NOT NULL,
        token VARCHAR(255) NOT NULL UNIQUE,
        workspace_id UUID REFERENCES workspaces(id) ON UPDATE CASCADE ON DELETE CASCADE,
        project_id UUID REFERENCES projects(id) ON UPDATE CASCADE ON DELETE CASCADE,
        role VARCHAR(20) NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'pm', 'member', 'viewer')),
        invited_by UUID NOT NULL REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE,
        status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired', 'cancelled')),
        expires_at TIMESTAMP NOT NULL,
        accepted_at TIMESTAMP,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create indexes
    await sequelize.query(`CREATE UNIQUE INDEX invites_token_unique ON invites(token);`);
    await sequelize.query(`CREATE INDEX invites_email_idx ON invites(email);`);
    await sequelize.query(`CREATE INDEX invites_workspace_id_idx ON invites(workspace_id);`);
    await sequelize.query(`CREATE INDEX invites_project_id_idx ON invites(project_id);`);
    await sequelize.query(`CREATE INDEX invites_status_idx ON invites(status);`);
    await sequelize.query(`CREATE INDEX invites_expires_at_idx ON invites(expires_at);`);

    logger.info('Invites table created successfully');
  } catch (error) {
    logger.error('Error creating invites table:', error);
    throw error;
  }
}

// Run if called directly
if (require.main === module) {
  createInvitesTable()
    .then(() => {
      logger.info('Migration completed');
      process.exit(0);
    })
    .catch((error) => {
      logger.error('Migration failed:', error);
      process.exit(1);
    });
}

module.exports = createInvitesTable;

