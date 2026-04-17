/**
 * @file admin.controller.js
 * @description Admin panel controller —
 * auth, user management, partner management,
 * content moderation, analytics
 * @module AdminController
 */

const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const Admin = require('../models/Admin');
const User = require('../models/User');
const FashionPartner = require('../models/FashionPartner');
const OutfitItem = require('../models/OutfitItem');
const Order = require('../models/Order');
const Comment = require('../models/Comment');
const Like = require('../models/Like');
const Bookmark = require('../models/Bookmark');
const Follow = require('../models/Follow');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');
const sendResponse = require('../utils/sendResponse');
const getPagination = require('../utils/pagination');
const { deleteFromImageKit } = require('../services/imagekit.service');
const { createAndSendNotification } = require('../services/socket.service');
const logger = require('../config/logger');

// ============================================
// ADMIN AUTH
// ============================================

/**
 * @description Admin login — separate from user/partner auth
 * @route POST /api/admin/login
 * @access Public (Admin only)
 */
exports.adminLogin = catchAsync(async (req, res, next) => {
  const { email, password } = req.body;

  // Validation
  if (!email || !password) {
    return next(new AppError('Email and password are required', 400));
  }

  // Find admin with password
  const admin = await Admin.findOne({ email }).select('+password');

  if (!admin) {
    return next(new AppError('Invalid credentials', 401));
  }

  // Check if active
  if (!admin.isActive) {
    return next(new AppError('Account deactivated. Contact superadmin.', 403));
  }

  // Compare password
  const isPasswordValid = await admin.comparePassword(password);
  if (!isPasswordValid) {
    return next(new AppError('Invalid credentials', 401));
  }

  // Generate tokens
  const accessToken = admin.generateAccessToken();
  const refreshToken = admin.generateRefreshToken();

  // Save refresh token
  admin.refreshToken = refreshToken;
  admin.lastLogin = new Date();
  await admin.save({ validateBeforeSave: false });

  // Set cookie
  res.cookie('adminRefreshToken', refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
  });

  logger.info(`Admin login: ${admin.email}`);

  sendResponse(res, 200, 'Admin login successful', {
    admin: {
      id: admin._id,
      name: admin.name,
      email: admin.email,
      role: admin.role,
      permissions: admin.permissions
    },
    accessToken
  });
});

/**
 * @description Refresh admin access token
 * @route POST /api/admin/refresh
 * @access Public (with refresh token)
 */
exports.adminRefreshToken = catchAsync(async (req, res, next) => {
  const token = req.cookies?.adminRefreshToken || req.body?.refreshToken;

  if (!token) {
    return next(new AppError('Refresh token required', 401));
  }

  // Verify token
  const decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET);

  if (decoded.role !== 'admin') {
    return next(new AppError('Invalid token', 403));
  }

  // Find admin
  const admin = await Admin.findById(decoded.id).select('+refreshToken');

  if (!admin || admin.refreshToken !== token || !admin.isActive) {
    return next(new AppError('Invalid or expired refresh token', 401));
  }

  // Generate new tokens
  const accessToken = admin.generateAccessToken();
  const refreshToken = admin.generateRefreshToken();

  // Save new refresh token
  admin.refreshToken = refreshToken;
  await admin.save({ validateBeforeSave: false });

  // Set new cookie
  res.cookie('adminRefreshToken', refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000
  });

  sendResponse(res, 200, 'Token refreshed', { accessToken });
});

/**
 * @description Admin logout
 * @route POST /api/admin/logout
 * @access Private (Admin)
 */
exports.adminLogout = catchAsync(async (req, res, next) => {
  // Clear refresh token from DB
  if (req.admin) {
    req.admin.refreshToken = null;
    await req.admin.save({ validateBeforeSave: false });
  }

  // Clear cookie
  res.cookie('adminRefreshToken', '', {
    httpOnly: true,
    expires: new Date(0)
  });

  sendResponse(res, 200, 'Admin logged out successfully');
});

// ============================================
// USER MANAGEMENT
// ============================================

/**
 * @description Get paginated list of all users
 * Supports search and filter
 * @route GET /api/admin/users
 * @access Private (Admin with manage_users permission)
 */
