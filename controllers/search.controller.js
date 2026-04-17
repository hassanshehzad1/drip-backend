/**
 * @file search.controller.js
 * @description Search and filter controller —
 * full-text search, filters, trending tags,
 * partner search, category browsing
 * @module SearchController
 */

const mongoose = require('mongoose');
const OutfitItem = require('../models/OutfitItem');
const FashionPartner = require('../models/FashionPartner');
const Follow = require('../models/Follow');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');
const sendResponse = require('../utils/sendResponse');
const getPagination = require('../utils/pagination');
const logger = require('../config/logger');

/**
 * @description Valid outfit categories
 */
const VALID_CATEGORIES = [
  'casual', 'formal', 'streetwear', 'sportswear',
  'ethnic', 'luxury', 'accessories', 'footwear', 'kids', 'other'
];

/**
 * @description Full-text + filter search for outfits
 * Supports keyword, category, price, size, partner filters
 * Supports multiple sort options
 * @route GET /api/search
 * @access Public
 */
exports.searchOutfits = catchAsync(async (req, res, next) => {
  const { q, category, minPrice, maxPrice, size, partner, sort = 'newest' } = req.query;
  const { page, limit, skip } = getPagination(req.query);

  // Build query object
  const query = { isActive: true };

  // Text search
  if (q && q.trim()) {
    query.$text = { $search: q.trim() };
  }

  // Category filter
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

  // Size filter
  if (size) {
    query.sizes = { $in: [size] };
  }

  // Partner filter
  if (partner) {
    if (!mongoose.Types.ObjectId.isValid(partner)) {
      return next(new AppError('Invalid partner ID', 400));
    }
    query.partner = partner;
  }

  // Sort options
  const sortOptions = {
    newest: { createdAt: -1 },
    oldest: { createdAt: 1 },
    price_asc: { price: 1 },
    price_desc: { price: -1 },
    popular: { likesCount: -1 },
    trending: { viewsCount: -1 }
  };
  const sortBy = sortOptions[sort] || sortOptions.newest;

  let results;

  if (q && q.trim()) {
    /**
     * @description Aggregation pipeline for text search with relevance scoring
     * Stage 1: Match outfits using text index
     * Stage 2: Add text relevance score
     * Stage 3: Sort by relevance first, then by selected sort
     * Stage 4-5: Skip and limit for pagination
     * Stage 6: Lookup partner details
     * Stage 7: Unwind the partner array
     * Stage 8: Project only needed fields
     */
    results = await OutfitItem.aggregate([
      { $match: { ...query, $text: { $search: q.trim() } } },
      { $addFields: { score: { $meta: 'textScore' } } },
      { $sort: { score: -1, ...sortBy } },
      { $skip: skip },
      { $limit: limit },
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
          description: 1,
          video: 1,
          images: 1,
          price: 1,
          originalPrice: 1,
          currency: 1,
          category: 1,
          tags: 1,
          sizes: 1,
          likesCount: 1,
          viewsCount: 1,
          bookmarksCount: 1,
          isInStock: 1,
          score: 1,
          createdAt: 1,
          'partner.brandName': 1,
          'partner.logo': 1,
          'partner.category': 1
        }
      }
    ]);
  } else {
    // Regular find without text search
    results = await OutfitItem.find(query)
      .populate('partner', 'brandName logo category')
      .sort(sortBy)
      .skip(skip)
      .limit(limit);
  }

  // Get total count
  const total = await OutfitItem.countDocuments(query);
  const totalPages = Math.ceil(total / limit);

  // logger.info(query);

  sendResponse(res, 200, 'Search results retrieved', {
    outfits: results,
    searchMeta: {
      query: q || null,
      filters: {
        category: category || null,
        minPrice: minPrice || null,
        maxPrice: maxPrice || null,
        size: size || null,
        partner: partner || null
      },
      sort,
      resultsCount: results.length
    }
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
 * @description Get trending tags from last 7 days
 * Uses MongoDB aggregation to count tag frequency
 * @route GET /api/search/trending
 * @access Public
 */
exports.getTrendingTags = catchAsync(async (req, res, next) => {
  // Calculate date 7 days ago
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  /**
   * @description Aggregation pipeline for trending tags
   * Stage 1: Match active outfits from last 7 days
   * Stage 2: Unwind tags array to process each tag individually
   * Stage 3: Group by tag, counting occurrences and aggregating metrics
   * Stage 4: Calculate trend score (count + views/10 + likes/5)
   * Stage 5: Sort by trend score descending
   * Stage 6: Limit to top 20
   * Stage 7: Format output with tag name and scores
   */
  let tags = await OutfitItem.aggregate([
    {
      $match: {
        isActive: true,
        createdAt: { $gte: sevenDaysAgo }
      }
    },
    { $unwind: '$tags' },
    {
      $group: {
        _id: '$tags',
        count: { $sum: 1 },
        totalViews: { $sum: '$viewsCount' },
        totalLikes: { $sum: '$likesCount' }
      }
    },
    {
      $addFields: {
        trendScore: {
          $add: [
            '$count',
            { $divide: ['$totalViews', 10] },
            { $divide: ['$totalLikes', 5] }
          ]
        }
      }
    },
    { $sort: { trendScore: -1 } },
    { $limit: 20 },
    {
      $project: {
        tag: '$_id',
        count: 1,
        trendScore: { $round: ['$trendScore', 1] },
        _id: 0
      }
    }
  ]);

  // Fall back to all-time tags if no recent tags
  if (tags.length === 0) {
    tags = await OutfitItem.aggregate([
      { $match: { isActive: true } },
      { $unwind: '$tags' },
      {
        $group: {
          _id: '$tags',
          count: { $sum: 1 },
          totalViews: { $sum: '$viewsCount' },
          totalLikes: { $sum: '$likesCount' }
        }
      },
      {
        $addFields: {
          trendScore: {
            $add: [
              '$count',
              { $divide: ['$totalViews', 10] },
              { $divide: ['$totalLikes', 5] }
            ]
          }
        }
      },
      { $sort: { trendScore: -1 } },
      { $limit: 20 },
      {
        $project: {
          tag: '$_id',
          count: 1,
          trendScore: { $round: ['$trendScore', 1] },
          _id: 0
        }
      }
    ]);
  }

  sendResponse(res, 200, 'Trending tags retrieved', {
    tags,
    generatedAt: new Date()
  });
});

/**
 * @description Search fashion partners by brand name
 * or category. Only returns approved partners.
 * @route GET /api/search/partners
 * @access Public
 */
exports.searchPartners = catchAsync(async (req, res, next) => {
  const { q, category, sort = 'popular' } = req.query;
  const { page, limit, skip } = getPagination(req.query);

  // Build query
  const query = { isApproved: true, isActive: true };

  // Keyword search with regex
  if (q && q.trim()) {
    const searchRegex = { $regex: q.trim(), $options: 'i' };
    query.$or = [
      { brandName: searchRegex },
      { description: searchRegex }
    ];
  }

  // Category filter
  if (category) {
    query.category = category;
  }

  // Sort options
  const sortOptions = {
    popular: { followersCount: -1 },
    newest: { createdAt: -1 },
    name_asc: { brandName: 1 }
  };
  const sortBy = sortOptions[sort] || sortOptions.popular;

  // Find partners (never return sensitive fields)
  const partners = await FashionPartner.find(query)
    .select('brandName logo coverImage description category socialLinks followersCount totalSales createdAt')
    .sort(sortBy)
    .skip(skip)
    .limit(limit);

  // Get total count
  const total = await FashionPartner.countDocuments(query);
  const totalPages = Math.ceil(total / limit);

  sendResponse(res, 200, 'Partners retrieved', { partners }, {
    page,
    limit,
    total,
    totalPages,
    hasNextPage: page < totalPages,
    hasPrevPage: page > 1
  });
});

/**
 * @description Browse all outfits in a specific category
 * with subcategory stats
 * @route GET /api/search/category/:category
 * @access Public
 */
exports.getByCategory = catchAsync(async (req, res, next) => {
  const { category } = req.params;
  const { sort = 'newest' } = req.query;
  const { page, limit, skip } = getPagination(req.query);

  // Validate category
  if (!VALID_CATEGORIES.includes(category)) {
    return next(new AppError('Invalid category', 400));
  }

  // Sort options
  const sortOptions = {
    newest: { createdAt: -1 },
    popular: { likesCount: -1 },
    price_asc: { price: 1 },
    price_desc: { price: -1 }
  };
  const sortBy = sortOptions[sort] || sortOptions.newest;

  // Get outfits in category
  const outfits = await OutfitItem.find({ category, isActive: true })
    .populate('partner', 'brandName logo')
    .sort(sortBy)
    .skip(skip)
    .limit(limit);

  // Get category stats
  /**
   * @description Aggregation for category statistics
   * Stage 1: Match outfits in category
   * Stage 2: Group all to calculate aggregate metrics
   */
  const statsResult = await OutfitItem.aggregate([
    { $match: { category, isActive: true } },
    {
      $group: {
        _id: null,
        totalOutfits: { $sum: 1 },
        avgPrice: { $avg: '$price' },
        minPrice: { $min: '$price' },
        maxPrice: { $max: '$price' },
        totalViews: { $sum: '$viewsCount' },
        totalLikes: { $sum: '$likesCount' }
      }
    }
  ]);

  const stats = statsResult[0] || {
    totalOutfits: 0,
    avgPrice: 0,
    minPrice: 0,
    maxPrice: 0,
    totalViews: 0,
    totalLikes: 0
  };

  // Get total count for pagination
  const total = await OutfitItem.countDocuments({ category, isActive: true });
  const totalPages = Math.ceil(total / limit);

  sendResponse(res, 200, 'Category outfits retrieved', {
    outfits,
    categoryStats: {
      category,
      totalOutfits: stats.totalOutfits,
      avgPrice: Math.round(stats.avgPrice),
      minPrice: stats.minPrice,
      maxPrice: stats.maxPrice,
      totalViews: stats.totalViews,
      totalLikes: stats.totalLikes
    }
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
 * @description Get search autocomplete suggestions
 * Returns matching outfit titles and tags
 * Used for search bar dropdown
 * @route GET /api/search/suggestions
 * @access Public
 */
exports.getSearchSuggestions = catchAsync(async (req, res, next) => {
  const { q, limit: suggestionLimit = 8 } = req.query;

  if (!q || q.trim().length < 2) {
    return next(new AppError('Search term must be at least 2 characters', 400));
  }

  const searchTerm = q.trim();
  const maxLimit = Math.min(Number(suggestionLimit) || 8, 15);

  /**
   * @description Parallel queries for suggestions
   * - titleMatches: Find outfits with titles matching search
   * - tagMatches: Aggregate to find popular matching tags
   */
  const [titleMatches, tagMatches] = await Promise.all([
    OutfitItem.find({
      isActive: true,
      title: { $regex: searchTerm, $options: 'i' }
    })
      .select('title category')
      .limit(5)
      .lean(),

    OutfitItem.aggregate([
      { $match: { isActive: true } },
      { $unwind: '$tags' },
      { $match: { tags: { $regex: searchTerm, $options: 'i' } } },
      { $group: { _id: '$tags', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 5 }
    ])
  ]);

  // Format suggestions
  let suggestions = [
    ...titleMatches.map(o => ({
      type: 'outfit',
      text: o.title,
      category: o.category
    })),
    ...tagMatches.map(t => ({
      type: 'tag',
      text: t._id,
      count: t.count
    }))
  ];

  // Remove duplicates by text
  const seen = new Set();
  suggestions = suggestions.filter(s => {
    if (seen.has(s.text)) return false;
    seen.add(s.text);
    return true;
  });

  // Limit results
  suggestions = suggestions.slice(0, maxLimit);

  sendResponse(res, 200, 'Suggestions retrieved', {
    suggestions,
    query: searchTerm
  });
});

/**
 * @description Get personalized outfit feed based on
 * user's style preferences and followed partners
 * @route GET /api/search/personalized
 * @access Private (User)
 */
exports.getPersonalizedFeed = catchAsync(async (req, res, next) => {
  const { page, limit, skip } = getPagination(req.query);

  // Get user's style preferences
  const stylePreferences = req.user.stylePreferences || [];

  // Get followed partner IDs
  const follows = await Follow.find({
    follower: req.user._id
  }).select('following');
  const followedPartnerIds = follows.map(f => f.following);

  // Build personalized query
  const query = { isActive: true };
  let isPersonalized = false;

  if (stylePreferences.length > 0 || followedPartnerIds.length > 0) {
    query.$or = [];
    isPersonalized = true;

    if (stylePreferences.length > 0) {
      query.$or.push(
        { category: { $in: stylePreferences } },
        { tags: { $in: stylePreferences } }
      );
    }

    if (followedPartnerIds.length > 0) {
      query.$or.push({ partner: { $in: followedPartnerIds } });
    }
  }

  // If no personalization data, fall back to newest outfits
  if (!isPersonalized) {
    logger.info(`Personalized feed requested but no preferences for user ${req.user._id}`);
  }

  // Get outfits
  const outfits = await OutfitItem.find(query)
    .populate('partner', 'brandName logo')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

  // Get total count
  const total = await OutfitItem.countDocuments(query);
  const totalPages = Math.ceil(total / limit);

  sendResponse(res, 200, isPersonalized ? 'Personalized feed retrieved' : 'Feed retrieved (no personalization available)', {
    outfits,
    isPersonalized
  }, {
    page,
    limit,
    total,
    totalPages,
    hasNextPage: page < totalPages,
    hasPrevPage: page > 1
  });
});
