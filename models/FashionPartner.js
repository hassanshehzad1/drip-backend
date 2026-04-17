/**
 * @file FashionPartner.js
 * @description Mongoose schema for Fashion Partner (brand/retailer) model
 * @module FashionPartnerModel
 */

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

/**
 * @description Email regex pattern for validation
 */
const emailRegex = /^[\w.-]+@[\w.-]+\.[a-zA-Z]{2,}$/;

/**
 * Category enum values for fashion partners
 */
const CATEGORIES = [
  'casual', 'formal', 'streetwear', 'sportswear',
  'ethnic', 'luxury', 'accessories', 'footwear', 'kids', 'other'
];

/**
 * Fashion Partner Schema
 */
const fashionPartnerSchema = new mongoose.Schema({
  brandName: {
    type: String,
    required: [true, 'Brand name is required'],
    trim: true,
    minLength: [2, 'Brand name must be at least 2 characters'],
    maxLength: [100, 'Brand name cannot exceed 100 characters'],
    unique: true
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
    select: false
  },
  logo: {
    url: {
      type: String,
      default: ''
    },
    fileId: {
      type: String,
      default: ''
    }
  },
  coverImage: {
    url: {
      type: String,
      default: ''
    },
    fileId: {
      type: String,
      default: ''
    }
  },
  description: {
    type: String,
    trim: true,
    maxLength: [500, 'Description cannot exceed 500 characters'],
    default: ''
  },
  category: {
    type: String,
    required: [true, 'Category is required'],
    enum: {
      values: CATEGORIES,
      message: `Category must be one of: ${CATEGORIES.join(', ')}`
    }
  },
  socialLinks: {
    instagram: {
      type: String,
      default: ''
    },
    facebook: {
      type: String,
      default: ''
    },
    website: {
      type: String,
      default: ''
    }
  },
  isApproved: {
    type: Boolean,
    default: false
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
  },
  followersCount: {
    type: Number,
    default: 0
  },
  totalSales: {
    type: Number,
    default: 0
  },
  totalRevenue: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

/**
 * @description Virtual field to identify account type Fake field
 */
fashionPartnerSchema.virtual('type').get(function() {
  return 'partner';
});

/**
 * @description Pre-save hook to hash password before saving
 * Only hashes if password is modified to avoid re-hashing on other updates
 */
fashionPartnerSchema.pre('save', async function(next) {
  // Check if password is modified to avoid unnecessary re-hashing
  if (!this.isModified('password')) return next();

  // Hash password with salt rounds of 12
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

/**
 * @description Compare candidate password with stored hash instance object method refer to particular object
 * @param {string} candidatePassword - Password to compare
 * @returns {Promise<boolean>} True if passwords match
 */
fashionPartnerSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

/**
 * @description Generate JWT access token
 * @returns {string} JWT access token
 */
fashionPartnerSchema.methods.generateAccessToken = function() {
  return jwt.sign(
    { id: this._id, role: 'partner', brandName: this.brandName },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '15m' }
  );
};

/**
 * @description Generate JWT refresh token
 * @returns {string} JWT refresh token
 */
fashionPartnerSchema.methods.generateRefreshToken = function() {
  return jwt.sign(
    { id: this._id, role: 'partner' },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d' }
  );
};

/**
 * @description Find partner by email and select password and refreshToken fields Complete class data
 * @param {string} email - Partner email
 * @returns {Promise<FashionPartner>} Partner document with password and refreshToken
 */
fashionPartnerSchema.statics.findByEmail = function(email) {
  return this.findOne({ email }).select('+password +refreshToken');
};

const FashionPartner = mongoose.model('FashionPartner', fashionPartnerSchema);

module.exports = FashionPartner;
