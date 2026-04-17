/**
 * @file upload.controller.js
 * @description Handles file upload requests, validates files, uploads to ImageKit CDN
 * @module UploadController
 */

const { uploadToImageKit, deleteFromImageKit } = require('../services/imagekit.service');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');
const sendResponse = require('../utils/sendResponse');
const logger = require('../config/logger');
const User = require('../models/User');

/**
 * @description Upload single image to ImageKit
 * Partner protected — only fashion partners can upload
 * Used for: outfit images, logos, cover images
 * @route POST /api/upload/image
 */
exports.uploadImage = catchAsync(async (req, res, next) => {
  // Check file exists
  if (!req.file) {
    return next(new AppError('Please select an image to upload', 400));
  }

  // Determine folder based on query type
  let folder = '/drip/misc';
  switch (req.query.type) {
    case 'logo':
      folder = '/drip/logos';
      break;
    case 'cover':
      folder = '/drip/covers';
      break;
    case 'outfit':
      folder = '/drip/outfits/images';
      break;
    default:
      folder = '/drip/misc';
  }

  // Upload to ImageKit
  const result = await uploadToImageKit(
    req.file.buffer,
    req.file.originalname,
    folder,
    'image'
  );

  // Log upload
  logger.info(`Image uploaded by partner ${req.partner.id}: ${req.file.originalname} to ${folder}`);

  // Send response
  sendResponse(res, 200, 'Image uploaded successfully', {
    url: result.url,
    fileId: result.fileId,
    thumbnailUrl: result.thumbnailUrl,
    originalName: req.file.originalname,
    size: req.file.size,
    mimeType: req.file.mimetype
  });
});

/**
 * @description Upload single video to ImageKit
 * Partner protected — only fashion partners can upload
 * Used for: outfit reels
 * @route POST /api/upload/video
 */
exports.uploadVideo = catchAsync(async (req, res, next) => {
  // Check file exists
  if (!req.file) {
    return next(new AppError('Please select a video to upload', 400));
  }

  const folder = '/drip/outfits/videos';

  // Upload to ImageKit
  const result = await uploadToImageKit(
    req.file.buffer,
    req.file.originalname,
    folder,
    'video'
  );

  // Log upload
  logger.info(`Video uploaded by partner ${req.partner.id}: ${req.file.originalname} (${(req.file.size / (1024 * 1024)).toFixed(2)} MB)`);

  // Send response
  sendResponse(res, 200, 'Video uploaded successfully', {
    url: result.url,
    fileId: result.fileId,
    thumbnailUrl: result.thumbnailUrl,
    originalName: req.file.originalname,
    size: req.file.size,
    mimeType: req.file.mimetype,
    sizeInMB: `${(req.file.size / (1024 * 1024)).toFixed(2)} MB`
  });
});

/**
 * @description Upload user avatar image
 * User protected — only logged-in users can upload
 * @route POST /api/upload/avatar
 */
exports.uploadAvatar = catchAsync(async (req, res, next) => {
  // Check file exists
  if (!req.file) {
    return next(new AppError('Please select an image to upload', 400));
  }

  const folder = '/drip/avatars';

  // Upload to ImageKit
  const result = await uploadToImageKit(
    req.file.buffer,
    req.file.originalname,
    folder,
    'image'
  );

  // Update user's avatar in DB
  const user = await User.findByIdAndUpdate(
    req.user.id,
    {
      avatar: {
        url: result.url,
        fileId: result.fileId
      }
    },
    { new: true }
  );

  // Log upload
  logger.info(`Avatar uploaded by user ${req.user.id}: ${req.file.originalname}`);

  // Send response
  sendResponse(res, 200, 'Avatar uploaded successfully', {
    avatar: user.avatar,
    url: result.url,
    fileId: result.fileId,
    thumbnailUrl: result.thumbnailUrl,
    originalName: req.file.originalname
  });
});

/**
 * @description Delete a file from ImageKit by fileId
 * Protected — user or partner can delete own files
 * @route DELETE /api/upload/:fileId
 */
exports.deleteFile = catchAsync(async (req, res, next) => {
  const { fileId } = req.params;

  if (!fileId) {
    return next(new AppError('File ID is required', 400));
  }
  console.log(fileId)

  // Call delete service
  const deleted = await deleteFromImageKit(fileId);
  console.log(deleted);
  if (!deleted) {
    return next(new AppError('File deletion failed. File not found or already deleted.', 404));
  }

  // Send response
  sendResponse(res, 200, 'File deleted successfully');
});
