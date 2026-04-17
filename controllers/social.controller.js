/**
 * @file social.controller.js
 * @description Social features controller —
 * likes, bookmarks, follows, comments, replies
 * @module SocialController
 */

const mongoose = require('mongoose');
const Like = require('../models/Like');
const Bookmark = require('../models/Bookmark');
const Follow = require('../models/Follow');
const Comment = require('../models/Comment');
const OutfitItem = require('../models/OutfitItem');
const FashionPartner = require('../models/FashionPartner');
const User = require('../models/User');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');
const sendResponse = require('../utils/sendResponse');
const getPagination = require('../utils/pagination');
const logger = require('../config/logger');
const {
  notifyOutfitLiked,
  notifyOutfitCommented,
  notifyCommentReplied,
  notifyNewFollower
} = require('../services/socket.service');
const { trackInteraction } = require('../services/ai.service');

// ============================================
// LIKE CONTROLLERS
// ============================================

/**
 * @description Toggle like on an outfit.
 * If not liked → like it (create Like doc, increment count)
 * If already liked → unlike it (delete Like doc, decrement)
 * @route POST /api/social/like/:outfitId
 * @access Private (User)
 */
exports.toggleLike = catchAsync(async (req, res, next) => {
  const { outfitId } = req.params;

  // Validate outfitId
  if (!mongoose.Types.ObjectId.isValid(outfitId)) {
    return next(new AppError('Invalid outfit ID', 400));
  }

  // Find outfit
  const outfit = await OutfitItem.findOne({ _id: outfitId, isActive: true });
  if (!outfit) {
    return next(new AppError('Outfit not found', 404));
  }

  // Check if Like exists
  const existingLike = await Like.findOne({
    user: req.user._id,
    outfit: outfitId
  });

  if (existingLike) {
    // Unlike: delete like doc and decrement count
    await Like.findByIdAndDelete(existingLike._id);
    await OutfitItem.findByIdAndUpdate(outfitId, { $inc: { likesCount: -1 } });

    return sendResponse(res, 200, 'Outfit unliked successfully', {
      liked: false,
      likesCount: outfit.likesCount - 1
    });
  }

  // Like: create like doc and increment count
  await Like.create({ user: req.user._id, outfit: outfitId });
  await OutfitItem.findByIdAndUpdate(outfitId, { $inc: { likesCount: 1 } });

  // Fire and forget — don't await
  notifyOutfitLiked(outfit, req.user).catch(err =>
    logger.warn(`Like notification failed: ${err.message}`)
  );

  // Track interaction for AI scoring (fire and forget)
  trackInteraction(req.user._id, outfitId, 'like')
    .catch(err => logger.warn(`AI track failed: ${err.message}`));

  sendResponse(res, 200, 'Outfit liked successfully', {
    liked: true,
    likesCount: outfit.likesCount + 1
  });
});

/**
 * @description Get all outfits liked by current user
 * Paginated, newest likes first
 * @route GET /api/social/liked
 * @access Private (User)
 */
exports.getLikedOutfits = catchAsync(async (req, res, next) => {
  const { page, limit, skip } = getPagination(req.query);

  // Find likes for this user
  const likes = await Like.find({ user: req.user._id })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .populate({
      path: 'outfit',
      select: 'title video.thumbnailUrl price partner category'
    });

  // Filter out likes where outfit was deleted
  const validLikes = likes.filter(like => like.outfit !== null);
  const outfits = validLikes.map(like => like.outfit);

  // Get total count (for valid outfits only)
  const total = await Like.countDocuments({ user: req.user._id });
  const totalPages = Math.ceil(total / limit);

  sendResponse(res, 200, 'Liked outfits retrieved', { outfits }, {
    page,
    limit,
    total,
    totalPages,
    hasNextPage: page < totalPages,
    hasPrevPage: page > 1
  });
});

// ============================================
// BOOKMARK CONTROLLERS
// ============================================

/**
 * @description Toggle bookmark (save) on an outfit.
 * Same toggle pattern as like.
 * @route POST /api/social/bookmark/:outfitId
 * @access Private (User)
 */
