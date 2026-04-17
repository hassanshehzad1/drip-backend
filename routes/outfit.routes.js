/**
 * @file outfit.routes.js
 * @description Outfit item routes — CRUD + feed
 * @module OutfitRoutes
 */

const express = require('express');
const { body, validationResult } = require('express-validator');

/**
 * Import controllers
 */
const {
  createOutfit,
  getFeed,
  getSingleOutfit,
  updateOutfit,
  deleteOutfit,
  getPartnerOutfits,
  getMyOutfits,
  toggleFeatured
} = require('../controllers/outfit.controller');

/**
 * Import auth middleware
 */
const { protect: protectPartner } = require('../middleware/authPartner.middleware');

/**
 * Create router
 */
const router = express.Router();

/**
 * @description Valid outfit categories
 */
const VALID_CATEGORIES = [
  'casual', 'formal', 'streetwear', 'sportswear',
  'ethnic', 'luxury', 'accessories', 'footwear', 'kids', 'other'
];

/**
 * @description Validation array for creating outfit
 */
const createOutfitValidation = [
  body('title')
    .trim()
    .notEmpty()
    .withMessage('Title is required')
    .isLength({ min: 3, max: 100 })
    .withMessage('Title must be 3-100 characters'),
  body('video.url')
    .notEmpty()
    .withMessage('Video URL is required')
    .isURL()
    .withMessage('Invalid video URL'),
  body('video.fileId')
    .notEmpty()
    .withMessage('Video file ID is required'),
  body('price')
    .notEmpty()
    .withMessage('Price is required')
    .isNumeric()
    .withMessage('Price must be a number')
    .custom(value => value >= 0)
    .withMessage('Price cannot be negative'),
  body('sizes')
    .isArray({ min: 1 })
    .withMessage('At least one size is required'),
  body('category')
    .notEmpty()
    .withMessage('Category is required')
    .isIn(VALID_CATEGORIES)
    .withMessage('Invalid category')
];

/**
 * @description Middleware to validate request
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const validateRequest = (req, res, next) => {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    return res.status(422).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array().map(e => ({
        field: e.path,
        message: e.msg
      }))
    });
  }

  next();
};

/**
 * @route GET /api/outfit/feed
 * @description Get paginated outfit reels feed
 * @access Public
 */
router.get('/feed', getFeed);

/**
 * @route GET /api/outfit/my-outfits
 * @description Get all outfits created by logged-in partner
 * @access Private (Partner)
 */
router.get('/my-outfits', protectPartner, getMyOutfits);

/**
 * @route GET /api/outfit/partner/:partnerId
 * @description Get all outfits by a specific partner
 * @access Public
 */
router.get('/partner/:partnerId', getPartnerOutfits);

/**
 * @route GET /api/outfit/:id
 * @description Get single outfit by ID
 * @access Public
 */
router.get('/:id', getSingleOutfit);

/**
 * @route POST /api/outfit
 * @description Create a new outfit reel
 * @access Private (Partner)
 */
router.post(
  '/',
  protectPartner,
  createOutfitValidation,
  validateRequest,
  createOutfit
);

/**
 * @route PATCH /api/outfit/:id
 * @description Update outfit details
 * @access Private (Partner)
 */
router.patch('/:id', protectPartner, updateOutfit);

/**
 * @route PATCH /api/outfit/:id/featured
 * @description Toggle isFeatured flag on outfit
 * @access Private (Partner)
 */
router.patch('/:id/featured', protectPartner, toggleFeatured);

/**
 * @route DELETE /api/outfit/:id
 * @description Delete outfit and cleanup CDN assets
 * @access Private (Partner)
 */
router.delete('/:id', protectPartner, deleteOutfit);

module.exports = router;
