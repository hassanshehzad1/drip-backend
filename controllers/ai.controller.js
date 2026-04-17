/**
 * @file ai.controller.js
 * @description AI recommendation controller —
 * personalized feed, style analysis, quiz,
 * complete the look, trending
 * @module AIController
 */

const mongoose = require('mongoose');
const OutfitItem = require('../models/OutfitItem');
const User = require('../models/User');
const FashionPartner = require('../models/FashionPartner');
const Follow = require('../models/Follow');
const Like = require('../models/Like');
const Bookmark = require('../models/Bookmark');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');
const sendResponse = require('../utils/sendResponse');
const getPagination = require('../utils/pagination');
const logger = require('../config/logger');

const {
  trackInteraction,
  calculateOutfitScore,
  getTopCategories,
  analyzeUserStyle,
  getComplementaryOutfits
} = require('../services/ai.service');

/**
 * @description Get AI-scored personalized outfit feed
 * Scores every active outfit based on user profile
 * Returns sorted by relevance score
 * @route GET /api/ai/feed
 * @access Private (User)
 */
exports.getPersonalizedFeed = catchAsync(async (req, res, next) => {
  const { excludeSeen } = req.query;

  // Get user with categoryScores + stylePreferences
  const user = await User.findById(req.user._id)
    .select('categoryScores stylePreferences');

  if (!user) {
    return next(new AppError('User not found', 404));
  }

  // Get followed partner IDs
  const follows = await Follow.find({ follower: req.user._id })
    .select('following');
  const followedPartnerIds = follows.map(f => f.following);

  // Build base query
  const query = { isActive: true };

  // Exclude already seen outfits if requested
  if (excludeSeen === 'true') {
    const [likedOutfits, bookmarkedOutfits] = await Promise.all([
      Like.find({ user: req.user._id }).select('outfit'),
      Bookmark.find({ user: req.user._id }).select('outfit')
    ]);

    const likedIds = likedOutfits.map(l => l.outfit.toString());
    const bookmarkedIds = bookmarkedOutfits.map(b => b.outfit.toString());
    const excludeIds = [...new Set([...likedIds, ...bookmarkedIds])];

    if (excludeIds.length > 0) {
      query._id = { $nin: excludeIds };
    }
  }

  // Fetch outfits pool (fetch more than limit for scoring)
  const outfits = await OutfitItem.find(query)
    .populate('partner', 'brandName logo category')
    .select('title video price originalPrice category tags partner likesCount viewsCount bookmarksCount createdAt isInStock discountPercentage')
    .limit(200);

  // Score each outfit
  const userProfile = {
    categoryScores: user.categoryScores?.toJSON?.() || {},
    stylePreferences: user.stylePreferences || []
  };

  const scoredOutfits = outfits.map(outfit => ({
    ...outfit.toObject(),
    relevanceScore: calculateOutfitScore(
      outfit, userProfile, followedPartnerIds
    )
  }));

  // Sort by relevanceScore descending
  scoredOutfits.sort((a, b) => b.relevanceScore - a.relevanceScore);

  // Apply pagination manually on sorted array
  const { page, limit } = getPagination(req.query);
  const maxLimit = Math.min(limit, 20);
  const start = (page - 1) * maxLimit;
  const paginatedResults = scoredOutfits.slice(start, start + maxLimit);

  const total = scoredOutfits.length;
  const totalPages = Math.ceil(total / maxLimit);

  sendResponse(
    res,
    200,
    'Personalized feed retrieved',
    {
      outfits: paginatedResults,
      isPersonalized: followedPartnerIds.length > 0 ||
        Object.keys(userProfile.categoryScores).length > 0,
      userProfile: {
        topCategories: getTopCategories(userProfile.categoryScores),
        stylePreferences: user.stylePreferences
      }
    },
    {
      page,
      limit: maxLimit,
      total,
      totalPages,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1
    }
  );
});

/**
 * @description Get user's style profile analysis
 * Shows what categories they engage with most
 * @route GET /api/ai/style-analysis
 * @access Private (User)
 */
exports.getStyleAnalysis = catchAsync(async (req, res, next) => {
  const analysis = await analyzeUserStyle(req.user._id);

  if (!analysis) {
    return next(new AppError('Failed to analyze style', 500));
  }

  const message = analysis.activitySummary.engagementScore === 0
    ? 'Start liking and ordering outfits to get personalized recommendations'
    : 'Based on your activity, here is your style profile';

  sendResponse(res, 200, 'Style analysis retrieved', {
    analysis,
    message
  });
});

/**
 * @description Process style quiz answers
 * Updates user's stylePreferences + seeds categoryScores
 * @route POST /api/ai/style-quiz
 * @access Private (User)
 */