exports.getAllUsers = catchAsync(async (req, res, next) => {
  const { q, isActive, sort = 'newest', page, limit } = req.query;

  // Build query
  const query = {};

  if (q) {
    query.$or = [
      { name: { $regex: q, $options: 'i' } },
      { email: { $regex: q, $options: 'i' } }
    ];
  }

  if (isActive !== undefined) {
    query.isActive = isActive === 'true';
  }

  // Sort options
  const sortMap = {
    newest: { createdAt: -1 },
    oldest: { createdAt: 1 },
    name_asc: { name: 1 }
  };
  const sortOption = sortMap[sort] || sortMap.newest;

  const { page: pageNum, limit: limitNum, skip } = getPagination(req.query);

  // Find users
  const users = await User.find(query)
    .sort(sortOption)
    .skip(skip)
    .limit(limitNum)
    .select('-password -refreshToken -__v');

  // Get counts for each user
  const usersWithCounts = await Promise.all(
    users.map(async (user) => {
      const [ordersCount, likesCount, bookmarksCount] = await Promise.all([
        Order.countDocuments({ user: user._id }),
        Like.countDocuments({ user: user._id }),
        Bookmark.countDocuments({ user: user._id })
      ]);

      return {
        ...user.toObject(),
        ordersCount,
        likesCount,
        bookmarksCount
      };
    })
  );

  const total = await User.countDocuments(query);
  const totalPages = Math.ceil(total / limitNum);

  sendResponse(res, 200, 'Users retrieved', { users: usersWithCounts }, {
    page: pageNum,
    limit: limitNum,
    total,
    totalPages,
    hasNextPage: pageNum < totalPages,
    hasPrevPage: pageNum > 1
  });
});

/**
 * @description Get detailed info about specific user
 * @route GET /api/admin/users/:userId
 * @access Private (Admin with manage_users permission)
 */
exports.getUserDetails = catchAsync(async (req, res, next) => {
  const { userId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(userId)) {
    return next(new AppError('Invalid user ID', 400));
  }

  const user = await User.findById(userId).select('-password -refreshToken -__v');

  if (!user) {
    return next(new AppError('User not found', 404));
  }

  // Get user stats
  const [orders, likes, bookmarks, comments] = await Promise.all([
    Order.countDocuments({ user: userId }),
    Like.countDocuments({ user: userId }),
    Bookmark.countDocuments({ user: userId }),
    Comment.countDocuments({ user: userId, isActive: true })
  ]);

  sendResponse(res, 200, 'User details retrieved', {
    user: {
      ...user.toObject(),
      stats: { orders, likes, bookmarks, comments }
    }
  });
});

/**
 * @description Deactivate a user account
 * @route PATCH /api/admin/users/:userId/ban
 * @access Private (Admin with manage_users permission)
 */
exports.banUser = catchAsync(async (req, res, next) => {
  const { userId } = req.params;
  const { reason } = req.body;

  if (!mongoose.Types.ObjectId.isValid(userId)) {
    return next(new AppError('Invalid user ID', 400));
  }

  // Check if trying to ban an admin
  const isAdmin = await Admin.findById(userId);
  if (isAdmin) {
    return next(new AppError('Cannot ban another admin through user management', 403));
  }

  const user = await User.findById(userId);
  if (!user) {
    return next(new AppError('User not found', 404));
  }

  user.isActive = false;
  await user.save();

  // Send notification to user
  createAndSendNotification({
    recipient: userId,
    recipientModel: 'User',
    type: 'system',
    title: 'Account suspended',
    message: 'Your account has been suspended. Contact support for assistance.'
  }).catch(err => logger.warn(`Ban notification failed: ${err.message}`));

  logger.info(`User banned by ${req.admin.email}: ${user.email}${reason ? ` (Reason: ${reason})` : ''}`);

  sendResponse(res, 200, 'User suspended successfully', {
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      isActive: user.isActive
    }
  });
});

/**
 * @description Reactivate a user account
 * @route PATCH /api/admin/users/:userId/unban
 * @access Private (Admin with manage_users permission)
 */
exports.unbanUser = catchAsync(async (req, res, next) => {
  const { userId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(userId)) {
    return next(new AppError('Invalid user ID', 400));
  }

  const user = await User.findById(userId);
  if (!user) {
    return next(new AppError('User not found', 404));
  }

  user.isActive = true;
  await user.save();

  // Send notification
  createAndSendNotification({
    recipient: userId,
    recipientModel: 'User',
    type: 'system',
    title: 'Account restored',
    message: 'Your account has been reinstated. Welcome back to Drip!'
  }).catch(err => logger.warn(`Unban notification failed: ${err.message}`));

  logger.info(`User unbanned by ${req.admin.email}: ${user.email}`);

  sendResponse(res, 200, 'User reinstated successfully', {
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      isActive: user.isActive
    }
  });
});

