/**
 * @file outfit.controller.js
 * @description Outfit item CRUD + feed controller
 * Handles creation, retrieval, update, deletion of outfit reels
 * @module OutfitController
 */

const mongoose = require('mongoose');
const OutfitItem = require('../models/OutfitItem');
const FashionPartner = require('../models/FashionPartner');
const Like = require('../models/Like');
const Bookmark = require('../models/Bookmark');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');
const sendResponse = require('../utils/sendResponse');
const getPagination = require('../utils/pagination');
const { deleteFromImageKit } = require('../services/imagekit.service');
const { trackInteraction } = require('../services/ai.service');
const logger = require('../config/logger');

/**
 * @description Valid outfit categories
 */
const VALID_CATEGORIES = [
  'casual', 'formal', 'streetwear', 'sportswear',
  'ethnic', 'luxury', 'accessories', 'footwear', 'kids', 'other'
];

/**
 * @description Create a new outfit reel
 * @route POST /api/outfit
 * @access Private (Partner)
 */
exports.createOutfit = catchAsync(async (req, res, next) => {
  const { title, video, price, sizes, category } = req.body;

  // Manual validations
  if (!title || title.trim().length < 3) {
    return next(new AppError('Title is required and must be at least 3 characters', 400));
  }

  if (!video || !video.url) {
    return next(new AppError('Video URL is required', 400));
  }

  if (!video.fileId) {
    return next(new AppError('Video file ID is required', 400));
  }

  if (price === undefined || price === null) {
    return next(new AppError('Price is required', 400));
  }

  if (isNaN(price) || price < 0) {
    return next(new AppError('Price must be a number >= 0', 400));
  }

  if (!sizes || !Array.isArray(sizes) || sizes.length === 0) {
    return next(new AppError('At least one size is required', 400));
  }

  if (!category || !VALID_CATEGORIES.includes(category)) {
    return next(new AppError('Valid category is required', 400));
  }

  // Create outfit with partner ID
  const outfit = await OutfitItem.create({
    ...req.body,
    partner: req.partner._id
  });

  // Populate partner field
  const populatedOutfit = await OutfitItem.findById(outfit._id)
    .populate('partner', 'brandName logo');

  // Log creation
  logger.info(`Outfit created by ${req.partner.brandName}: ${title}`);

  sendResponse(res, 201, 'Outfit created successfully', { outfit: populatedOutfit });
});

/**
 * @description Get paginated outfit reels feed
 * @route GET /api/outfit/feed
 * @access Public
 */
exports.getFeed = catchAsync(async (req, res, next) => {
  const { page, limit, skip } = getPagination(req.query);
  const { category, minPrice, maxPrice } = req.query;

  // Build query
  const query = { isActive: true };

  if (category && VALID_CATEGORIES.includes(category)) {
    query.category = category;
  }

  // Price range filter
  if (minPrice !== undefined || maxPrice !== undefined) {
    query.price = {};
    if (minPrice !== undefined && !isNaN(minPrice)) {
      query.price.$gte = Number(minPrice);
    }
    if (maxPrice !== undefined && !isNaN(maxPrice)) {
      query.price.$lte = Number(maxPrice);
    }
  }

  // Get outfits
  const outfits = await OutfitItem.find(query)
    .populate('partner', 'brandName logo category')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

  // Get total count
  const total = await OutfitItem.countDocuments(query);
  const totalPages = Math.ceil(total / limit);

  // Send response with pagination
  sendResponse(res, 200, 'Feed retrieved successfully', {
    outfits
  }, {
    page,
    limit,
    total,
    totalPages,
    hasNextPage: page < totalPages,
    hasPrevPage: page > 1
  });
});

/**
 * @description Get single outfit by ID
 * @route GET /api/outfit/:id
 * @access Public
 */
exports.getSingleOutfit = catchAsync(async (req, res, next) => {
  const { id } = req.params;

  // Validate ObjectId
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return next(new AppError('Invalid outfit ID', 400));
  }

  // Find outfit
  const outfit = await OutfitItem.findOne({ _id: id, isActive: true })
    .populate('partner', 'brandName logo category description');

  if (!outfit) {
    return next(new AppError('Outfit not found', 404));
  }

  // Fire-and-forget: increment views count
  OutfitItem.findByIdAndUpdate(id, { $inc: { viewsCount: 1 } }).exec();

  // Check if user liked/bookmarked (if authenticated)
  let userInteractions = { isLiked: false, isBookmarked: false };
  if (req.headers.authorization) {
    try {
      const token = req.headers.authorization?.split(' ')[1];
      if (token) {
        const jwt = require('jsonwebtoken');
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        const [like, bookmark] = await Promise.all([
          Like.findOne({ user: decoded.id, outfit: outfit._id }),
          Bookmark.findOne({ user: decoded.id, outfit: outfit._id })
        ]);

        userInteractions = {
          isLiked: !!like,
          isBookmarked: !!bookmark
        };

        // Track view interaction for AI scoring (fire and forget)
        trackInteraction(decoded.id, outfit._id, 'view')
          .catch(err => logger.warn(`AI track failed: ${err.message}`));
      }
    } catch (err) {
      // Token invalid or expired — just skip, don't error
    }
  }

  // Convert outfit to object and add user interactions
  const outfitData = outfit.toObject();
  outfitData.isLiked = userInteractions.isLiked;
  outfitData.isBookmarked = userInteractions.isBookmarked;

  sendResponse(res, 200, 'Outfit retrieved successfully', {
    outfit: outfitData
  });
});

