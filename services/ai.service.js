/**
 * @file ai.service.js
 * @description AI recommendation service —
 * scoring algorithms, interaction tracking,
 * style analysis, collaborative filtering
 * @module AIService
 *
 * This is NOT ChatGPT or external AI.
 * This is a SCORING ALGORITHM — pure mathematics.
 *
 * Industry term: "Collaborative Filtering" +
 * "Content-Based Filtering" hybrid approach.
 *
 * Same algorithm that Netflix, Spotify, TikTok use
 * at their core before adding neural networks.
 *
 * How it works:
 * 1. Every time user interacts (like, bookmark, order, view)
 *    → we update their "categoryScores" in DB
 *    → categoryScores = { casual: 5, formal: 2, ethnic: 8 }
 *
 * 2. When user opens feed:
 *    → We score every outfit based on:
 *       a) Does category match user's top categories? (+weight)
 *       b) Does partner match followed partners? (+weight)
 *       c) Does tags overlap user's stylePreferences? (+weight)
 *       d) Is outfit trending (high views/likes)? (+weight)
 *       e) Is outfit new (posted recently)? (+weight)
 *    → Sort by score → highest score outfits shown first
 *
 * 3. Result: Feed feels "personalized" to each user
 */

const OutfitItem = require('../models/OutfitItem');
const User = require('../models/User');
const Like = require('../models/Like');
const Bookmark = require('../models/Bookmark');
const Order = require('../models/Order');
const Follow = require('../models/Follow');
const logger = require('../config/logger');

/**
 * @description Interaction weights for scoring
 * How much each action affects recommendations
 */
const INTERACTION_WEIGHTS = {
  view: 0.5, // Just watched reel
  like: 2.0, // Actively liked
  bookmark: 3.0, // Saved for later
  comment: 2.5, // Engaged with content
  order: 5.0, // Actually bought
  share: 3.5 // Shared with friends
};

/**
 * @description Update user's categoryScores based on interaction
 * Called every time user interacts with an outfit
 * Fire-and-forget pattern — never blocks main flow
 * @param {String} userId - User's MongoDB _id
 * @param {String} outfitId - Outfit's MongoDB _id
 * @param {String} action - 'like'|'bookmark'|'order'|'view'|'comment'|'share'
 * @returns {Promise<void>}
 */
exports.trackInteraction = async (userId, outfitId, action) => {
  try {
    const outfit = await OutfitItem.findById(outfitId)
      .select('category tags partner');
    if (!outfit) return;

    const weight = INTERACTION_WEIGHTS[action] || 1;

    // Update categoryScores using MongoDB $inc
    // categoryScores is a Map: { casual: 5, formal: 2 }
    const scoreKey = `categoryScores.${outfit.category}`;

    await User.findByIdAndUpdate(userId, {
      $inc: { [scoreKey]: weight }
    });

    logger.info(
      `Interaction tracked: user ${userId} ${action} → ${outfit.category} (+${weight})`
    );
  } catch (error) {
    // Never throw — tracking failure should not affect main flow
    logger.warn(`trackInteraction failed: ${error.message}`);
  }
};

/**
 * @description Calculate personalized score for an outfit
 * Higher score = more relevant to this user
 * Pure function — no database calls
 * @param {Object} outfit - OutfitItem document
 * @param {Object} userProfile - User's scoring profile
 * @param {Array} followedPartners - Partner IDs user follows
 * @returns {Number} Score between 0 and 100
 */
exports.calculateOutfitScore = (outfit, userProfile, followedPartners) => {
  let score = 0;

  const {
    categoryScores = {},
    stylePreferences = []
  } = userProfile;

  // 1. Category score (max 40 points)
  // Get user's score for this outfit's category
  const catScore = categoryScores[outfit.category] || 0;
  // Normalize: max category score across all categories
  const maxCatScore = Math.max(...Object.values(categoryScores), 1);
  score += (catScore / maxCatScore) * 40;

  // 2. Followed partner bonus (max 20 points)
  const isFollowed = followedPartners.some(
    id => id.toString() === outfit.partner.toString()
  );
  if (isFollowed) score += 20;

  // 3. Style preferences match (max 15 points)
  // Check overlap between outfit tags and user preferences
  if (stylePreferences.length > 0 && outfit.tags?.length > 0) {
    const overlap = outfit.tags.filter(tag =>
      stylePreferences.includes(tag)
    ).length;
    const matchRatio = overlap / Math.max(stylePreferences.length, 1);
    score += matchRatio * 15;
  }

  // 4. Category preference direct match (max 10 points)
  if (stylePreferences.includes(outfit.category)) {
    score += 10;
  }

  // 5. Trending score (max 10 points)
  // Based on views and likes relative to recency
  const trendScore = (outfit.viewsCount * 0.3) + (outfit.likesCount * 0.7);
  const normalizedTrend = Math.min(trendScore / 100, 1);
  score += normalizedTrend * 10;

  // 6. Freshness bonus (max 5 points)
  // Newer outfits get slight boost
  const daysSinceCreated = (Date.now() - new Date(outfit.createdAt))
    / (1000 * 60 * 60 * 24);
  if (daysSinceCreated < 1) score += 5;
  else if (daysSinceCreated < 3) score += 3;
  else if (daysSinceCreated < 7) score += 1;

  return Math.round(score * 10) / 10; // Round to 1 decimal
};