exports.submitStyleQuiz = catchAsync(async (req, res, next) => {
  const { answers } = req.body;

  if (!answers || !Array.isArray(answers) || answers.length === 0) {
    return next(new AppError('Answers must be a non-empty array', 400));
  }

  const user = await User.findById(req.user._id);
  if (!user) {
    return next(new AppError('User not found', 404));
  }

  // Quiz answer to category mapping
  const quizCategoryMap = {
    // preferred_style answers
    casual: { casual: 10, streetwear: 5 },
    formal: { formal: 10, luxury: 5 },
    streetwear: { streetwear: 10, casual: 5 },
    sportswear: { sportswear: 10 },
    ethnic: { ethnic: 10 },
    luxury: { luxury: 10, formal: 5 },
    // occasion answers
    daily_wear: { casual: 5, streetwear: 3 },
    office: { formal: 5 },
    party: { formal: 3, luxury: 3 },
    gym: { sportswear: 8 },
    // budget answers
    budget: { casual: 3, streetwear: 2 },
    mid_range: { casual: 2, formal: 2, streetwear: 2 },
    premium: { formal: 3, luxury: 3 },
    luxury_budget: { luxury: 5 }
  };

  // Build style preferences from answers
  const validStylePrefs = ['casual', 'formal', 'streetwear', 'sportswear', 'ethnic', 'luxury', 'accessories', 'footwear'];
  const stylePrefs = answers
    .map(a => a.answer)
    .filter(a => typeof a === 'string' && validStylePrefs.includes(a));

  // Build initial category scores from quiz
  const initialScores = {};
  answers.forEach(({ answer }) => {
    const mapping = quizCategoryMap[answer] || {};
    Object.entries(mapping).forEach(([cat, score]) => {
      initialScores[cat] = (initialScores[cat] || 0) + score;
    });
  });

  // Update user
  const updateData = {
    stylePreferences: stylePrefs.length > 0 ? stylePrefs : user.stylePreferences
  };

  // Add category scores
  Object.entries(initialScores).forEach(([cat, score]) => {
    updateData[`categoryScores.${cat}`] = score;
  });

  const updatedUser = await User.findByIdAndUpdate(
    req.user._id,
    { $set: updateData },
    { new: true }
  );

  sendResponse(res, 200, 'Style profile created! Your feed is now personalized.', {
    stylePreferences: updatedUser.stylePreferences,
    topCategories: getTopCategories(initialScores)
  });
});

/**
 * @description Get outfit suggestions that complete the look
 * "You might also like these with this outfit"
 * @route GET /api/ai/complete-look/:outfitId
 * @access Public
 */
exports.getCompleteLook = catchAsync(async (req, res, next) => {
  const { outfitId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(outfitId)) {
    return next(new AppError('Invalid outfit ID', 400));
  }

  const outfit = await OutfitItem.findById(outfitId)
    .select('title category price');

  if (!outfit) {
    return next(new AppError('Outfit not found', 404));
  }

  const suggestions = await getComplementaryOutfits(outfitId, 6);

  sendResponse(res, 200, 'Complete your look with these items', {
    baseOutfit: {
      id: outfit._id,
      title: outfit.title,
      category: outfit.category,
      price: outfit.price
    },
    suggestions
  });
});

/**
 * @description Track user interaction for AI scoring
 * Called by frontend when user performs an action
 * @route POST /api/ai/track
 * @access Private (User)
 */
exports.trackUserInteraction = catchAsync(async (req, res, next) => {
  const { outfitId, action } = req.body;

  // Validation
  if (!outfitId || !action) {
    return next(new AppError('outfitId and action are required', 400));
  }

  if (!mongoose.Types.ObjectId.isValid(outfitId)) {
    return next(new AppError('Invalid outfit ID', 400));
  }

  const validActions = ['view', 'like', 'bookmark', 'comment', 'order', 'share'];
  if (!validActions.includes(action)) {
    return next(new AppError(`Action must be one of: ${validActions.join(', ')}`, 400));
  }

  // Verify outfit exists
  const outfit = await OutfitItem.findById(outfitId).select('_id');
  if (!outfit) {
    return next(new AppError('Outfit not found', 404));
  }

  // Track interaction (fire and forget)
  trackInteraction(req.user._id, outfitId, action);

  sendResponse(res, 200, 'Interaction tracked', { action, outfitId });
});

/**
 * @description Get outfits similar to a given outfit
 * Based on same category + overlapping tags
 * @route GET /api/ai/similar/:outfitId
 * @access Public
 */
exports.getSimilarOutfits = catchAsync(async (req, res, next) => {
  const { outfitId } = req.params;
  const { limit = 8 } = req.query;

  if (!mongoose.Types.ObjectId.isValid(outfitId)) {
    return next(new AppError('Invalid outfit ID', 400));
  }

  const outfit = await OutfitItem.findById(outfitId)
    .select('category tags');

  if (!outfit) {
    return next(new AppError('Outfit not found', 404));
  }

  const maxLimit = Math.min(parseInt(limit) || 8, 12);

  // Find similar outfits
  const similarOutfits = await OutfitItem.find({
    isActive: true,
    _id: { $ne: outfitId },
    $or: [
      { category: outfit.category },
      { tags: { $in: outfit.tags || [] } }
    ]
  })
    .sort({ likesCount: -1 })
    .limit(maxLimit)
    .populate('partner', 'brandName logo')
    .select('title video.thumbnailUrl price category tags partner likesCount viewsCount');

  sendResponse(res, 200, 'Similar outfits retrieved', { similarOutfits });
});

