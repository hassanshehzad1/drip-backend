/**
 * @file upload.routes.js
 * @description Upload routes — image, video, avatar
 * @module UploadRoutes
 */

const express = require('express');
const jwt = require('jsonwebtoken');

/**
 * Import controllers
 */
const {
  uploadImage,
  uploadVideo,
  uploadAvatar,
  deleteFile
} = require('../controllers/upload.controller');

/**
 * Import auth middlewares
 */
const { protect: protectUser } = require('../middleware/authUser.middleware');
const { protect: protectPartner } = require('../middleware/authPartner.middleware');

/**
 * Import upload middlewares
 */
const {
  uploadSingleImage,
  uploadSingleVideo
} = require('../middleware/upload.middleware');

/**
 * Import models
 */
const User = require('../models/User');
const FashionPartner = require('../models/FashionPartner');

/**
 * Import error handling
 */
const AppError = require('../utils/AppError');

/**
 * Create router
 */
const router = express.Router();

/**
 * @description Middleware to allow either user or partner access
 * Tries user token first, then partner token
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const allowUserOrPartner = async (req, res, next) => {
  let token;

  // Get token from Authorization header
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }
  // Or from cookies
  else if (req.cookies && (req.cookies.accessToken || req.cookies.partnerAccessToken)) {
    token = req.cookies.accessToken || req.cookies.partnerAccessToken;
  }

  if (!token) {
    return next(new AppError('Authentication required', 401));
  }

  // Try to decode token first to check role
  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    return next(new AppError('Invalid token. Please log in again.', 401));
  }

  // If role is partner, find partner
  if (decoded.role === 'partner') {
    const partner = await FashionPartner.findById(decoded.id);
    if (!partner) {
      return next(new AppError('Partner account not found', 401));
    }
    if (!partner.isActive) {
      return next(new AppError('Your account has been deactivated', 403));
    }
    if (!partner.isApproved) {
      return next(new AppError('Your account is pending approval', 403));
    }
    req.partner = partner;
    return next();
  }

  // Otherwise assume it's a user
  const user = await User.findById(decoded.id);
  if (!user) {
    return next(new AppError('User not found', 401));
  }
  if (!user.isActive) {
    return next(new AppError('Your account has been deactivated', 403));
  }
  req.user = user;
  next();
};

/**
 * @route POST /api/upload/image
 * @description Upload image (partners only)
 * @access Private (Partner)
 */
router.post('/image', protectPartner, uploadSingleImage, uploadImage);

/**
 * @route POST /api/upload/video
 * @description Upload video (partners only)
 * @access Private (Partner)
 */
router.post('/video', protectPartner, uploadSingleVideo, uploadVideo);

/**
 * @route POST /api/upload/avatar
 * @description Upload avatar (users only)
 * @access Private (User)
 */
router.post('/avatar', protectUser, uploadSingleImage, uploadAvatar);

/**
 * @route DELETE /api/upload/:fileId
 * @description Delete file from ImageKit
 * @access Private (User or Partner)
 */
router.delete('/:fileId', allowUserOrPartner, deleteFile);

module.exports = router;
