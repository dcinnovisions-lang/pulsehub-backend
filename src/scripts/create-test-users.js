require('dotenv').config();
const bcrypt = require('bcryptjs');
const { sequelize } = require('../config/database');
const models = require('../models');
const User = models.User;

const testUsers = [
  {
    email: 'superadmin@test.com',
    password: 'Test@123',
    firstName: 'Super',
    lastName: 'Admin',
    role: 'super_admin',
    isActive: true
  },
  {
    email: 'admin@test.com',
    password: 'Test@123',
    firstName: 'Admin',
    lastName: 'User',
    role: 'admin',
    isActive: true
  },
  {
    email: 'owner@test.com',
    password: 'Test@123',
    firstName: 'Workspace',
    lastName: 'Owner',
    role: 'admin', // Owner is workspace-level, using admin as base role
    isActive: true
  },
  {
    email: 'pm@test.com',
    password: 'Test@123',
    firstName: 'Project',
    lastName: 'Manager',
    role: 'pm',
    isActive: true
  },
  {
    email: 'member@test.com',
    password: 'Test@123',
    firstName: 'Team',
    lastName: 'Member',
    role: 'member',
    isActive: true
  },
  {
    email: 'viewer@test.com',
    password: 'Test@123',
    firstName: 'Read',
    lastName: 'Only',
    role: 'viewer',
    isActive: true
  }
];

async function createTestUsers() {
  try {
    // Test database connection
    await sequelize.authenticate();
    console.log('✅ Database connection established.\n');

    const results = {
      created: [],
      updated: [],
      skipped: []
    };

    for (const userData of testUsers) {
      try {
        // Check if user already exists
        const existingUser = await User.findOne({
          where: { email: userData.email }
        });

        if (existingUser) {
          // Update via raw SQL — bypasses ALL Sequelize hooks/setters for reliability
          const hashedPassword = await bcrypt.hash(userData.password, 10);
          await sequelize.query(
            `UPDATE users SET password = :hash, first_name = :fn, last_name = :ln, role = :role, is_active = :active WHERE email = :email`,
            { replacements: { hash: hashedPassword, fn: userData.firstName, ln: userData.lastName, role: userData.role, active: userData.isActive, email: userData.email } }
          );
          results.updated.push({
            email: userData.email,
            role: userData.role,
            name: `${userData.firstName} ${userData.lastName}`
          });
          console.log(`✅ Updated: ${userData.email} (${userData.role})`);
        } else {
          // Create new user — hash password directly (bypasses model hooks for reliability)
          const hashedPassword = await bcrypt.hash(userData.password, 10);
          const user = await User.create({ ...userData, password: hashedPassword }, { hooks: false });
          results.created.push({
            email: userData.email,
            role: userData.role,
            name: `${userData.firstName} ${userData.lastName}`
          });
          console.log(`✅ Created: ${userData.email} (${userData.role})`);
        }
      } catch (error) {
        console.error(`❌ Error processing ${userData.email}:`, error.message);
        results.skipped.push({
          email: userData.email,
          error: error.message
        });
      }
    }

    // Print summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 SUMMARY');
    console.log('='.repeat(60));
    console.log(`✅ Created: ${results.created.length} users`);
    console.log(`🔄 Updated: ${results.updated.length} users`);
    console.log(`❌ Skipped: ${results.skipped.length} users`);
    console.log('\n📋 Test Users Credentials:');
    console.log('='.repeat(60));
    
    testUsers.forEach(user => {
      console.log(`\n${user.role.toUpperCase()}:`);
      console.log(`   Email: ${user.email}`);
      console.log(`   Password: ${user.password}`);
      console.log(`   Name: ${user.firstName} ${user.lastName}`);
    });

    console.log('\n' + '='.repeat(60));
    console.log('⚠️  IMPORTANT: These are test users. Change passwords in production!');
    console.log('='.repeat(60));

  } catch (error) {
    console.error('❌ Error creating test users:', error.message);
    if (error.original) {
      console.error('   Database error:', error.original.message);
    }
    console.error(error.stack);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

// Run the script
createTestUsers();

