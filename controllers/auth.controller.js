/**
 * @file auth.controller.js
 * @description Authentication controller functions
 * @module AuthController
 */

const jwt = require('jsonwebtoken');
const User = require('../models/User');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');
const sendResponse = require('../utils/sendResponse');
const logger = require('../config/logger');

/**
 * @description Password strength regex: min 8 chars, 1 uppercase, 1 lowercase, 1 number, 1 special char
 */
const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/;

/**
 * @description Helper to create and send tokens to client
 * @param {User} user - User document
 * @param {number} statusCode - HTTP status code
 * @param {Object} res - Express response object
 * @param {string} message - Response message
 */
const createSendTokens = async (user, statusCode, res, message) => {
  // Generate tokens
  const accessToken = user.generateAccessToken();
  const refreshToken = user.generateRefreshToken();

  // Save refresh token to DB
  user.refreshToken = refreshToken;
  await user.save({ validateBeforeSave: false });

  // Set refresh token as httpOnly cookie
  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days in milliseconds
  };

  res.cookie('refreshToken', refreshToken, cookieOptions);

  // Prepare user data (exclude sensitive fields)
  const userData = {
    id: user._id,
    name: user.name,
    email: user.email,
    avatar: user.avatar,
    role: user.role,
    stylePreferences: user.stylePreferences
  };

  // Send response
  sendResponse(res, statusCode, message, { user: userData, accessToken });
};

/**
 * @description Register a new user
 * @route POST /api/auth/register
 */
exports.register = catchAsync(async (req, res, next) => {
  const { name, email, password } = req.body;

  // Manual validations
  if (!name || name.trim().length < 2) {
    return next(new AppError('Name is required and must be at least 2 characters', 400));
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

  // Check if email already exists
  const existingUser = await User.findOne({ email });
  if (existingUser) {
    return next(new AppError('Email already registered', 409));
  }

  // Create user
  const user = await User.create({ name, email, password });

  // Log registration
  logger.info(`New user registered: ${email}`);

  // Send tokens
  await createSendTokens(user, 201, res, 'User registered successfully');
});

/**
 * @description Login user
 * @route POST /api/auth/login
 */
exports.login = catchAsync(async (req, res, next) => {
  const { email, password } = req.body;

  // Validations
  if (!email || !password) {
    return next(new AppError('Email and password are required', 400));
  }

  // Find user with password
  const user = await User.findByEmail(email);
  if (!user) {
    return next(new AppError('Invalid email or password', 401));
  }

  // Check if account is active
  if (!user.isActive) {
    return next(new AppError('Your account has been deactivated', 403));
  }

  // Compare password
  const isPasswordCorrect = await user.comparePassword(password);
  if (!isPasswordCorrect) {
    return next(new AppError('Invalid email or password', 401));
  }

  // Update last login
  user.lastLogin = new Date();

  // Send tokens
  await createSendTokens(user, 200, res, 'Logged in successfully');
});

/**
 * @description Refresh access token using refresh token
 * @route POST /api/auth/refresh
 */
exports.refreshToken = catchAsync(async (req, res, next) => {
  // Get refresh token from cookie or body
  const token = req.cookies.refreshToken || req.body.refreshToken;

  if (!token) {
    return next(new AppError('No refresh token provided', 401));
  }

  // Verify token
  const decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET);

  // Find user and select refreshToken
  const user = await User.findById(decoded.id).select('+refreshToken');
  if (!user || user.refreshToken !== token) {
    return next(new AppError('Invalid refresh token', 401));
  }

  // Generate new access token only
  const accessToken = user.generateAccessToken();

  sendResponse(res, 200, 'Token refreshed successfully', { accessToken });
});

/**
 * @description Logout user
 * @route POST /api/auth/logout
 */
exports.logout = catchAsync(async (req, res, next) => {
  // Find user and clear refresh token
  const user = await User.findById(req.user.id);
  if (user) {
    user.refreshToken = undefined;
    await user.save({ validateBeforeSave: false });
  }

  // Clear cookie
  res.clearCookie('refreshToken');

  sendResponse(res, 200, 'Logged out successfully');
});

/**
 * @description Get current user profile
 * @route GET /api/auth/me
 */
exports.getMe = catchAsync(async (req, res, next) => {
  const user = await User.findById(req.user.id);

  if (!user) {
    return next(new AppError('User not found', 404));
  }

  sendResponse(res, 200, 'User profile retrieved', { user });
});

/**
 * @description Update user profile
 * @route PATCH /api/auth/update-profile
 */
exports.updateProfile = catchAsync(async (req, res, next) => {
  // Allowed fields to update
  const allowedFields = ['name', 'avatar', 'stylePreferences'];

  // Check if trying to update password
  if (req.body.password) {
    return next(new AppError('Use /change-password route to update password', 400));
  }

  // Filter request body to only allowed fields
  const filteredBody = {};
  Object.keys(req.body).forEach(key => {
    if (allowedFields.includes(key)) {
      filteredBody[key] = req.body[key];
    }
  });

  // Update user
  const user = await User.findByIdAndUpdate(
    req.user.id,
    filteredBody,
    { new: true, runValidators: true }
  );

  if (!user) {
    return next(new AppError('User not found', 404));
  }

  sendResponse(res, 200, 'Profile updated successfully', { user });
});

/**
 * @description Change password
 * @route PATCH /api/auth/change-password
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

  // Find user with password
  const user = await User.findById(req.user.id).select('+password');
  if (!user) {
    return next(new AppError('User not found', 404));
  }

  // Verify current password
  const isCurrentCorrect = await user.comparePassword(currentPassword);
  if (!isCurrentCorrect) {
    return next(new AppError('Current password is incorrect', 401));
  }

  // Set new password (pre-save hook will hash it)
  user.password = newPassword;

  // Clear refresh token to force re-login on all devices
  user.refreshToken = undefined;

  await user.save();

  // Clear cookie
  res.clearCookie('refreshToken');

  sendResponse(res, 200, 'Password changed successfully. Please log in again.');
});
