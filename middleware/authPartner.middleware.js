/**
 * @file authPartner.middleware.js
 * @description Fashion Partner authentication and authorization middleware
 * @module AuthPartnerMiddleware
 */

const jwt = require('jsonwebtoken');
const FashionPartner = require('../models/FashionPartner');
const AppError = require('../utils/AppError');
const catchAsync = require('../utils/catchAsync');

/**
 * @description Middleware to protect partner routes - verifies JWT token
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
  else if (req.cookies && req.cookies.partnerAccessToken) {
    token = req.cookies.partnerAccessToken;
  }

  // Check if token exists
  if (!token) {
    return next(new AppError('You are not logged in.', 401));
  }

  // Verify token
  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    if (err.name === 'JsonWebTokenError') {
      return next(new AppError('Invalid token.', 401));
    }
    if (err.name === 'TokenExpiredError') {
      return next(new AppError('Your session has expired.', 401));
    }
    throw err;
  }

  // Check role is partner
  if (decoded.role !== 'partner') {
    return next(new AppError('Access denied. Partner account required.', 403));
  }

  // Find partner
  const partner = await FashionPartner.findById(decoded.id);
  if (!partner) {
    return next(new AppError('The account belonging to this token no longer exists.', 401));
  }

  // Check if account is active
  if (!partner.isActive) {
    return next(new AppError('Your account has been deactivated.', 403));
  }

  // Check if approved
  if (!partner.isApproved) {
    return next(new AppError('Your account is pending approval.', 403));
  }

  // Attach partner to request
  req.partner = partner;

  next();
});

/**
 * @description Middleware to restrict access to specific roles
 * @param {...string} roles - Allowed roles
 * @returns {Function} Express middleware
 */
exports.restrictTo = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.partner.role || 'partner')) {
      return next(new AppError('You do not have permission to perform this action', 403));
    }
    next();
  };
};