exports.toggleBookmark = catchAsync(async (req, res, next) => {
  const { outfitId } = req.params;

  // Validate outfitId
  if (!mongoose.Types.ObjectId.isValid(outfitId)) {
    return next(new AppError('Invalid outfit ID', 400));
  }

  // Find outfit
  const outfit = await OutfitItem.findOne({ _id: outfitId, isActive: true });
  if (!outfit) {
    return next(new AppError('Outfit not found', 404));
  }

  // Check if Bookmark exists
  const existingBookmark = await Bookmark.findOne({
    user: req.user._id,
    outfit: outfitId
  });

  if (existingBookmark) {
    // Remove bookmark: delete doc and decrement count
    await Bookmark.findByIdAndDelete(existingBookmark._id);
    await OutfitItem.findByIdAndUpdate(outfitId, { $inc: { bookmarksCount: -1 } });

    return sendResponse(res, 200, 'Outfit removed from bookmarks', {
      bookmarked: false,
      bookmarksCount: outfit.bookmarksCount - 1
    });
  }

  // Add bookmark: create doc and increment count
  await Bookmark.create({ user: req.user._id, outfit: outfitId });
  await OutfitItem.findByIdAndUpdate(outfitId, { $inc: { bookmarksCount: 1 } });

  // Track interaction for AI scoring (fire and forget)
  trackInteraction(req.user._id, outfitId, 'bookmark')
    .catch(err => logger.warn(`AI track failed: ${err.message}`));

  sendResponse(res, 200, 'Outfit bookmarked successfully', {
    bookmarked: true,
    bookmarksCount: outfit.bookmarksCount + 1
  });
});

/**
 * @description Get all outfits bookmarked by current user
 * This is the "Saved Looks" feature
 * @route GET /api/social/bookmarks
 * @access Private (User)
 */
exports.getBookmarkedOutfits = catchAsync(async (req, res, next) => {
  const { page, limit, skip } = getPagination(req.query);

  // Find bookmarks for this user
  const bookmarks = await Bookmark.find({ user: req.user._id })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .populate({
      path: 'outfit',
      populate: {
        path: 'partner',
        select: 'brandName logo'
      }
    });

  // Filter out bookmarks where outfit was deleted
  const validBookmarks = bookmarks.filter(bookmark => bookmark.outfit !== null);
  const outfits = validBookmarks.map(bookmark => bookmark.outfit);

  // Get total count
  const total = await Bookmark.countDocuments({ user: req.user._id });
  const totalPages = Math.ceil(total / limit);

  sendResponse(res, 200, 'Bookmarked outfits retrieved', { outfits }, {
    page,
    limit,
    total,
    totalPages,
    hasNextPage: page < totalPages,
    hasPrevPage: page > 1
  });
});

// ============================================
// FOLLOW CONTROLLERS
// ============================================

/**
 * @description Toggle follow on a fashion partner.
 * If not following → follow (create Follow, increment partner followersCount)
 * If following → unfollow (delete Follow, decrement)
 * @route POST /api/social/follow/:partnerId
 * @access Private (User)
 */
exports.toggleFollow = catchAsync(async (req, res, next) => {
  const { partnerId } = req.params;

  // Validate partnerId
  if (!mongoose.Types.ObjectId.isValid(partnerId)) {
    return next(new AppError('Invalid partner ID', 400));
  }

  // Find partner and check approval status
  const partner = await FashionPartner.findOne({ _id: partnerId, isApproved: true });
  if (!partner) {
    return next(new AppError('Partner not found', 404));
  }

  // Check if Follow exists
  const existingFollow = await Follow.findOne({
    follower: req.user._id,
    following: partnerId
  });

  if (existingFollow) {
    // Unfollow: delete follow doc and decrement followers count
    await Follow.findByIdAndDelete(existingFollow._id);

    // Ensure followersCount doesn't go below 0
    const newFollowersCount = Math.max(0, partner.followersCount - 1);
    await FashionPartner.findByIdAndUpdate(partnerId, {
      $set: { followersCount: newFollowersCount }
    });

    return sendResponse(res, 200, 'Unfollowed partner', {
      following: false,
      followersCount: newFollowersCount
    });
  }

  // Follow: create follow doc and increment followers count
  await Follow.create({ follower: req.user._id, following: partnerId });
  await FashionPartner.findByIdAndUpdate(partnerId, { $inc: { followersCount: 1 } });

  // Notify partner of new follower (fire and forget)
  notifyNewFollower(partner, req.user).catch(err =>
    logger.warn(`Follow notification failed: ${err.message}`)
  );

  sendResponse(res, 200, 'Followed partner', {
    following: true,
    followersCount: partner.followersCount + 1
  });
});

/**
 * @description Get all partners followed by current user
 * @route GET /api/social/following
 * @access Private (User)
 */
exports.getFollowedPartners = catchAsync(async (req, res, next) => {
  const { page, limit, skip } = getPagination(req.query);

  // Find follows for this user
  const follows = await Follow.find({ follower: req.user._id })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .populate({
      path: 'following',
      select: 'brandName logo category description followersCount'
    });

  // Filter out follows where partner was deleted
  const validFollows = follows.filter(follow => follow.following !== null);
  const partners = validFollows.map(follow => follow.following);

  // Get total count
  const total = await Follow.countDocuments({ follower: req.user._id });
  const totalPages = Math.ceil(total / limit);

  sendResponse(res, 200, 'Following list retrieved', { partners }, {
    page,
    limit,
    total,
    totalPages,
    hasNextPage: page < totalPages,
    hasPrevPage: page > 1
  });
});

