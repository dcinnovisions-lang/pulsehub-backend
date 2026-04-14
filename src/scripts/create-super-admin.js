require('dotenv').config();
const { sequelize } = require('../config/database');
const models = require('../models');
const User = models.User;

async function createSuperAdmin() {
  try {
    // Test database connection
    await sequelize.authenticate();
    console.log('✅ Database connection established.');

    // Check if super admin already exists
    const existingSuperAdmin = await User.findOne({
      where: { role: 'super_admin' }
    });

    if (existingSuperAdmin) {
      console.log('⚠️  Super admin already exists:');
      console.log(`   Email: ${existingSuperAdmin.email}`);
      console.log(`   Name: ${existingSuperAdmin.firstName} ${existingSuperAdmin.lastName}`);
      console.log(`   Role: ${existingSuperAdmin.role}`);
      return;
    }

    // Create super admin user
    const superAdminData = {
      email: 'superadmin@test.com',
      password: 'Test@123', // Will be hashed by model hook
      firstName: 'Super',
      lastName: 'Admin',
      role: 'super_admin',
      isActive: true
    };

    // Check if email already exists
    const existingUser = await User.findOne({
      where: { email: superAdminData.email }
    });

    if (existingUser) {
      // Update existing user to super admin
      await existingUser.update({
        role: 'super_admin',
        firstName: superAdminData.firstName,
        lastName: superAdminData.lastName
      });
      console.log('✅ Updated existing user to super admin:');
      console.log(`   Email: ${existingUser.email}`);
      console.log(`   Name: ${superAdminData.firstName} ${superAdminData.lastName}`);
      console.log(`   Role: super_admin`);
    } else {
      // Create new super admin
      const superAdmin = await User.create(superAdminData);
      console.log('✅ Super admin created successfully!');
      console.log('\n📋 Credentials:');
      console.log('   Email: superadmin@projva.com');
      console.log('   Password: SuperAdmin@2025');
      console.log('   Role: super_admin');
      console.log('\n⚠️  IMPORTANT: Please change the password after first login!');
    }

  } catch (error) {
    console.error('❌ Error creating super admin:', error.message);
    if (error.original) {
      console.error('   Database error:', error.original.message);
    }
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

// Run the script
createSuperAdmin();

