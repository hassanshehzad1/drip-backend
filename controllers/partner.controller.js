/**
 * @file partner.controller.js
 * @description Fashion Partner authentication and profile controller
 * @module PartnerController
 */

const jwt = require('jsonwebtoken');
const FashionPartner = require('../models/FashionPartner');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');
const sendResponse = require('../utils/sendResponse');
const logger = require('../config/logger');

/**
 * @description Password strength regex
 */
const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/;

/**
 * @description Helper to create and send tokens to client
 * @param {FashionPartner} partner - Partner document
 * @param {number} statusCode - HTTP status code
 * @param {Object} res - Express response object
 * @param {string} message - Response message
 */
const createSendTokens = async (partner, statusCode, res, message) => {
  // Generate tokens
  const accessToken = partner.generateAccessToken();
  const refreshToken = partner.generateRefreshToken();

  // Save refresh token to DB
  partner.refreshToken = refreshToken;
  await partner.save({ validateBeforeSave: false });

  // Set refresh token as httpOnly cookie
  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
  };

  res.cookie('partnerRefreshToken', refreshToken, cookieOptions);

  // Prepare partner data (exclude sensitive fields)
  const partnerData = {
    id: partner._id,
    brandName: partner.brandName,
    email: partner.email,
    logo: partner.logo,
    coverImage: partner.coverImage,
    description: partner.description,
    category: partner.category,
    socialLinks: partner.socialLinks,
    isApproved: partner.isApproved,
    followersCount: partner.followersCount
  };

  // Send response
  sendResponse(res, statusCode, message, { partner: partnerData, accessToken });
};

/**
 * @description Register a new fashion partner
 * @route POST /api/partner/auth/register
 */
exports.register = catchAsync(async (req, res, next) => {
  const { brandName, email, password, category } = req.body;

  // Validations
  if (!brandName || brandName.trim().length < 2) {
    return next(new AppError('Brand name is required and must be at least 2 characters', 400));
  }

  if (!email) {
    return next(new AppError('Email is required', 400));
  }

  const emailRegex = /^[\w.-]+@[\w.-]+\.[a-zA-Z]{2,}$/;
  if (!emailRegex.test(email)) {
    return next(new AppError('Please provide a valid email address', 400));
  }

  if (!password || password.length < 8) {
    return next(new AppError('Password must be at least 8 characters', 400));
  }

  if (!passwordRegex.test(password)) {
    return next(new AppError('Password must contain at least 1 uppercase, 1 lowercase, 1 number, and 1 special character', 400));
  }

  const validCategories = ['casual', 'formal', 'streetwear', 'sportswear', 'ethnic', 'luxury', 'accessories', 'footwear', 'kids', 'other'];
  if (!category || !validCategories.includes(category)) {
    return next(new AppError('Please provide a valid category', 400));
  }

  // Check duplicate email
  const existingEmail = await FashionPartner.findOne({ email });
  if (existingEmail) {
    return next(new AppError('Email already registered', 409));
  }

  // Check duplicate brand name
  const existingBrand = await FashionPartner.findOne({ brandName: brandName.trim() });
  if (existingBrand) {
    return next(new AppError('Brand name already taken', 409));
  }

  // Create partner (isApproved defaults to false)
  const partner = await FashionPartner.create({
    brandName,
    email,
    password,
    category
  });

  // Log registration
  logger.info(`New partner registered: ${brandName} (${email})`);

  // Do NOT send tokens - partner must wait for approval
  sendResponse(res, 201, 'Registration successful. Your account is pending admin approval. You will be notified once approved.', {
    partner: {
      id: partner._id,
      brandName: partner.brandName,
      email: partner.email,
      category: partner.category,
      isApproved: partner.isApproved
    }
  });
});

/**
 * @description Login fashion partner
 * @route POST /api/partner/auth/login
 */
exports.login = catchAsync(async (req, res, next) => {
  const { email, password } = req.body;

  // Validations
  if (!email || !password) {
    return next(new AppError('Email and password are required', 400));
  }

  // Find partner with password
  const partner = await FashionPartner.findByEmail(email);
  if (!partner) {
    return next(new AppError('Invalid email or password', 401));
  }

  // Check if account is active
  if (!partner.isActive) {
    return next(new AppError('Your account has been deactivated. Contact support at support@drip.com', 403));
  }

  // Check if approved
  if (!partner.isApproved) {
    return next(new AppError('Your account is pending admin approval. Please wait for approval before logging in.', 403));
  }

  // Compare password
  const isPasswordCorrect = await partner.comparePassword(password);
  if (!isPasswordCorrect) {
    return next(new AppError('Invalid email or password', 401));
  }

  // Update last login
  partner.lastLogin = new Date();

  // Send tokens
  await createSendTokens(partner, 200, res, 'Logged in successfully');
});

/**
 * @description Refresh access token
 * @route POST /api/partner/auth/refresh
 */