/**
 * @description Get all followers of the logged-in partner
 * @route GET /api/social/partner/followers
 * @access Private (Partner)
 */
exports.getFollowers = catchAsync(async (req, res, next) => {
  const { page, limit, skip } = getPagination(req.query);

  // Find follows for this partner
  const follows = await Follow.find({ following: req.partner._id })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .populate({
      path: 'follower',
      select: 'name avatar'
    });

  // Filter out follows where follower was deleted
  const validFollows = follows.filter(follow => follow.follower !== null);
  const followers = validFollows.map(follow => follow.follower);

  // Get total count
  const total = await Follow.countDocuments({ following: req.partner._id });
  const totalPages = Math.ceil(total / limit);

  sendResponse(res, 200, 'Followers retrieved', { followers }, {
    page,
    limit,
    total,
    totalPages,
    hasNextPage: page < totalPages,
    hasPrevPage: page > 1
  });
});

/**
 * @description Check if current user follows a partner
 * @route GET /api/social/follow/check/:partnerId
 * @access Private (User)
 */
exports.checkFollowStatus = catchAsync(async (req, res, next) => {
  const { partnerId } = req.params;

  // Validate partnerId
  if (!mongoose.Types.ObjectId.isValid(partnerId)) {
    return next(new AppError('Invalid partner ID', 400));
  }

  // Find follow doc
  const follow = await Follow.findOne({
    follower: req.user._id,
    following: partnerId
  });

  sendResponse(res, 200, 'Follow status retrieved', {
    isFollowing: !!follow
  });
});

// ============================================
// COMMENT CONTROLLERS
// ============================================

/**
 * @description Add a top-level comment to an outfit
 * @route POST /api/social/comment/:outfitId
 * @access Private (User)
 */
exports.addComment = catchAsync(async (req, res, next) => {
  const { outfitId } = req.params;
  const { text } = req.body;

  // Validate outfitId
  if (!mongoose.Types.ObjectId.isValid(outfitId)) {
    return next(new AppError('Invalid outfit ID', 400));
  }

  // Find outfit
  const outfit = await OutfitItem.findById(outfitId);
  if (!outfit) {
    return next(new AppError('Outfit not found', 404));
  }

  // Create comment
  const comment = await Comment.create({
    user: req.user._id,
    outfit: outfitId,
    text,
    isReply: false
  });

  // Increment outfit commentsCount (fire and forget)
  OutfitItem.findByIdAndUpdate(outfitId, { $inc: { commentsCount: 1 } }).exec();

  // Populate user data
  await comment.populate('user', 'name avatar');

  // Notify partner of new comment (fire and forget)
  notifyOutfitCommented(outfit, req.user, comment._id).catch(err =>
    logger.warn(`Comment notification failed: ${err.message}`)
  );

  // Track interaction for AI scoring (fire and forget)
  trackInteraction(req.user._id, outfitId, 'comment')
    .catch(err => logger.warn(`AI track failed: ${err.message}`));

  sendResponse(res, 201, 'Comment added successfully', { comment });
});

/**
 * @description Reply to an existing comment (1 level deep only)
 * @route POST /api/social/comment/:commentId/reply
 * @access Private (User)
 */
exports.replyToComment = catchAsync(async (req, res, next) => {
  const { commentId } = req.params;
  const { text } = req.body;

  // Validate commentId
  if (!mongoose.Types.ObjectId.isValid(commentId)) {
    return next(new AppError('Invalid comment ID', 400));
  }

  // Find parent comment
  const parentComment = await Comment.findOne({ _id: commentId, isActive: true });
  if (!parentComment) {
    return next(new AppError('Comment not found', 404));
  }

  // Check if parent is already a reply (max depth = 1)
  if (parentComment.isReply) {
    return next(new AppError('Cannot reply to a reply. Max depth is 1 level.', 400));
  }

  // Create reply
  const reply = await Comment.create({
    user: req.user._id,
    outfit: parentComment.outfit,
    text,
    parentComment: commentId,
    isReply: true
  });

  // Increment outfit commentsCount
  OutfitItem.findByIdAndUpdate(parentComment.outfit, { $inc: { commentsCount: 1 } }).exec();

  // Populate user data
  await reply.populate('user', 'name avatar');

  // Get outfit for notification context
  const outfit = await OutfitItem.findById(parentComment.outfit);

  // Notify comment author of reply (fire and forget)
  notifyCommentReplied(parentComment, req.user, outfit).catch(err =>
    logger.warn(`Reply notification failed: ${err.message}`)
  );

  sendResponse(res, 201, 'Reply added successfully', { comment: reply });
});

/**
 * @description Get paginated top-level comments for an outfit
 * with reply count for each comment
 * @route GET /api/social/comment/:outfitId
 * @access Public
 */
