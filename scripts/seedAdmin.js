/**
 * @file seedAdmin.js
 * @description Seeds the first superadmin account.
 * Run with: npm run seed:admin
 * Only run once — checks if admin already exists.
 * @module SeedAdmin
 */

const mongoose = require('mongoose');
const Admin = require('../models/Admin');

// Load environment variables
require('dotenv').config();

/**
 * @description Connect to MongoDB
 */
const connectDB = require('../config/db');

/**
 * @description Seed the first superadmin
 */
const seedAdmin = async () => {
  try {
    // Connect to database
    await connectDB();

    // Check if any admin already exists
    const existing = await Admin.findOne({});
    if (existing) {
      console.log('=================================');
      console.log('Admin already exists. Skipping seed.');
      console.log(`Existing admin: ${existing.email} (${existing.role})`);
      console.log('=================================');
      await mongoose.connection.close();
      process.exit(0);
    }

    // Validate environment variables
    if (!process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD) {
      console.error('Missing required environment variables:');
      console.error('  - ADMIN_EMAIL');
      console.error('  - ADMIN_PASSWORD');
      console.error('Add these to your .env file and try again.');
      process.exit(1);
    }

    // Create superadmin
    const admin = await Admin.create({
      name: 'Drip Admin',
      email: process.env.ADMIN_EMAIL,
      password: process.env.ADMIN_PASSWORD,
      role: 'superadmin',
      permissions: [
        'manage_users',
        'manage_partners',
        'manage_content',
        'manage_orders',
        'view_analytics',
        'manage_admins'
      ]
    });

    console.log('=================================');
    console.log('Superadmin created successfully!');
    console.log(`Email: ${admin.email}`);
    console.log(`Role: ${admin.role}`);
    console.log('=================================');

    // Disconnect and exit
    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error(`Seed failed: ${error.message}`);
    process.exit(1);
  }
};

// Run seed
seedAdmin();