exports.refreshToken = catchAsync(async (req, res, next) => {
  // Get token from cookie or body
  const token = req.cookies.partnerRefreshToken || req.body.refreshToken;

  if (!token) {
    return next(new AppError('No refresh token provided', 401));
  }

  // Verify token
  const decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET);

  // Check role
  if (decoded.role !== 'partner') {
    return next(new AppError('Invalid token type', 401));
  }

  // Find partner and select refreshToken
  const partner = await FashionPartner.findById(decoded.id).select('+refreshToken');
  if (!partner || partner.refreshToken !== token) {
    return next(new AppError('Invalid refresh token', 401));
  }

  // Generate new access token only
  const accessToken = partner.generateAccessToken();

  sendResponse(res, 200, 'Token refreshed successfully', { accessToken });
});

/**
 * @description Logout partner
 * @route POST /api/partner/auth/logout
 */
exports.logout = catchAsync(async (req, res, next) => {
  // Find partner and clear refresh token
  const partner = await FashionPartner.findById(req.partner.id);
  if (partner) {
    partner.refreshToken = undefined;
    await partner.save({ validateBeforeSave: false });
  }

  // Clear cookie
  res.clearCookie('partnerRefreshToken');

  sendResponse(res, 200, 'Logged out successfully');
});

/**
 * @description Get partner profile
 * @route GET /api/partner/me
 */
exports.getMe = catchAsync(async (req, res, next) => {
  const partner = await FashionPartner.findById(req.partner.id);

  if (!partner) {
    return next(new AppError('Partner not found', 404));
  }

  sendResponse(res, 200, 'Partner profile retrieved', { partner });
});

/**
 * @description Update partner profile
 * @route PATCH /api/partner/update-profile
 */
exports.updateProfile = catchAsync(async (req, res, next) => {
  // Allowed fields
  const allowedFields = ['brandName', 'description', 'category', 'socialLinks', 'logo', 'coverImage'];

  // Filter request body
  const filteredBody = {};
  Object.keys(req.body).forEach(key => {
    if (allowedFields.includes(key)) {
      filteredBody[key] = req.body[key];
    }
  });

  // If brandName is being changed, check uniqueness
  if (filteredBody.brandName) {
    const existingPartner = await FashionPartner.findOne({
      brandName: filteredBody.brandName.trim(),
      _id: { $ne: req.partner.id }
    });
    if (existingPartner) {
      return next(new AppError('Brand name already taken by another partner', 409));
    }
  }

  // Update partner
  const partner = await FashionPartner.findByIdAndUpdate(
    req.partner.id,
    filteredBody,
    { new: true, runValidators: true }
  );

  if (!partner) {
    return next(new AppError('Partner not found', 404));
  }

  sendResponse(res, 200, 'Profile updated successfully', { partner });
});

/**
 * @description Change password
 * @route PATCH /api/partner/change-password
 */
exports.changePassword = catchAsync(async (req, res, next) => {
  const { currentPassword, newPassword } = req.body;

  // Validations
  if (!currentPassword || !newPassword) {
    return next(new AppError('Current password and new password are required', 400));
  }

  if (newPassword.length < 8) {
    return next(new AppError('New password must be at least 8 characters', 400));
  }

  if (!passwordRegex.test(newPassword)) {
    return next(new AppError('New password must contain uppercase, lowercase, number and special character', 400));
  }

  if (currentPassword === newPassword) {
    return next(new AppError('New password cannot be the same as current password', 400));
  }

  // Find partner with password
  const partner = await FashionPartner.findById(req.partner.id).select('+password');
  if (!partner) {
    return next(new AppError('Partner not found', 404));
  }

  // Verify current password
  const isCurrentCorrect = await partner.comparePassword(currentPassword);
  if (!isCurrentCorrect) {
    return next(new AppError('Current password is incorrect', 401));
  }

  // Set new password
  partner.password = newPassword;
  partner.refreshToken = undefined;

  await partner.save();

  // Clear cookie
  res.clearCookie('partnerRefreshToken');

  sendResponse(res, 200, 'Password changed successfully. Please log in again.');
});

/**
 * @description Get partner public profile
 * @route GET /api/partner/:partnerId
 */
exports.getPartnerPublicProfile = catchAsync(async (req, res, next) => {
  const { partnerId } = req.params;

  const partner = await FashionPartner.findById(partnerId);

  if (!partner) {
    return next(new AppError('Partner not found', 404));
  }

  // Only return approved partners publicly
  if (!partner.isApproved) {
    return next(new AppError('Partner not found', 404));
  }

  // Return only public fields
  const publicProfile = {
    id: partner._id,
    brandName: partner.brandName,
    logo: partner.logo,
    coverImage: partner.coverImage,
    description: partner.description,
    category: partner.category,
    socialLinks: partner.socialLinks,
    followersCount: partner.followersCount,
    totalSales: partner.totalSales,
    createdAt: partner.createdAt
  };

  sendResponse(res, 200, 'Partner profile retrieved', { partner: publicProfile });
});
