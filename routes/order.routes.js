/**
 * @file order.routes.js
 * @description Order management routes
 * @module OrderRoutes
 */

const express = require('express');
const { body, validationResult } = require('express-validator');

/**
 * Import controllers
 */
const {
  checkout,
  stripeWebhook,
  getUserOrders,
  getSingleOrder,
  getPartnerOrders,
  updateOrderStatus,
  cancelOrder,
  getOrderStats
} = require('../controllers/order.controller');

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
 * @description Validation array for checkout
 */
const checkoutValidation = [
  body('deliveryAddress.fullName')
    .notEmpty()
    .withMessage('Full name is required'),
  body('deliveryAddress.phone')
    .notEmpty()
    .withMessage('Phone number is required'),
  body('deliveryAddress.addressLine1')
    .notEmpty()
    .withMessage('Address is required'),
  body('deliveryAddress.city')
    .notEmpty()
    .withMessage('City is required'),
  body('deliveryAddress.province')
    .notEmpty()
    .withMessage('Province is required'),
  body('deliveryAddress.postalCode')
    .notEmpty()
    .withMessage('Postal code is required'),
  body('paymentMethod')
    .optional()
    .isIn(['stripe', 'cod'])
    .withMessage('Payment method must be stripe or cod')
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
 * @route POST /api/order/webhook
 * @description Handle Stripe webhook events
 * IMPORTANT: This route uses express.raw() middleware
 * not express.json() to preserve raw body for signature verification
 * @access Public (Stripe webhook)
 */
router.post(
  '/webhook',
  express.raw({ type: 'application/json' }),
  stripeWebhook
);

/**
 * @route POST /api/order/checkout
 * @description Create order from cart and initialize Stripe payment
 * @access Private (User)
 */
router.post(
  '/checkout',
  protectUser,
  checkoutValidation,
  validateRequest,
  checkout
);

/**
 * @route GET /api/order/my-orders
 * @description Get user's order history
 * @access Private (User)
 */
router.get('/my-orders', protectUser, getUserOrders);

/**
 * @route GET /api/order/partner-orders
 * @description Get all orders for partner's products
 * @access Private (Partner)
 */
router.get('/partner-orders', protectPartner, getPartnerOrders);

/**
 * @route GET /api/order/partner-stats
 * @description Get order statistics for partner dashboard
 * @access Private (Partner)
 */
router.get('/partner-stats', protectPartner, getOrderStats);

/**
 * @route GET /api/order/:orderId
 * @description Get full details of a single order
 * @access Private (User)
 */
router.get('/:orderId', protectUser, getSingleOrder);

/**
 * @route PATCH /api/order/:orderId/status
 * @description Partner updates order delivery status
 * @access Private (Partner)
 */
router.patch('/:orderId/status', protectPartner, updateOrderStatus);

/**
 * @route PATCH /api/order/:orderId/cancel
 * @description User cancels their order
 * @access Private (User)
 */
router.patch('/:orderId/cancel', protectUser, cancelOrder);

module.exports = router;
