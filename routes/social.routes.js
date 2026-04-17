/**
 * @file social.routes.js
 * @description Social feature routes —
 * likes, bookmarks, follows, comments
 * @module SocialRoutes
 */

const express = require('express');
const { body, validationResult } = require('express-validator');

/**
 * Import controllers
 */
const {
  toggleLike,
  getLikedOutfits,
  toggleBookmark,
  getBookmarkedOutfits,
  toggleFollow,
  getFollowedPartners,
  getFollowers,
  checkFollowStatus,
  addComment,
  replyToComment,
  getComments,
  getReplies,
  deleteComment,
  checkLikeBookmarkStatus
} = require('../controllers/social.controller');

/**
 * Import auth middleware
 */
const { protect: protectUser } = require('../middleware/authUser.middleware');
const { protect: protectPartner } = require('../middleware/authPartner.middleware');

/**
 * Create router
 */
const router = express.Router();

/**
 * @description Validation array for comments
 */
const commentValidation = [
  body('text')
    .trim()
    .notEmpty()
    .withMessage('Comment text is required')
    .isLength({ min: 1, max: 500 })
    .withMessage('Comment must be 1-500 characters')
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

// ============================================
// LIKE ROUTES
// ============================================

/**
 * @route POST /api/social/like/:outfitId
 * @description Toggle like on an outfit
 * @access Private (User)
 */
router.post('/like/:outfitId', protectUser, toggleLike);

/**
 * @route GET /api/social/liked
 * @description Get all outfits liked by current user
 * @access Private (User)
 */
router.get('/liked', protectUser, getLikedOutfits);

// ============================================
// BOOKMARK ROUTES
// ============================================

/**
 * @route POST /api/social/bookmark/:outfitId
 * @description Toggle bookmark on an outfit
 * @access Private (User)
 */
router.post('/bookmark/:outfitId', protectUser, toggleBookmark);

/**
 * @route GET /api/social/bookmarks
 * @description Get all outfits bookmarked by current user
 * @access Private (User)
 */
router.get('/bookmarks', protectUser, getBookmarkedOutfits);

// ============================================
// FOLLOW ROUTES
// ============================================

/**
 * @route POST /api/social/follow/:partnerId
 * @description Toggle follow on a fashion partner
 * @access Private (User)
 */
router.post('/follow/:partnerId', protectUser, toggleFollow);

/**
 * @route GET /api/social/following
 * @description Get all partners followed by current user
 * @access Private (User)
 */
router.get('/following', protectUser, getFollowedPartners);

/**
 * @route GET /api/social/partner/followers
 * @description Get all followers of the logged-in partner
 * @access Private (Partner)
 */
router.get('/partner/followers', protectPartner, getFollowers);

/**
 * @route GET /api/social/follow/check/:partnerId
 * @description Check if current user follows a partner
 * @access Private (User)
 */
router.get('/follow/check/:partnerId', protectUser, checkFollowStatus);

// ============================================
// COMMENT ROUTES
// ============================================

/**
 * @route POST /api/social/comment/:outfitId
 * @description Add a top-level comment to an outfit
 * @access Private (User)
 */
router.post(
  '/comment/:outfitId',
  protectUser,
  commentValidation,
  validateRequest,
  addComment
);

/**
 * @route POST /api/social/comment/:commentId/reply
 * @description Reply to an existing comment
 * @access Private (User)
 */
router.post(
  '/comment/:commentId/reply',
  protectUser,
  commentValidation,
  validateRequest,
  replyToComment
);

/**
 * @route GET /api/social/comment/:outfitId
 * @description Get paginated top-level comments for an outfit
 * @access Public
 */
router.get('/comment/:outfitId', getComments);

/**
 * @route GET /api/social/comment/:commentId/replies
 * @description Get all replies for a specific comment
 * @access Public
 */
router.get('/comment/:commentId/replies', getReplies);

/**
 * @route DELETE /api/social/comment/:commentId
 * @description Soft delete a comment
 * @access Private (User)
 */
router.delete('/comment/:commentId', protectUser, deleteComment);

// ============================================
// STATUS CHECK ROUTE
// ============================================

/**
 * @route GET /api/social/status/:outfitId
 * @description Check if user liked and/or bookmarked an outfit
 * @access Private (User)
 */
router.get('/status/:outfitId', protectUser, checkLikeBookmarkStatus);

module.exports = router;
