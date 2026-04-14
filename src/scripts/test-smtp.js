const nodemailer = require('nodemailer');
const logger = require('../utils/logger');
require('dotenv').config();

async function testSMTP() {
  console.log('\n🔍 Testing SMTP Configuration...\n');

  // Check if SMTP is configured
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.log('❌ SMTP not configured in .env file');
    console.log('\nRequired variables:');
    console.log('  - SMTP_HOST');
    console.log('  - SMTP_USER');
    console.log('  - SMTP_PASS');
    console.log('\nOptional variables:');
    console.log('  - SMTP_PORT (default: 587)');
    console.log('  - SMTP_SECURE (default: false)');
    console.log('  - SMTP_FROM (default: SMTP_USER)');
    console.log('\nSee SMTP_SETUP_GUIDE.md for setup instructions\n');
    process.exit(1);
  }

  console.log('📧 SMTP Configuration:');
  console.log(`   Host: ${process.env.SMTP_HOST}`);
  console.log(`   Port: ${process.env.SMTP_PORT || 587}`);
  console.log(`   User: ${process.env.SMTP_USER}`);
  console.log(`   From: ${process.env.SMTP_FROM || process.env.SMTP_USER}`);
  console.log('');

  try {
    // Create transporter
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true' || process.env.SMTP_PORT === '465',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      },
      tls: {
        rejectUnauthorized: process.env.SMTP_TLS_REJECT_UNAUTHORIZED !== 'false'
      }
    });

    // Verify connection
    console.log('🔌 Verifying SMTP connection...');
    await transporter.verify();
    console.log('✅ SMTP connection verified successfully!\n');

    // Send test email
    const testEmail = process.env.TEST_EMAIL || process.env.SMTP_USER;
    console.log(`📨 Sending test email to ${testEmail}...`);

    const info = await transporter.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: testEmail,
      subject: 'Projva SMTP Test Email',
      html: `
        <h2>✅ SMTP Configuration Successful!</h2>
        <p>Your SMTP settings are working correctly.</p>
        <p>You can now send invitation emails from Projva.</p>
        <hr>
        <p style="color: #666; font-size: 12px;">
          This is a test email sent at ${new Date().toLocaleString()}
        </p>
      `,
      text: `
SMTP Configuration Successful!

Your SMTP settings are working correctly.
You can now send invitation emails from Projva.

This is a test email sent at ${new Date().toLocaleString()}
      `
    });

    console.log('✅ Test email sent successfully!');
    console.log(`   Message ID: ${info.messageId}`);
    console.log(`   Response: ${info.response}`);
    console.log('\n🎉 SMTP is configured correctly!\n');
    console.log('You can now send invitation emails from Projva.\n');

  } catch (error) {
    console.error('❌ SMTP test failed:\n');
    console.error(`   Error: ${error.message}`);
    
    if (error.code === 'EAUTH') {
      console.error('\n💡 Authentication failed. Check:');
      console.error('   - SMTP_USER is correct');
      console.error('   - SMTP_PASS is correct');
      console.error('   - For Gmail: Use App Password, not regular password');
    } else if (error.code === 'ECONNECTION' || error.code === 'ETIMEDOUT') {
      console.error('\n💡 Connection failed. Check:');
      console.error('   - SMTP_HOST is correct');
      console.error('   - SMTP_PORT is correct');
      console.error('   - Firewall/network allows SMTP connections');
    } else if (error.code === 'ECERT') {
      console.error('\n💡 Certificate error. Try:');
      console.error('   - Set SMTP_TLS_REJECT_UNAUTHORIZED=false (not recommended for production)');
    }
    
    console.error('\nSee SMTP_SETUP_GUIDE.md for troubleshooting tips\n');
    process.exit(1);
  }
}

// Run test
testSMTP().catch(console.error);

