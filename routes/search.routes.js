/**
 * @file search.routes.js
 * @description Search and discovery routes
 * @module SearchRoutes
 */

const express = require('express');

/**
 * Import controllers
 */
const {
  searchOutfits,
  getTrendingTags,
  searchPartners,
  getByCategory,
  getSearchSuggestions,
  getPersonalizedFeed
} = require('../controllers/search.controller');

/**
 * Import auth middleware
 */
const { protect: protectUser } = require('../middleware/authUser.middleware');

/**
 * Create router
 */
const router = express.Router();

/**
 * @route GET /api/search/suggestions
 * @description Get search autocomplete suggestions
 * @access Public
 */
router.get('/suggestions', getSearchSuggestions);

/**
 * @route GET /api/search/trending
 * @description Get trending tags from last 7 days
 * @access Public
 */
router.get('/trending', getTrendingTags);

/**
 * @route GET /api/search/partners
 * @description Search fashion partners by brand name or category
 * @access Public
 */
router.get('/partners', searchPartners);

/**
 * @route GET /api/search/personalized
 * @description Get personalized outfit feed based on user preferences
 * @access Private (User)
 */
router.get('/personalized', protectUser, getPersonalizedFeed);

/**
 * @route GET /api/search/category/:category
 * @description Browse all outfits in a specific category with stats
 * @access Public
 */
router.get('/category/:category', getByCategory);

/**
 * @route GET /api/search
 * @description Full-text + filter search for outfits
 * @access Public
 */
router.get('/', searchOutfits);

module.exports = router;
