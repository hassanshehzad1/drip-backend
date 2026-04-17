/**
 * @file Admin.js
 * @description Admin model — platform administrators
 * who manage users, partners, content, and analytics.
 * Completely separate from User and FashionPartner.
 * @module Admin
 */

const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

/**
 * Permission types available for admins
 */
const PERMISSIONS = [
  'manage_users',
  'manage_partners',
  'manage_content',
  'manage_orders',
  'view_analytics',
  'manage_admins'
];

/**
 * Admin Schema
 */
const adminSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Admin name is required'],
    trim: true,
    minlength: [2, 'Name must be at least 2 characters'],
    maxlength: [50, 'Name cannot exceed 50 characters']
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Please enter a valid email']
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [8, 'Password must be at least 8 characters'],
    select: false
  },
  role: {
    type: String,
    enum: ['superadmin', 'moderator'],
    default: 'moderator'
  },
  permissions: [{
    type: String,
    enum: PERMISSIONS
  }],
  isActive: {
    type: Boolean,
    default: true
  },
  lastLogin: {
    type: Date,
    default: null
  },
  refreshToken: {
    type: String,
    select: false
  }
}, {
  timestamps: true
});

/**
 * Default permissions based on role
 */
const getDefaultPermissions = (role) => {
  if (role === 'superadmin') {
    return PERMISSIONS;
  }
  // Moderator default permissions
  return [
    'manage_users',
    'manage_partners',
    'manage_content',
    'view_analytics'
  ];
};

/**
 * Pre-save middleware — hash password before saving
 */
adminSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();

  this.password = await bcrypt.hash(this.password, 12);

  // Set default permissions if not set
  if (!this.permissions || this.permissions.length === 0) {
    this.permissions = getDefaultPermissions(this.role);
  }

  next();
});

/**
 * Instance method: Compare candidate password with stored hash
 * @param {String} candidatePassword - Password to verify
 * @returns {Promise<Boolean>} Whether passwords match
 */
adminSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

/**
 * Instance method: Generate JWT access token
 * @returns {String} JWT access token
 */
adminSchema.methods.generateAccessToken = function() {
  return jwt.sign(
    {
      id: this._id,
      role: 'admin',
      adminRole: this.role
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '15m' }
  );
};

/**
 * Instance method: Generate JWT refresh token
 * @returns {String} JWT refresh token
 */
adminSchema.methods.generateRefreshToken = function() {
  return jwt.sign(
    {
      id: this._id,
      role: 'admin'
    },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d' }
  );
};

const Admin = mongoose.model('Admin', adminSchema);

module.exports = Admin;