/**
 * @description Get trending outfits based on
 * engagement in last 24 hours and 7 days
 * @route GET /api/ai/trending
 * @access Public
 */
exports.getTrendingOutfits = catchAsync(async (req, res, next) => {
  const { period = '7d' } = req.query;

  const periods = {
    '24h': 1,
    '7d': 7,
    '30d': 30
  };

  const days = periods[period] || 7;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  // Aggregation pipeline for trending
  let outfits = await OutfitItem.aggregate([
    { $match: { isActive: true, createdAt: { $gte: since } } },
    {
      $addFields: {
        trendScore: {
          $add: [
            { $multiply: ['$viewsCount', 0.3] },
            { $multiply: ['$likesCount', 0.5] },
            { $multiply: ['$bookmarksCount', 0.4] },
            { $multiply: ['$commentsCount', 0.3] }
          ]
        }
      }
    },
    { $sort: { trendScore: -1 } },
    { $limit: 20 },
    {
      $lookup: {
        from: 'fashionpartners',
        localField: 'partner',
        foreignField: '_id',
        as: 'partner'
      }
    },
    { $unwind: '$partner' },
    {
      $project: {
        title: 1,
        'video.thumbnailUrl': 1,
        price: 1,
        category: 1,
        tags: 1,
        likesCount: 1,
        viewsCount: 1,
        bookmarksCount: 1,
        trendScore: { $round: ['$trendScore', 1] },
        'partner.brandName': 1,
        'partner.logo': 1
      }
    }
  ]);

  // Fallback to all-time trending if no recent results
  if (outfits.length === 0) {
    outfits = await OutfitItem.aggregate([
      { $match: { isActive: true } },
      {
        $addFields: {
          trendScore: {
            $add: [
              { $multiply: ['$viewsCount', 0.3] },
              { $multiply: ['$likesCount', 0.5] },
              { $multiply: ['$bookmarksCount', 0.4] },
              { $multiply: ['$commentsCount', 0.3] }
            ]
          }
        }
      },
      { $sort: { trendScore: -1 } },
      { $limit: 20 },
      {
        $lookup: {
          from: 'fashionpartners',
          localField: 'partner',
          foreignField: '_id',
          as: 'partner'
        }
      },
      { $unwind: '$partner' },
      {
        $project: {
          title: 1,
          'video.thumbnailUrl': 1,
          price: 1,
          category: 1,
          tags: 1,
          likesCount: 1,
          viewsCount: 1,
          bookmarksCount: 1,
          trendScore: { $round: ['$trendScore', 1] },
          'partner.brandName': 1,
          'partner.logo': 1
        }
      }
    ]);
  }

  sendResponse(res, 200, 'Trending outfits retrieved', {
    outfits,
    period,
    since
  });
});

/**
 * @description Recommend fashion partners to follow
 * Based on user's style preferences and category scores
 * Excludes already-followed partners
 * @route GET /api/ai/recommended-partners
 * @access Private (User)
 */
exports.getRecommendedPartners = catchAsync(async (req, res, next) => {
  // Get user's top categories
  const user = await User.findById(req.user._id)
    .select('categoryScores stylePreferences');

  if (!user) {
    return next(new AppError('User not found', 404));
  }

  const topCategories = getTopCategories(
    user.categoryScores?.toJSON?.() || {}
  );
  const topCategoryNames = [
    ...topCategories.map(c => c.category),
    ...(user.stylePreferences || [])
  ];

  // Get already followed partner IDs
  const follows = await Follow.find({ follower: req.user._id })
    .select('following');
  const followedPartnerIds = follows.map(f => f.following.toString());

  // Find partners in user's top categories
  let recommendations = await FashionPartner.find({
    isApproved: true,
    isActive: true,
    _id: { $nin: followedPartnerIds.map(id => new mongoose.Types.ObjectId(id)) },
    category: { $in: topCategoryNames }
  })
    .sort({ followersCount: -1 })
    .limit(10)
    .select('brandName logo description category followersCount totalSales');

  // If less than 5 results, add popular partners
  if (recommendations.length < 5) {
    const existingIds = [
      ...followedPartnerIds,
      ...recommendations.map(r => r._id.toString())
    ];

    const additional = await FashionPartner.find({
      isApproved: true,
      isActive: true,
      _id: { $nin: existingIds.map(id => new mongoose.Types.ObjectId(id)) }
    })
      .sort({ followersCount: -1 })
      .limit(10 - recommendations.length)
      .select('brandName logo description category followersCount totalSales');

    recommendations = [...recommendations, ...additional];
  }

  // Deduplicate
  const seen = new Set();
  const deduplicated = recommendations.filter(r => {
    const id = r._id.toString();
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });

  sendResponse(res, 200, 'Recommended partners retrieved', {
    recommendations: deduplicated.slice(0, 10),
    basedOn: {
      topCategories: topCategoryNames.slice(0, 3),
      totalRecommendations: deduplicated.length
    }
  });
});
