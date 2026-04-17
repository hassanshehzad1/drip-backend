/**
 * @file authUser.middleware.js
 * @description Authentication and authorization middleware
 * @module AuthUserMiddleware
 */

const jwt = require('jsonwebtoken');
const User = require('../models/User');
const AppError = require('../utils/AppError');
const catchAsync = require('../utils/catchAsync');

/**
 * @description Middleware to protect routes - verifies JWT token and attaches user
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
exports.protect = catchAsync(async (req, res, next) => {
  let token;

  // Get token from Authorization header (Bearer token)
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }
  // Or from cookies
  else if (req.cookies && req.cookies.accessToken) {
    token = req.cookies.accessToken;
  }

  // Check if token exists
  if (!token) {
    return next(new AppError('You are not logged in. Please log in to get access.', 401));
  }

  // Verify token
  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    if (err.name === 'JsonWebTokenError') {
      return next(new AppError('Invalid token. Please log in again.', 401));
    }
    if (err.name === 'TokenExpiredError') {
      return next(new AppError('Your session has expired. Please log in again.', 401));
    }
    throw err;
  }

  // Find user
  const user = await User.findById(decoded.id);
  if (!user) {
    return next(new AppError('The user belonging to this token no longer exists.', 401));
  }

  // Check if account is active
  if (!user.isActive) {
    return next(new AppError('Your account has been deactivated.', 403));
  }

  // Attach user to request
  req.user = user;

  next();
});

/**
 * @description Middleware to restrict access to specific roles
 * @param {...string} roles - Allowed roles
 * @returns {Function} Express middleware
 */
exports.restrictTo = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return next(new AppError('You do not have permission to perform this action', 403));
    }
    next();
  };
};
