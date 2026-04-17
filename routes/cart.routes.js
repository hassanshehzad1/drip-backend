/**
 * @file cart.routes.js
 * @description Shopping cart routes
 * @module CartRoutes
 */

const express = require('express');
const { body, validationResult } = require('express-validator');

/**
 * Import controllers
 */
const {
  getCart,
  addToCart,
  updateCartItem,
  removeFromCart,
  clearCart
} = require('../controllers/cart.controller');

/**
 * Import auth middleware
 */
const { protect: protectUser } = require('../middleware/authUser.middleware');

/**
 * Create router
 */
const router = express.Router();

/**
 * @description Validation array for adding to cart
 */
const addToCartValidation = [
  body('outfitId')
    .notEmpty()
    .withMessage('Outfit ID is required')
    .isMongoId()
    .withMessage('Invalid outfit ID'),
  body('size')
    .notEmpty()
    .withMessage('Size is required'),
  body('quantity')
    .optional()
    .isInt({ min: 1, max: 10 })
    .withMessage('Quantity must be between 1 and 10')
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
 * @route GET /api/cart
 * @description Get current user's cart
 * @access Private (User)
 */
router.get('/', protectUser, getCart);

/**
 * @route POST /api/cart/add
 * @description Add outfit to cart or increase quantity
 * @access Private (User)
 */
router.post(
  '/add',
  protectUser,
  addToCartValidation,
  validateRequest,
  addToCart
);

/**
 * @route PATCH /api/cart/item/:itemId
 * @description Update quantity of a cart item
 * @access Private (User)
 */
router.patch('/item/:itemId', protectUser, updateCartItem);

/**
 * @route DELETE /api/cart/item/:itemId
 * @description Remove a single item from cart
 * @access Private (User)
 */
router.delete('/item/:itemId', protectUser, removeFromCart);

/**
 * @route DELETE /api/cart/clear
 * @description Remove all items from cart
 * @access Private (User)
 */
router.delete('/clear', protectUser, clearCart);

module.exports = router;
