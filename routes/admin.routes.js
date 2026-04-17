/**
 * @file admin.routes.js
 * @description Admin panel routes
 * All routes (except auth) require admin JWT
 * @module AdminRoutes
 */

const express = require('express');
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');

/**
 * Import admin authentication middleware
 */
const {
  protect,
  requirePermission,
  requireSuperAdmin
} = require('../middleware/authAdmin.middleware');

/**
 * Import admin controllers
 */
const {
  // Auth
  adminLogin,
  adminRefreshToken,
  adminLogout,
  // User management
  getAllUsers,
  getUserDetails,
  banUser,
  unbanUser,
  // Partner management
  getAllPartners,
  getPartnerDetails,
  approvePartner,
  rejectPartner,
  banPartner,
  unbanPartner,
  // Content moderation
  getAllOutfits,
  removeOutfit,
  getAllComments,
  removeComment,
  // Order management
  getAllOrders,
  getOrderDetails,
  // Analytics
  getPlatformAnalytics,
  // Admin management
  createAdmin,
  getAllAdmins,
  updateAdminPermissions
} = require('../controllers/admin.controller');

/**
 * Create router
 */
const router = express.Router();

/**
 * Strict rate limiter for auth endpoints
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 requests per 15 minutes
  message: {
    success: false,
    message: 'Too many login attempts. Please try again after 15 minutes.'
  }
});

/**
 * @description Validation array for admin login
 */
const loginValidation = [
  body('email')
    .isEmail()
    .withMessage('Valid email is required')
    .normalizeEmail(),
  body('password')
    .notEmpty()
    .withMessage('Password is required')
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

// ============================================
// AUTH ROUTES (no protect needed)
// ============================================

/**
 * @route POST /api/admin/login
 * @description Admin login
 * @access Public (rate limited)
 */
router.post('/login', authLimiter, loginValidation, validateRequest, adminLogin);

/**
 * @route POST /api/admin/refresh
 * @description Refresh admin access token
 * @access Public
 */
router.post('/refresh', adminRefreshToken);

/**
 * @route POST /api/admin/logout
 * @description Admin logout
 * @access Private (Admin)
 */
router.post('/logout', protect, adminLogout);

// ============================================
// USER MANAGEMENT ROUTES
// ============================================

/**
 * @route GET /api/admin/users
 * @description Get all users
 * @access Private (Admin with manage_users permission)
 */
router.get(
  '/users',
  protect,
  requirePermission('manage_users'),
  getAllUsers
);

/**
 * @route GET /api/admin/users/:userId
 * @description Get user details
 * @access Private (Admin with manage_users permission)
 */
router.get(
  '/users/:userId',
  protect,
  requirePermission('manage_users'),
  getUserDetails
);

/**
 * @route PATCH /api/admin/users/:userId/ban
 * @description Ban a user
 * @access Private (Admin with manage_users permission)
 */
router.patch(
  '/users/:userId/ban',
  protect,
  requirePermission('manage_users'),
  banUser
);

/**
 * @route PATCH /api/admin/users/:userId/unban
 * @description Unban a user
 * @access Private (Admin with manage_users permission)
 */
router.patch(
  '/users/:userId/unban',
  protect,
  requirePermission('manage_users'),
  unbanUser
);

// ============================================
// PARTNER MANAGEMENT ROUTES
// ============================================

/**
 * @route GET /api/admin/partners
 * @description Get all partners
 * @access Private (Admin with manage_partners permission)
 */
router.get(
  '/partners',
  protect,
  requirePermission('manage_partners'),
  getAllPartners
);

/**
 * @route GET /api/admin/partners/:partnerId
 * @description Get partner details
 * @access Private (Admin with manage_partners permission)
 */
router.get(
  '/partners/:partnerId',
  protect,
  requirePermission('manage_partners'),
  getPartnerDetails
);

/**
 * @route PATCH /api/admin/partners/:partnerId/approve
 * @description Approve a partner
 * @access Private (Admin with manage_partners permission)
 */
router.patch(
  '/partners/:partnerId/approve',
  protect,
  requirePermission('manage_partners'),
  approvePartner
);

/**
 * @route PATCH /api/admin/partners/:partnerId/reject
 * @description Reject a partner
 * @access Private (Admin with manage_partners permission)
 */
router.patch(
  '/partners/:partnerId/reject',
  protect,
  requirePermission('manage_partners'),
  rejectPartner
);

/**
 * @route PATCH /api/admin/partners/:partnerId/ban
 * @description Ban a partner
 * @access Private (Admin with manage_partners permission)
 */
router.patch(
  '/partners/:partnerId/ban',
  protect,
  requirePermission('manage_partners'),
  banPartner
);

/**
 * @route PATCH /api/admin/partners/:partnerId/unban
 * @description Unban a partner
 * @access Private (Admin with manage_partners permission)
 */
router.patch(
  '/partners/:partnerId/unban',
  protect,
  requirePermission('manage_partners'),
  unbanPartner
);

// ============================================
// CONTENT MODERATION ROUTES
// ============================================

/**
 * @route GET /api/admin/outfits
 * @description Get all outfits for moderation
 * @access Private (Admin with manage_content permission)
 */
router.get(
  '/outfits',
  protect,
  requirePermission('manage_content'),
  getAllOutfits
);

/**
 * @route DELETE /api/admin/outfits/:outfitId
 * @description Remove an outfit permanently
 * @access Private (Admin with manage_content permission)
 */
router.delete(
  '/outfits/:outfitId',
  protect,
  requirePermission('manage_content'),
  removeOutfit
);

/**
 * @route GET /api/admin/comments
 * @description Get all comments for moderation
 * @access Private (Admin with manage_content permission)
 */
router.get(
  '/comments',
  protect,
  requirePermission('manage_content'),
  getAllComments
);

/**
 * @route DELETE /api/admin/comments/:commentId
 * @description Remove a comment
 * @access Private (Admin with manage_content permission)
 */
router.delete(
  '/comments/:commentId',
  protect,
  requirePermission('manage_content'),
  removeComment
);

// ============================================
// ORDER MANAGEMENT ROUTES
// ============================================

/**
 * @route GET /api/admin/orders
 * @description Get all orders
 * @access Private (Admin with manage_orders permission)
 */
router.get(
  '/orders',
  protect,
  requirePermission('manage_orders'),
  getAllOrders
);

/**
 * @route GET /api/admin/orders/:orderId
 * @description Get order details
 * @access Private (Admin with manage_orders permission)
 */
router.get(
  '/orders/:orderId',
  protect,
  requirePermission('manage_orders'),
  getOrderDetails
);

// ============================================
// ANALYTICS ROUTES
// ============================================

/**
 * @route GET /api/admin/analytics
 * @description Get platform analytics
 * @access Private (Admin with view_analytics permission)
 */
router.get(
  '/analytics',
  protect,
  requirePermission('view_analytics'),
  getPlatformAnalytics
);

// ============================================
// ADMIN MANAGEMENT ROUTES (SUPERADMIN ONLY)
// ============================================

/**
 * @route GET /api/admin/admins
 * @description Get all admins
 * @access Private (Superadmin only)
 */
router.get('/admins', protect, requireSuperAdmin, getAllAdmins);

/**
 * @route POST /api/admin/admins
 * @description Create new admin
 * @access Private (Superadmin only)
 */
router.post('/admins', protect, requireSuperAdmin, createAdmin);

/**
 * @route PATCH /api/admin/admins/:adminId
 * @description Update admin permissions
 * @access Private (Superadmin only)
 */
router.patch('/admins/:adminId', protect, requireSuperAdmin, updateAdminPermissions);

module.exports = router;
