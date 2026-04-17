/**
 * @file ai.routes.js
 * @description AI recommendation routes
 * @module AIRoutes
 */

const express = require('express');
const { body, validationResult } = require('express-validator');

/**
 * Import user authentication middleware
 */
const { protect: protectUser } = require('../middleware/authUser.middleware');

/**
 * Import AI controllers
 */
const {
  getPersonalizedFeed,
  getStyleAnalysis,
  submitStyleQuiz,
  getCompleteLook,
  trackUserInteraction,
  getSimilarOutfits,
  getTrendingOutfits,
  getRecommendedPartners
} = require('../controllers/ai.controller');

/**
 * Create router
 */
const router = express.Router();

/**
 * @description Validation array for tracking interaction
 */
const trackValidation = [
  body('outfitId')
    .notEmpty()
    .withMessage('Outfit ID is required')
    .isMongoId()
    .withMessage('Valid outfit ID required'),
  body('action')
    .notEmpty()
    .withMessage('Action is required')
    .isIn(['view', 'like', 'bookmark', 'comment', 'order', 'share'])
    .withMessage('Invalid action type')
];

/**
 * @description Validation array for style quiz
 */
const quizValidation = [
  body('answers')
    .notEmpty()
    .withMessage('Answers are required')
    .isArray({ min: 1 })
    .withMessage('Answers must be a non-empty array')
];

/**
 * @description Middleware to validate request body
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
 * IMPORTANT route order (specific before param):
 * GET  /feed                   → protectUser, getPersonalizedFeed
 * GET  /style-analysis         → protectUser, getStyleAnalysis
 * GET  /trending               → getTrendingOutfits (public)
 * GET  /recommended-partners   → protectUser, getRecommendedPartners
 * GET  /similar/:outfitId      → getSimilarOutfits (public)
 * GET  /complete-look/:outfitId → getCompleteLook (public)
 * POST /track                  → protectUser, trackValidation,
 *                                  validateRequest, trackUserInteraction
 * POST /style-quiz             → protectUser, quizValidation,
 *                                  validateRequest, submitStyleQuiz
 */

/**
 * @route GET /api/ai/feed
 * @description Get AI-scored personalized outfit feed
 * @access Private (User)
 */
router.get('/feed', protectUser, getPersonalizedFeed);

/**
 * @route GET /api/ai/style-analysis
 * @description Get user's style profile analysis
 * @access Private (User)
 */
router.get('/style-analysis', protectUser, getStyleAnalysis);

/**
 * @route GET /api/ai/trending
 * @description Get trending outfits
 * @access Public
 */
router.get('/trending', getTrendingOutfits);

/**
 * @route GET /api/ai/recommended-partners
 * @description Recommend fashion partners to follow
 * @access Private (User)
 */
router.get('/recommended-partners', protectUser, getRecommendedPartners);

/**
 * @route GET /api/ai/similar/:outfitId
 * @description Get outfits similar to a given outfit
 * @access Public
 */
router.get('/similar/:outfitId', getSimilarOutfits);

/**
 * @route GET /api/ai/complete-look/:outfitId
 * @description Get outfit suggestions that complete the look
 * @access Public
 */
router.get('/complete-look/:outfitId', getCompleteLook);

/**
 * @route POST /api/ai/track
 * @description Track user interaction for AI scoring
 * @access Private (User)
 */
router.post(
  '/track',
  protectUser,
  trackValidation,
  validateRequest,
  trackUserInteraction
);

/**
 * @route POST /api/ai/style-quiz
 * @description Process style quiz answers
 * @access Private (User)
 */
router.post(
  '/style-quiz',
  protectUser,
  quizValidation,
  validateRequest,
  submitStyleQuiz
);

module.exports = router;