exports.getComments = catchAsync(async (req, res, next) => {
  const { outfitId } = req.params;
  const { page, limit, skip } = getPagination(req.query);

  // Validate outfitId
  if (!mongoose.Types.ObjectId.isValid(outfitId)) {
    return next(new AppError('Invalid outfit ID', 400));
  }

  // Find top-level comments
  const comments = await Comment.find({
    outfit: outfitId,
    isReply: false,
    isActive: true
  })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .populate('user', 'name avatar');

  // Get reply count for each comment
  const commentsWithReplyCount = await Promise.all(
    comments.map(async comment => {
      const replyCount = await Comment.countDocuments({
        parentComment: comment._id,
        isActive: true
      });
      return {
        ...comment.toObject(),
        replyCount
      };
    })
  );

  // Get total count
  const total = await Comment.countDocuments({
    outfit: outfitId,
    isReply: false,
    isActive: true
  });
  const totalPages = Math.ceil(total / limit);

  sendResponse(res, 200, 'Comments retrieved', {
    comments: commentsWithReplyCount
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
 * @description Get all replies for a specific comment
 * @route GET /api/social/comment/:commentId/replies
 * @access Public
 */
exports.getReplies = catchAsync(async (req, res, next) => {
  const { commentId } = req.params;
  const { page, limit, skip } = getPagination(req.query);

  // Validate commentId
  if (!mongoose.Types.ObjectId.isValid(commentId)) {
    return next(new AppError('Invalid comment ID', 400));
  }

  // Find parent comment
  const parentComment = await Comment.findById(commentId);
  if (!parentComment) {
    return next(new AppError('Comment not found', 404));
  }

  // Find replies
  const replies = await Comment.find({
    parentComment: commentId,
    isActive: true
  })
    .sort({ createdAt: 1 })
    .skip(skip)
    .limit(limit)
    .populate('user', 'name avatar');

  // Get total count
  const total = await Comment.countDocuments({
    parentComment: commentId,
    isActive: true
  });
  const totalPages = Math.ceil(total / limit);

  sendResponse(res, 200, 'Replies retrieved', {
    replies
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
 * @description Soft delete a comment (sets isActive: false)
 * User can only delete their own comments
 * @route DELETE /api/social/comment/:commentId
 * @access Private (User)
 */
exports.deleteComment = catchAsync(async (req, res, next) => {
  const { commentId } = req.params;

  // Validate commentId
  if (!mongoose.Types.ObjectId.isValid(commentId)) {
    return next(new AppError('Invalid comment ID', 400));
  }

  // Find comment
  const comment = await Comment.findOne({ _id: commentId, isActive: true });
  if (!comment) {
    return next(new AppError('Comment not found', 404));
  }

  // Check ownership
  if (comment.user.toString() !== req.user._id.toString()) {
    return next(new AppError('You can only delete your own comments', 403));
  }

  // Soft delete: set isActive to false
  comment.isActive = false;
  await comment.save();

  // Decrement outfit commentsCount
  await OutfitItem.findByIdAndUpdate(comment.outfit, {
    $inc: { commentsCount: -1 }
  });

  // If top-level comment, also soft-delete all replies
  let additionalDeletedCount = 0;
  if (!comment.isReply) {
    const replyCount = await Comment.countDocuments({
      parentComment: commentId,
      isActive: true
    });

    await Comment.updateMany(
      { parentComment: commentId },
      { isActive: false }
    );

    // Decrement outfit count for replies too
    if (replyCount > 0) {
      await OutfitItem.findByIdAndUpdate(comment.outfit, {
        $inc: { commentsCount: -replyCount }
      });
      additionalDeletedCount = replyCount;
    }
  }

  logger.info(`Comment deleted by user ${req.user._id}. Comment: ${commentId}, Replies deleted: ${additionalDeletedCount}`);

  sendResponse(res, 200, 'Comment deleted successfully');
});

// ============================================
// STATUS CHECK CONTROLLER
// ============================================

/**
 * @description Check if user liked and/or bookmarked an outfit
 * Used by frontend when loading a reel to show correct state
 * @route GET /api/social/status/:outfitId
 * @access Private (User)
 */
exports.checkLikeBookmarkStatus = catchAsync(async (req, res, next) => {
  const { outfitId } = req.params;

  // Validate outfitId
  if (!mongoose.Types.ObjectId.isValid(outfitId)) {
    return next(new AppError('Invalid outfit ID', 400));
  }

  // Run both checks in parallel
  const [like, bookmark] = await Promise.all([
    Like.findOne({ user: req.user._id, outfit: outfitId }),
    Bookmark.findOne({ user: req.user._id, outfit: outfitId })
  ]);

  sendResponse(res, 200, 'Status retrieved', {
    isLiked: !!like,
    isBookmarked: !!bookmark,
    outfitId
  });
});