/**
 * @description Get user's top categories sorted by score
 * @param {Object} categoryScores - Map of category → score
 * @returns {Array} Sorted categories [{category, score}]
 */
exports.getTopCategories = (categoryScores = {}) => {
  return Object.entries(categoryScores)
    .map(([category, score]) => ({ category, score }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
};

/**
 * @description Analyze user's style profile
 * Returns complete breakdown of preferences
 * @param {String} userId - User's MongoDB _id
 * @returns {Object|null} Style analysis report or null on error
 */
exports.analyzeUserStyle = async (userId) => {
  try {
    const user = await User.findById(userId)
      .select('categoryScores stylePreferences');

    const [
      totalLikes,
      totalBookmarks,
      totalOrders,
      likedCategories,
      orderedCategories
    ] = await Promise.all([
      Like.countDocuments({ user: userId }),
      Bookmark.countDocuments({ user: userId }),
      Order.countDocuments({ user: userId }),

      // Categories user likes most
      Like.aggregate([
        { $match: { user: userId } },
        { $lookup: {
          from: 'outfititems',
          localField: 'outfit',
          foreignField: '_id',
          as: 'outfit'
        }},
        { $unwind: '$outfit' },
        { $group: {
          _id: '$outfit.category',
          count: { $sum: 1 }
        }},
        { $sort: { count: -1 }},
        { $limit: 5 }
      ]),

      // Categories user orders most
      Order.aggregate([
        { $match: { user: userId }},
        { $unwind: '$items' },
        { $lookup: {
          from: 'outfititems',
          localField: 'items.outfit',
          foreignField: '_id',
          as: 'outfit'
        }},
        { $unwind: '$outfit' },
        { $group: {
          _id: '$outfit.category',
          count: { $sum: 1 }
        }},
        { $sort: { count: -1 }},
        { $limit: 5 }
      ])
    ]);

    return {
      topCategories: this.getTopCategories(
        user?.categoryScores?.toJSON?.() || {}
      ),
      stylePreferences: user?.stylePreferences || [],
      activitySummary: {
        totalLikes,
        totalBookmarks,
        totalOrders,
        engagementScore: totalLikes + (totalBookmarks * 1.5) + (totalOrders * 3)
      },
      likedCategories,
      orderedCategories
    };
  } catch (error) {
    logger.error(`analyzeUserStyle failed: ${error.message}`);
    return null;
  }
};

/**
 * @description Get "Complete the Look" suggestions
 * Finds outfits that complement a given outfit
 * @param {String} outfitId - Base outfit ID
 * @param {Number} limit - Max suggestions (default 5)
 * @returns {Promise<Array>} Complementary outfits
 */
exports.getComplementaryOutfits = async (outfitId, limit = 5) => {
  const outfit = await OutfitItem.findById(outfitId)
    .select('category tags partner price');
  if (!outfit) return [];

  // Define complementary category pairs
  const complementaryMap = {
    casual: ['accessories', 'footwear'],
    formal: ['accessories', 'footwear'],
    streetwear: ['accessories', 'footwear', 'casual'],
    sportswear: ['footwear', 'accessories'],
    ethnic: ['accessories', 'footwear'],
    luxury: ['accessories'],
    accessories: ['casual', 'formal', 'streetwear', 'ethnic'],
    footwear: ['casual', 'formal', 'streetwear', 'ethnic'],
    kids: ['accessories', 'footwear'],
    other: ['accessories', 'footwear']
  };

  const complementaryCategories = complementaryMap[outfit.category] || [];

  // Find outfits in complementary categories
  // Exclude same partner (different brands = diverse look)
  const suggestions = await OutfitItem.find({
    isActive: true,
    _id: { $ne: outfitId },
    $or: [
      // Same category with overlapping tags
      {
        category: outfit.category,
        tags: { $in: outfit.tags || [] },
        partner: { $ne: outfit.partner }
      },
      // Complementary categories
      {
        category: { $in: complementaryCategories }
      }
    ]
  })
    .sort({ likesCount: -1, viewsCount: -1 })
    .limit(limit)
    .populate('partner', 'brandName logo')
    .select('title video.thumbnailUrl price category tags partner');

  return suggestions;
};
