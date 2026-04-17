/**
 * @file authAdmin.middleware.js
 * @description Admin authentication middleware.
 * Verifies admin JWT and checks role/permissions.
 * @module AuthAdminMiddleware
 */

const jwt = require('jsonwebtoken');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');
const Admin = require('../models/Admin');
const logger = require('../config/logger');

/**
 * @description Verify admin JWT token
 * Extracts token from Authorization header, validates it,
 * and attaches admin object to request
 * @type {import('express').RequestHandler}
 */
exports.protect = catchAsync(async (req, res, next) => {
  // Get token from Authorization header
  let token;
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return next(new AppError('Access denied. Please log in.', 401));
  }

  // Verify token
  const decoded = jwt.verify(token, process.env.JWT_SECRET);

  // Check if this is an admin token
  if (decoded.role !== 'admin') {
    return next(new AppError('Access denied. Admin account required.', 403));
  }

  // Find admin by id
  const admin = await Admin.findById(decoded.id);

  if (!admin) {
    return next(new AppError('Admin not found. Please log in again.', 401));
  }

  // Check if admin is active
  if (!admin.isActive) {
    return next(new AppError('Account deactivated. Contact superadmin.', 403));
  }

  // Attach admin to request
  req.admin = admin;

  // Update last login (fire and forget)
  admin.lastLogin = new Date();
  admin.save({ validateBeforeSave: false }).catch(() => {});

  next();
});

/**
 * @description Check admin has required permissions
 * Returns middleware that verifies the admin has ALL specified permissions
 * @param {...String} permissions - Required permission strings
 * @returns {import('express').RequestHandler}
 */
exports.requirePermission = (...permissions) => {
  return (req, res, next) => {
    if (!req.admin) {
      return next(new AppError('Access denied. Admin authentication required.', 403));
    }

    // Superadmin has all permissions
    if (req.admin.role === 'superadmin') {
      return next();
    }

    // Check if admin has all required permissions
    const missingPermissions = permissions.filter(
      perm => !req.admin.permissions.includes(perm)
    );

    if (missingPermissions.length > 0) {
      return next(
        new AppError(
          `Insufficient permissions: ${missingPermissions.join(', ')}`,
          403
        )
      );
    }

    next();
  };
};

/**
 * @description Only superadmin can access this route
 * Middleware that restricts access to superadmin role only
 * @type {import('express').RequestHandler}
 */
exports.requireSuperAdmin = (req, res, next) => {
  if (!req.admin) {
    return next(new AppError('Access denied. Admin authentication required.', 403));
  }

  if (req.admin.role !== 'superadmin') {
    return next(new AppError('This action requires superadmin role.', 403));
  }

  next();
};