// ============================================
// PARTNER MANAGEMENT
// ============================================

/**
 * @description Get all partners with approval status filter
 * @route GET /api/admin/partners
 * @access Private (Admin with manage_partners permission)
 */
exports.getAllPartners = catchAsync(async (req, res, next) => {
  const { isApproved, isActive, q, page, limit } = req.query;

  const query = {};

  if (isApproved !== undefined) {
    query.isApproved = isApproved === 'true';
  }

  if (isActive !== undefined) {
    query.isActive = isActive === 'true';
  }

  if (q) {
    query.$or = [
      { brandName: { $regex: q, $options: 'i' } },
      { email: { $regex: q, $options: 'i' } }
    ];
  }

  const { page: pageNum, limit: limitNum, skip } = getPagination(req.query);

  const partners = await FashionPartner.find(query)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limitNum)
    .select('-password -refreshToken -__v');

  // Add stats for each partner
  const partnersWithStats = await Promise.all(
    partners.map(async (partner) => {
      const [outfitsCount, ordersCount, revenue] = await Promise.all([
        OutfitItem.countDocuments({ partner: partner._id }),
        Order.countDocuments({ partner: partner._id }),
        Order.aggregate([
          { $match: { partner: partner._id, paymentStatus: 'paid' } },
          { $group: { _id: null, total: { $sum: '$totalAmount' } } }
        ])
      ]);

      return {
        ...partner.toObject(),
        outfitsCount,
        ordersCount,
        totalRevenue: revenue[0]?.total || 0
      };
    })
  );

  const total = await FashionPartner.countDocuments(query);
  const totalPages = Math.ceil(total / limitNum);

  sendResponse(res, 200, 'Partners retrieved', { partners: partnersWithStats }, {
    page: pageNum,
    limit: limitNum,
    total,
    totalPages,
    hasNextPage: pageNum < totalPages,
    hasPrevPage: pageNum > 1
  });
});

/**
 * @description Get detailed partner info
 * @route GET /api/admin/partners/:partnerId
 * @access Private (Admin with manage_partners permission)
 */
exports.getPartnerDetails = catchAsync(async (req, res, next) => {
  const { partnerId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(partnerId)) {
    return next(new AppError('Invalid partner ID', 400));
  }

  const partner = await FashionPartner.findById(partnerId)
    .select('-password -refreshToken -__v');

  if (!partner) {
    return next(new AppError('Partner not found', 404));
  }

  // Get stats
  const [outfits, orders, followers, revenue] = await Promise.all([
    OutfitItem.countDocuments({ partner: partnerId }),
    Order.countDocuments({ partner: partnerId }),
    Follow.countDocuments({ following: partnerId }),
    Order.aggregate([
      { $match: { partner: partnerId, paymentStatus: 'paid' } },
      { $group: { _id: null, total: { $sum: '$totalAmount' } } }
    ])
  ]);

  sendResponse(res, 200, 'Partner details retrieved', {
    partner: {
      ...partner.toObject(),
      stats: { outfits, orders, followers, revenue: revenue[0]?.total || 0 }
    }
  });
});

/**
 * @description Approve a fashion partner account
 * @route PATCH /api/admin/partners/:partnerId/approve
 * @access Private (Admin with manage_partners permission)
 */
exports.approvePartner = catchAsync(async (req, res, next) => {
  const { partnerId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(partnerId)) {
    return next(new AppError('Invalid partner ID', 400));
  }

  const partner = await FashionPartner.findById(partnerId);
  if (!partner) {
    return next(new AppError('Partner not found', 404));
  }

  if (partner.isApproved) {
    return next(new AppError('Partner already approved', 400));
  }

  partner.isApproved = true;
  partner.isActive = true;
  await partner.save();

  // Notify partner
  createAndSendNotification({
    recipient: partnerId,
    recipientModel: 'FashionPartner',
    type: 'system',
    title: 'Account approved!',
    message: 'Congratulations! Your Drip partner account has been approved. You can now upload outfits.'
  }).catch(err => logger.warn(`Approve notification failed: ${err.message}`));

  logger.info(`Partner approved by ${req.admin.email}: ${partner.email}`);

  sendResponse(res, 200, 'Partner approved successfully', {
    partner: {
      id: partner._id,
      brandName: partner.brandName,
      email: partner.email,
      isApproved: partner.isApproved,
      isActive: partner.isActive
    }
  });
});

