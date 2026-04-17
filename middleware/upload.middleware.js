/**
 * @file upload.middleware.js
 * @description Multer configuration for handling file uploads — images and videos
 * @module UploadMiddleware
 */

const multer = require('multer');
const path = require('path');
const AppError = require('../utils/AppError');

/**
 * @description Allowed image MIME types
 */
const ALLOWED_IMAGE_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif'
];

/**
 * @description Allowed video MIME types
 */
const ALLOWED_VIDEO_TYPES = [
  'video/mp4',
  'video/mpeg',
  'video/quicktime',
  'video/x-msvideo',
  'video/webm'
];

/**
 * @description Memory storage configuration
 */
const memoryStorage = multer.memoryStorage();

/**
 * @description File filter for images only
 * @param {Object} req - Express request object
 * @param {Object} file - Multer file object
 * @param {Function} cb - Multer callback
 */
const imageOnlyFilter = (req, file, cb) => {
  if (ALLOWED_IMAGE_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new AppError(
      'Invalid file type. Only images (JPEG, PNG, WebP, GIF) are allowed.',
      400
    ), false);
  }
};

/**
 * @description File filter for videos only
 * @param {Object} req - Express request object
 * @param {Object} file - Multer file object
 * @param {Function} cb - Multer callback
 */
const videoOnlyFilter = (req, file, cb) => {
  if (ALLOWED_VIDEO_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new AppError(
      'Invalid file type. Only videos (MP4, MPEG, MOV, AVI, WebM) are allowed.',
      400
    ), false);
  }
};

/**
 * @description File filter for any allowed file type
 * @param {Object} req - Express request object
 * @param {Object} file - Multer file object
 * @param {Function} cb - Multer callback
 */
const fileFilter = (req, file, cb) => {
  if (ALLOWED_IMAGE_TYPES.includes(file.mimetype) || ALLOWED_VIDEO_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new AppError(
      'Invalid file type. Only images (JPEG, PNG, WebP, GIF) and videos (MP4, MPEG, MOV, AVI, WebM) are allowed.',
      400
    ), false);
  }
};

/**
 * @description Multer instance for image uploads
 */
const uploadImage = multer({
  storage: memoryStorage,
  fileFilter: imageOnlyFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
    files: 1
  }
});

/**
 * @description Multer instance for video uploads
 */
const uploadVideo = multer({
  storage: memoryStorage,
  fileFilter: videoOnlyFilter,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB
    files: 1
  }
});

/**
 * @description Multer instance for any file uploads
 */
const uploadAny = multer({
  storage: memoryStorage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 100 * 1024 * 1024,
    files: 5
  }
});

/**
 * @description Wraps multer upload to handle errors properly
 * Converts multer errors to AppError format
 * @param {Function} uploadFn - Multer middleware function
 * @returns {Function} Express middleware
 */
const handleUploadError = (uploadFn) => {
  return (req, res, next) => {
    uploadFn(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return next(new AppError('File too large. Max size: images 5MB, videos 100MB', 400));
        }
        if (err.code === 'LIMIT_FILE_COUNT') {
          return next(new AppError('Too many files uploaded.', 400));
        }
        return next(new AppError(err.message, 400));
      }
      if (err) {
        return next(err);
      }
      next();
    });
  };
};

/**
 * @description Pre-configured middleware for single image upload
 */
const uploadSingleImage = handleUploadError(uploadImage.single('file'));

/**
 * @description Pre-configured middleware for single video upload
 */
const uploadSingleVideo = handleUploadError(uploadVideo.single('file'));

/**
 * @description Pre-configured middleware for multiple images upload
 */
const uploadMultipleImages = handleUploadError(uploadAny.array('files', 5));

module.exports = {
  uploadImage,
  uploadVideo,
  uploadAny,
  handleUploadError,
  uploadSingleImage,
  uploadSingleVideo,
  uploadMultipleImages
};