/**
 * @description Update outfit details
 * @route PATCH /api/outfit/:id
 * @access Private (Partner)
 */
exports.updateOutfit = catchAsync(async (req, res, next) => {
  const { id } = req.params;

  // Validate ObjectId
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return next(new AppError('Invalid outfit ID', 400));
  }

  // Find outfit
  const outfit = await OutfitItem.findById(id);

  if (!outfit) {
    return next(new AppError('Outfit not found', 404));
  }

  // Check ownership
  if (outfit.partner.toString() !== req.partner._id.toString()) {
    return next(new AppError('You can only edit your own outfits', 403));
  }

  // Cannot update video via this route
  if (req.body.video) {
    return next(new AppError('Video cannot be updated via this route. Upload a new video instead.', 400));
  }

  // Whitelist allowed fields
  const allowedFields = [
    'title', 'description', 'images', 'price', 'originalPrice',
    'sizes', 'colors', 'category', 'tags', 'stock', 'isActive', 'isFeatured'
  ];

  const filteredBody = {};
  Object.keys(req.body).forEach(key => {
    if (allowedFields.includes(key)) {
      filteredBody[key] = req.body[key];
    }
  });

  // Update outfit
  const updatedOutfit = await OutfitItem.findByIdAndUpdate(
    id,
    filteredBody,
    { new: true, runValidators: true }
  ).populate('partner', 'brandName logo');

  sendResponse(res, 200, 'Outfit updated successfully', { outfit: updatedOutfit });
});

/**
 * @description Delete outfit and cleanup CDN assets
 * @route DELETE /api/outfit/:id
 * @access Private (Partner)
 */
exports.deleteOutfit = catchAsync(async (req, res, next) => {
  const { id } = req.params;

  // Validate ObjectId
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return next(new AppError('Invalid outfit ID', 400));
  }

  // Find outfit
  const outfit = await OutfitItem.findById(id);

  if (!outfit) {
    return next(new AppError('Outfit not found', 404));
  }

  // Check ownership
  if (outfit.partner.toString() !== req.partner._id.toString()) {
    return next(new AppError('You can only delete your own outfits', 403));
  }

  // Delete video from ImageKit
  if (outfit.video && outfit.video.fileId) {
    await deleteFromImageKit(outfit.video.fileId);
  }

  // Delete all images from ImageKit
  if (outfit.images && outfit.images.length > 0) {
    for (const image of outfit.images) {
      await deleteFromImageKit(image.fileId);
    }
  }

  // Delete from DB
  await OutfitItem.findByIdAndDelete(id);

  // Log deletion
  logger.info(`Outfit deleted by ${req.partner.brandName}: ${outfit.title}`);

  sendResponse(res, 200, 'Outfit deleted successfully');
});

/**
 * @description Get all outfits by a specific partner
 * @route GET /api/outfit/partner/:partnerId
 * @access Public
 */
exports.getPartnerOutfits = catchAsync(async (req, res, next) => {
  const { partnerId } = req.params;
  const { page, limit, skip } = getPagination(req.query);

  // Validate partnerId
  if (!mongoose.Types.ObjectId.isValid(partnerId)) {
    return next(new AppError('Invalid partner ID', 400));
  }

  // Check partner exists and is approved
  const partner = await FashionPartner.findOne({ _id: partnerId, isApproved: true });
  if (!partner) {
    return next(new AppError('Partner not found', 404));
  }

  // Find outfits
  const outfits = await OutfitItem.find({ partner: partnerId, isActive: true })
    .populate('partner', 'brandName logo')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

  // Get total count
  const total = await OutfitItem.countDocuments({ partner: partnerId, isActive: true });
  const totalPages = Math.ceil(total / limit);

  sendResponse(res, 200, 'Partner outfits retrieved', {
    outfits
  }, {
    page,
    limit,
    total,
    totalPages,
    hasNextPage: page < totalPages,
    hasPrevPage: page > 1
  });
});

/**
 * @description Get all outfits created by logged-in partner
 * @route GET /api/outfit/my-outfits
 * @access Private (Partner)
 */
exports.getMyOutfits = catchAsync(async (req, res, next) => {
  const { page, limit, skip } = getPagination(req.query);

  // Find all outfits for this partner (including inactive)
  const outfits = await OutfitItem.find({ partner: req.partner._id })
    .populate('partner', 'brandName logo')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

  // Get total count
  const total = await OutfitItem.countDocuments({ partner: req.partner._id });
  const totalPages = Math.ceil(total / limit);

  sendResponse(res, 200, 'Your outfits retrieved', {
    outfits
  }, {
    page,
    limit,
    total,
    totalPages,
    hasNextPage: page < totalPages,
    hasPrevPage: page > 1
  });
});

/**
 * @description Toggle isFeatured flag on outfit
 * @route PATCH /api/outfit/:id/featured
 * @access Private (Partner)
 */
exports.toggleFeatured = catchAsync(async (req, res, next) => {
  const { id } = req.params;

  // Validate ObjectId
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return next(new AppError('Invalid outfit ID', 400));
  }

  // Find outfit
  const outfit = await OutfitItem.findById(id);

  if (!outfit) {
    return next(new AppError('Outfit not found', 404));
  }

  // Check ownership
  if (outfit.partner.toString() !== req.partner._id.toString()) {
    return next(new AppError('You can only edit your own outfits', 403));
  }

  // Toggle isFeatured
  outfit.isFeatured = !outfit.isFeatured;
  await outfit.save();

  sendResponse(res, 200, `Outfit ${outfit.isFeatured ? 'featured' : 'unfeatured'}`, { outfit });
});