/**
 * @description Reject a partner application
 * @route PATCH /api/admin/partners/:partnerId/reject
 * @access Private (Admin with manage_partners permission)
 */
exports.rejectPartner = catchAsync(async (req, res, next) => {
  const { partnerId } = req.params;
  const { reason } = req.body;

  if (!mongoose.Types.ObjectId.isValid(partnerId)) {
    return next(new AppError('Invalid partner ID', 400));
  }

  if (!reason) {
    return next(new AppError('Reason is required', 400));
  }

  const partner = await FashionPartner.findById(partnerId);
  if (!partner) {
    return next(new AppError('Partner not found', 404));
  }

  partner.isApproved = false;
  partner.isActive = false;
  await partner.save();

  // Notify partner
  createAndSendNotification({
    recipient: partnerId,
    recipientModel: 'FashionPartner',
    type: 'system',
    title: 'Application rejected',
    message: `Your partner application was rejected. Reason: ${reason}`
  }).catch(err => logger.warn(`Reject notification failed: ${err.message}`));

  logger.info(`Partner rejected by ${req.admin.email}: ${partner.email} (Reason: ${reason})`);

  sendResponse(res, 200, 'Partner rejected successfully', {
    partner: {
      id: partner._id,
      brandName: partner.brandName,
      isApproved: partner.isApproved,
      isActive: partner.isActive
    }
  });
});

/**
 * @description Ban a partner account
 * @route PATCH /api/admin/partners/:partnerId/ban
 * @access Private (Admin with manage_partners permission)
 */
exports.banPartner = catchAsync(async (req, res, next) => {
  const { partnerId } = req.params;
  const { reason } = req.body;

  if (!mongoose.Types.ObjectId.isValid(partnerId)) {
    return next(new AppError('Invalid partner ID', 400));
  }

  const partner = await FashionPartner.findById(partnerId);
  if (!partner) {
    return next(new AppError('Partner not found', 404));
  }

  partner.isActive = false;
  await partner.save();

  // Notify partner
  createAndSendNotification({
    recipient: partnerId,
    recipientModel: 'FashionPartner',
    type: 'system',
    title: 'Account suspended',
    message: `Your partner account has been suspended.${reason ? ` Reason: ${reason}` : ''}`
  }).catch(err => logger.warn(`Ban notification failed: ${err.message}`));

  logger.info(`Partner banned by ${req.admin.email}: ${partner.email}${reason ? ` (Reason: ${reason})` : ''}`);

  sendResponse(res, 200, 'Partner suspended successfully', {
    partner: {
      id: partner._id,
      brandName: partner.brandName,
      isActive: partner.isActive
    }
  });
});

/**
 * @description Unban a partner account
 * @route PATCH /api/admin/partners/:partnerId/unban
 * @access Private (Admin with manage_partners permission)
 */
exports.unbanPartner = catchAsync(async (req, res, next) => {
  const { partnerId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(partnerId)) {
    return next(new AppError('Invalid partner ID', 400));
  }

  const partner = await FashionPartner.findById(partnerId);
  if (!partner) {
    return next(new AppError('Partner not found', 404));
  }

  // Only unban if already approved
  if (!partner.isApproved) {
    return next(new AppError('Partner must be approved before reactivating', 400));
  }

  partner.isActive = true;
  await partner.save();

  // Notify partner
  createAndSendNotification({
    recipient: partnerId,
    recipientModel: 'FashionPartner',
    type: 'system',
    title: 'Account restored',
    message: 'Your partner account has been reinstated. You can resume operations.'
  }).catch(err => logger.warn(`Unban notification failed: ${err.message}`));

  logger.info(`Partner unbanned by ${req.admin.email}: ${partner.email}`);

  sendResponse(res, 200, 'Partner reinstated successfully', {
    partner: {
      id: partner._id,
      brandName: partner.brandName,
      isActive: partner.isActive
    }
  });
});

// ============================================
// CONTENT MODERATION
// ============================================

/**
 * @description Get all outfits for moderation
 * @route GET /api/admin/outfits
 * @access Private (Admin with manage_content permission)
 */
