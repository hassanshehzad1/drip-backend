/**
 * @file User.js
 * @description Mongoose schema for User model with authentication methods
 * @module UserModel
 */

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

/**
 * @description Email regex pattern for validation
 */
const emailRegex = /^[\w.-]+@[\w.-]+\.[a-zA-Z]{2,}$/;

/**
 * User Schema
 */
const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true,
    minLength: [2, 'Name must be at least 2 characters'],
    maxLength: [50, 'Name cannot exceed 50 characters']
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    validate: {
      validator: function(v) {
        return emailRegex.test(v);
      },
      message: 'Please provide a valid email address'
    }
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minLength: [8, 'Password must be at least 8 characters'],
    select: false // Never returned in queries by default
  },
  avatar: {
    url: {
      type: String,
      default: ''
    },
    fileId: {
      type: String,
      default: ''
    }
  },
  role: {
    type: String,
    enum: {
      values: ['user', 'admin'],
      message: 'Role must be either user or admin'
    },
    default: 'user'
  },
  stylePreferences: {
    type: [String],
    default: []
  },
  categoryScores: {
    type: Map,
    of: Number,
    default: new Map()
  },
  isActive: {
    type: Boolean,
    default: true
  },
  refreshToken: {
    type: String,
    select: false
  },
  lastLogin: {
    type: Date
  }
}, {
  timestamps: true
});

/**
 * @description Pre-save hook to hash password before saving
 * Only hashes if password is modified to avoid re-hashing on other updates
 */
userSchema.pre('save', async function(next) {
  // Check if password is modified to avoid unnecessary re-hashing
  if (!this.isModified('password')) return next();

  // Hash password with salt rounds of 12
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

/**
 * @description Compare candidate password with stored hash
 * @param {string} candidatePassword - Password to compare
 * @returns {Promise<boolean>} True if passwords match
 */
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

/**
 * @description Generate JWT access token
 * @returns {string} JWT access token
 */
userSchema.methods.generateAccessToken = function() {
  return jwt.sign(
    { id: this._id, role: this.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '15m' }
  );
};

/**
 * @description Generate JWT refresh token
 * @returns {string} JWT refresh token
 */
userSchema.methods.generateRefreshToken = function() {
  return jwt.sign(
    { id: this._id },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d' }
  );
};

/**
 * @description Update a specific category score
 * Used by AI service to track preferences
 * @param {string} category - Category to update
 * @param {number} weight - Score increment value
 * @returns {Promise<void>}
 */
userSchema.methods.updateCategoryScore = async function(category, weight) {
  const key = `categoryScores.${category}`;
  await this.constructor.findByIdAndUpdate(this._id, {
    $inc: { [key]: weight }
  });
};

/**
 * @description Find user by email and select password and refreshToken fields
 * @param {string} email - User email
 * @returns {Promise<User>} User document with password and refreshToken
 */
userSchema.statics.findByEmail = function(email) {
  return this.findOne({ email }).select('+password +refreshToken');
};

const User = mongoose.model('User', userSchema);

module.exports = User;