exports.getAllOutfits = catchAsync(async (req, res, next) => {
  const { isActive, partner, category, q, page, limit } = req.query;

  const query = {};

  if (isActive !== undefined) {
    query.isActive = isActive === 'true';
  }

  if (partner && mongoose.Types.ObjectId.isValid(partner)) {
    query.partner = partner;
  }

  if (category) {
    query.category = category;
  }

  if (q) {
    query.title = { $regex: q, $options: 'i' };
  }

  const { page: pageNum, limit: limitNum, skip } = getPagination(req.query);

  const outfits = await OutfitItem.find(query)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limitNum)
    .populate('partner', 'brandName email');

  const total = await OutfitItem.countDocuments(query);
  const totalPages = Math.ceil(total / limitNum);

  sendResponse(res, 200, 'Outfits retrieved', { outfits }, {
    page: pageNum,
    limit: limitNum,
    total,
    totalPages,
    hasNextPage: pageNum < totalPages,
    hasPrevPage: pageNum > 1
  });
});

/**
 * @description Admin removes an outfit (permanent)
 * Deletes from DB + ImageKit CDN
 * @route DELETE /api/admin/outfits/:outfitId
 * @access Private (Admin with manage_content permission)
 */
exports.removeOutfit = catchAsync(async (req, res, next) => {
  const { outfitId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(outfitId)) {
    return next(new AppError('Invalid outfit ID', 400));
  }

  const outfit = await OutfitItem.findById(outfitId).populate('partner', 'brandName');
  if (!outfit) {
    return next(new AppError('Outfit not found', 404));
  }

  const outfitTitle = outfit.title;
  const partnerId = outfit.partner?._id;
  const partnerName = outfit.partner?.brandName;

  // Delete video from ImageKit
  if (outfit.video?.fileId) {
    await deleteFromImageKit(outfit.video.fileId).catch(err =>
      logger.warn(`Failed to delete video from ImageKit: ${err.message}`)
    );
  }

  // Delete images from ImageKit
  if (outfit.images?.length) {
    await Promise.all(
      outfit.images.map(img =>
        deleteFromImageKit(img.fileId).catch(err =>
          logger.warn(`Failed to delete image: ${err.message}`)
        )
      )
    );
  }

  // Delete outfit from DB
  await outfit.deleteOne();

  // Notify partner
  if (partnerId) {
    createAndSendNotification({
      recipient: partnerId,
      recipientModel: 'FashionPartner',
      type: 'system',
      title: 'Outfit removed',
      message: `Your outfit "${outfitTitle}" has been removed for policy violation.`
    }).catch(err => logger.warn(`Outfit removal notification failed: ${err.message}`));
  }

  logger.info(`Outfit removed by ${req.admin.email}: "${outfitTitle}" (Partner: ${partnerName || 'Unknown'})`);

  sendResponse(res, 200, 'Outfit removed successfully');
});

/**
 * @description Get all comments for moderation
 * @route GET /api/admin/comments
 * @access Private (Admin with manage_content permission)
 */
exports.getAllComments = catchAsync(async (req, res, next) => {
  const { outfitId, isActive, page, limit } = req.query;

  const query = {};

  if (outfitId && mongoose.Types.ObjectId.isValid(outfitId)) {
    query.outfit = outfitId;
  }

  if (isActive !== undefined) {
    query.isActive = isActive === 'true';
  }

  const { page: pageNum, limit: limitNum, skip } = getPagination(req.query);

  const comments = await Comment.find(query)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limitNum)
    .populate('user', 'name email')
    .populate('outfit', 'title');

  const total = await Comment.countDocuments(query);
  const totalPages = Math.ceil(total / limitNum);

  sendResponse(res, 200, 'Comments retrieved', { comments }, {
    page: pageNum,
    limit: limitNum,
    total,
    totalPages,
    hasNextPage: pageNum < totalPages,
    hasPrevPage: pageNum > 1
  });
});

/**
 * @description Remove a comment (soft delete)
 * @route DELETE /api/admin/comments/:commentId
 * @access Private (Admin with manage_content permission)
 */
exports.removeComment = catchAsync(async (req, res, next) => {
  const { commentId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(commentId)) {
    return next(new AppError('Invalid comment ID', 400));
  }

  const comment = await Comment.findById(commentId);
  if (!comment) {
    return next(new AppError('Comment not found', 404));
  }

  comment.isActive = false;
  await comment.save();

  // Decrement outfit comments count
  await OutfitItem.findByIdAndUpdate(comment.outfit, {
    $inc: { commentsCount: -1 }
  });

  logger.info(`Comment removed by ${req.admin.email}: ${commentId}`);

  sendResponse(res, 200, 'Comment removed successfully');
});

// ============================================
// ORDER MANAGEMENT
// ============================================

/**
 * @description Get all orders
 * @route GET /api/admin/orders
 * @access Private (Admin with manage_orders permission)
 */
exports.getAllOrders = catchAsync(async (req, res, next) => {
  const { status, paymentStatus, partner, page, limit } = req.query;

  const query = {};

  if (status) {
    query.status = status;
  }

  if (paymentStatus) {
    query.paymentStatus = paymentStatus;
  }

  if (partner && mongoose.Types.ObjectId.isValid(partner)) {
    query.partner = partner;
  }

  const { page: pageNum, limit: limitNum, skip } = getPagination(req.query);

  const orders = await Order.find(query)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limitNum)
    .populate('user', 'name email')
    .populate('partner', 'brandName');

  const total = await Order.countDocuments(query);
  const totalPages = Math.ceil(total / limitNum);

  sendResponse(res, 200, 'Orders retrieved', { orders }, {
    page: pageNum,
    limit: limitNum,
    total,
    totalPages,
    hasNextPage: pageNum < totalPages,
    hasPrevPage: pageNum > 1
  });
});

/**
 * @description Get order details
 * @route GET /api/admin/orders/:orderId
 * @access Private (Admin with manage_orders permission)
 */
exports.getOrderDetails = catchAsync(async (req, res, next) => {
  const { orderId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(orderId)) {
    return next(new AppError('Invalid order ID', 400));
  }

  const order = await Order.findById(orderId)
    .populate('user', 'name email phone')
    .populate('partner', 'brandName email')
    .populate('items.outfit', 'title video.thumbnailUrl');

  if (!order) {
    return next(new AppError('Order not found', 404));
  }

  sendResponse(res, 200, 'Order retrieved', { order });
});

// ============================================
// ANALYTICS
// ============================================

/**
 * @description Comprehensive platform analytics
 * @route GET /api/admin/analytics
 * @access Private (Admin with view_analytics permission)
 */
exports.getPlatformAnalytics = catchAsync(async (req, res, next) => {
  const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

  const [
    totalUsers,
    activeUsers,
    totalPartners,
    approvedPartners,
    totalOutfits,
    activeOutfits,
    totalOrders,
    paidOrders,
    totalRevenue,
    newUsersThisMonth,
    newPartnersThisMonth,
    ordersThisMonth,
    revenueThisMonth,
    topOutfits,
    topPartners,
    ordersByStatus,
    revenueByMonth
  ] = await Promise.all([
    // Count totals
    User.countDocuments({}),
    User.countDocuments({ isActive: true }),
    FashionPartner.countDocuments({}),
    FashionPartner.countDocuments({ isApproved: true }),
    OutfitItem.countDocuments({}),
    OutfitItem.countDocuments({ isActive: true }),
    Order.countDocuments({}),
    Order.countDocuments({ paymentStatus: 'paid' }),

    // Total revenue
    Order.aggregate([
      { $match: { paymentStatus: 'paid' } },
      { $group: { _id: null, total: { $sum: '$totalAmount' } } }
    ]),

    // This month stats
    User.countDocuments({ createdAt: { $gte: startOfMonth } }),
    FashionPartner.countDocuments({ createdAt: { $gte: startOfMonth } }),
    Order.countDocuments({ createdAt: { $gte: startOfMonth } }),
    Order.aggregate([
      { $match: { paymentStatus: 'paid', createdAt: { $gte: startOfMonth } } },
      { $group: { _id: null, total: { $sum: '$totalAmount' } } }
    ]),

    // Top 5 outfits by views
    OutfitItem.find({ isActive: true })
      .sort({ viewsCount: -1 })
      .limit(5)
      .select('title viewsCount likesCount partner')
      .populate('partner', 'brandName'),

    // Top 5 partners by followers
    FashionPartner.find({ isApproved: true })
      .sort({ followersCount: -1 })
      .limit(5)
      .select('brandName followersCount totalSales'),

    // Orders by status
    Order.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 }, revenue: { $sum: '$totalAmount' } } }
    ]),

    // Revenue last 6 months
    Order.aggregate([
      { $match: { paymentStatus: 'paid' } },
      {
        $group: {
          _id: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } },
          revenue: { $sum: '$totalAmount' },
          orders: { $sum: 1 }
        }
      },
      { $sort: { '_id.year': -1, '_id.month': -1 } },
      { $limit: 6 }
    ])
  ]);

  sendResponse(res, 200, 'Analytics retrieved', {
    overview: {
      totalUsers,
      activeUsers,
      totalPartners,
      approvedPartners,
      totalOutfits,
      activeOutfits,
      totalOrders,
      paidOrders,
      totalRevenue: totalRevenue[0]?.total || 0
    },
    thisMonth: {
      newUsers: newUsersThisMonth,
      newPartners: newPartnersThisMonth,
      orders: ordersThisMonth,
      revenue: revenueThisMonth[0]?.total || 0
    },
    topOutfits,
    topPartners,
    ordersByStatus,
    revenueByMonth: revenueByMonth.reverse()
  });
});

// ============================================
// ADMIN MANAGEMENT (SUPERADMIN ONLY)
// ============================================

/**
 * @description Superadmin creates new moderator admin
 * @route POST /api/admin/admins
 * @access Private (Superadmin only)
 */
exports.createAdmin = catchAsync(async (req, res, next) => {
  const { name, email, password, role, permissions } = req.body;

  // Validation
  if (!name || !email || !password) {
    return next(new AppError('Name, email, and password are required', 400));
  }

  // Check if email taken
  const existingAdmin = await Admin.findOne({ email });
  if (existingAdmin) {
    return next(new AppError('Email already in use by another admin', 400));
  }

  // Validate role
  if (role && !['superadmin', 'moderator'].includes(role)) {
    return next(new AppError('Role must be superadmin or moderator', 400));
  }

  // Create admin
  const newAdmin = await Admin.create({
    name,
    email,
    password,
    role: role || 'moderator',
    permissions: permissions || undefined // Will use defaults from pre-save
  });

  logger.info(`New admin created by ${req.admin.email}: ${email} (${role || 'moderator'})`);

  sendResponse(res, 201, 'Admin created successfully', {
    admin: {
      id: newAdmin._id,
      name: newAdmin.name,
      email: newAdmin.email,
      role: newAdmin.role,
      permissions: newAdmin.permissions,
      isActive: newAdmin.isActive
    }
  });
});

/**
 * @description Get all admins
 * @route GET /api/admin/admins
 * @access Private (Superadmin only)
 */
exports.getAllAdmins = catchAsync(async (req, res, next) => {
  const admins = await Admin.find()
    .sort({ createdAt: -1 })
    .select('-password -refreshToken -__v');

  sendResponse(res, 200, 'Admins retrieved', {
    admins,
    count: admins.length
  });
});

/**
 * @description Update admin permissions
 * @route PATCH /api/admin/admins/:adminId
 * @access Private (Superadmin only)
 */
exports.updateAdminPermissions = catchAsync(async (req, res, next) => {
  const { adminId } = req.params;
  const { permissions } = req.body;

  if (!mongoose.Types.ObjectId.isValid(adminId)) {
    return next(new AppError('Invalid admin ID', 400));
  }

  // Cannot update own permissions
  if (adminId === req.admin._id.toString()) {
    return next(new AppError('Cannot modify your own permissions', 400));
  }

  const admin = await Admin.findById(adminId);
  if (!admin) {
    return next(new AppError('Admin not found', 404));
  }

  // Validate permissions array
  const validPermissions = [
    'manage_users', 'manage_partners', 'manage_content',
    'manage_orders', 'view_analytics', 'manage_admins'
  ];

  if (permissions) {
    const invalidPerms = permissions.filter(p => !validPermissions.includes(p));
    if (invalidPerms.length > 0) {
      return next(new AppError(`Invalid permissions: ${invalidPerms.join(', ')}`, 400));
    }
    admin.permissions = permissions;
  }

  await admin.save();

  logger.info(`Admin permissions updated by ${req.admin.email}: ${admin.email}`);

  sendResponse(res, 200, 'Admin permissions updated', {
    admin: {
      id: admin._id,
      name: admin.name,
      email: admin.email,
      role: admin.role,
      permissions: admin.permissions
    }
  });
});
