/**
 * @file cart.controller.js
 * @description Shopping cart operations —
 * add, update, remove items, view cart, clear cart
 * @module CartController
 */

const mongoose = require('mongoose');
const Cart = require('../models/Cart');
const OutfitItem = require('../models/OutfitItem');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');
const sendResponse = require('../utils/sendResponse');
const logger = require('../config/logger');

/**
 * @description Get current user's cart
 * Creates empty cart if none exists
 * @route GET /api/cart
 * @access Private (User)
 */
exports.getCart = catchAsync(async (req, res, next) => {
  let cart = await Cart.findOne({ user: req.user._id })
    .populate('items.outfit', 'title video.thumbnailUrl price isActive stock partner');

  if (!cart) {
    cart = await Cart.create({
      user: req.user._id,
      items: []
    });
    logger.info(`New cart created for user ${req.user._id}`);
  }

  // Filter out items where outfit was deleted
  cart.items = cart.items.filter(item => item.outfit !== null);

  sendResponse(res, 200, 'Cart retrieved successfully', {
    cart,
    itemCount: cart.getItemCount()
  });
});

/**
 * @description Add outfit to cart or increase quantity
 * Validates stock availability and size
 * @route POST /api/cart/add
 * @access Private (User)
 */
exports.addToCart = catchAsync(async (req, res, next) => {
  const { outfitId, size, color, quantity = 1 } = req.body;

  // Validate outfitId
  if (!outfitId || !mongoose.Types.ObjectId.isValid(outfitId)) {
    return next(new AppError('Valid outfit ID is required', 400));
  }

  // Validate size
  if (!size) {
    return next(new AppError('Size is required', 400));
  }

  // Find active outfit
  const outfit = await OutfitItem.findOne({ _id: outfitId, isActive: true });
  if (!outfit) {
    return next(new AppError('Outfit not found or unavailable', 404));
  }

  // Validate size is available
  if (!outfit.sizes.includes(size)) {
    return next(new AppError(`Size ${size} is not available for this outfit`, 400));
  }

  // Check stock availability
  if (outfit.stock < quantity) {
    return next(new AppError(`Only ${outfit.stock} items in stock`, 400));
  }

  // Find or create cart
  let cart = await Cart.findOne({ user: req.user._id });
  if (!cart) {
    cart = await Cart.create({ user: req.user._id, items: [] });
  }

  // Check if same outfit + size combo already in cart
  const existingItemIndex = cart.items.findIndex(
    item => item.outfit.toString() === outfitId && item.size === size
  );

  if (existingItemIndex !== -1) {
    // Update quantity of existing item
    const newQuantity = Math.min(
      cart.items[existingItemIndex].quantity + quantity,
      10
    );
    cart.items[existingItemIndex].quantity = newQuantity;
  } else {
    // Add new item to cart
    cart.items.push({
      outfit: outfitId,
      size,
      color: color || '',
      quantity: Math.min(quantity, 10),
      priceAtAdd: outfit.price,
      outfitSnapshot: {
        title: outfit.title,
        thumbnailUrl: outfit.video?.thumbnailUrl || '',
        partnerName: '',
        category: outfit.category
      }
    });
  }

  // Save cart (pre-save hook calculates totalAmount)
  await cart.save();

  // Populate and return updated cart
  await cart.populate('items.outfit', 'title video.thumbnailUrl price isActive stock partner');
  cart.items = cart.items.filter(item => item.outfit !== null);

  sendResponse(res, 200, 'Item added to cart', {
    cart,
    itemCount: cart.getItemCount()
  });
});

/**
 * @description Update quantity of a cart item
 * @route PATCH /api/cart/item/:itemId
 * @access Private (User)
 */
exports.updateCartItem = catchAsync(async (req, res, next) => {
  const { itemId } = req.params;
  const { quantity } = req.body;

  // Validate quantity
  if (!quantity || quantity < 1 || quantity > 10) {
    return next(new AppError('Quantity must be between 1 and 10', 400));
  }

  // Find cart
  const cart = await Cart.findOne({ user: req.user._id });
  if (!cart) {
    return next(new AppError('Cart not found', 404));
  }

  // Find item in cart
  const item = cart.items.id(itemId);
  if (!item) {
    return next(new AppError('Cart item not found', 404));
  }

  // Check stock availability for new quantity
  const outfit = await OutfitItem.findById(item.outfit);
  if (!outfit || outfit.stock < quantity) {
    return next(new AppError(`Only ${outfit?.stock || 0} items in stock`, 400));
  }

  // Update quantity
  item.quantity = quantity;
  await cart.save();

  // Populate and return
  await cart.populate('items.outfit', 'title video.thumbnailUrl price isActive stock partner');
  cart.items = cart.items.filter(item => item.outfit !== null);

  sendResponse(res, 200, 'Cart item updated', {
    cart,
    itemCount: cart.getItemCount()
  });
});

/**
 * @description Remove a single item from cart
 * @route DELETE /api/cart/item/:itemId
 * @access Private (User)
 */
exports.removeFromCart = catchAsync(async (req, res, next) => {
  const { itemId } = req.params;

  // Find cart
  const cart = await Cart.findOne({ user: req.user._id });
  if (!cart) {
    return next(new AppError('Cart not found', 404));
  }

  // Find item index
  const itemIndex = cart.items.findIndex(
    item => item._id.toString() === itemId
  );

  if (itemIndex === -1) {
    return next(new AppError('Cart item not found', 404));
  }

  // Remove item
  cart.items.splice(itemIndex, 1);
  await cart.save();

  // Populate and return
  await cart.populate('items.outfit', 'title video.thumbnailUrl price isActive stock partner');
  cart.items = cart.items.filter(item => item.outfit !== null);

  sendResponse(res, 200, 'Item removed from cart', {
    cart,
    itemCount: cart.getItemCount()
  });
});

/**
 * @description Remove all items from cart
 * @route DELETE /api/cart/clear
 * @access Private (User)
 */
exports.clearCart = catchAsync(async (req, res, next) => {
  const cart = await Cart.findOne({ user: req.user._id });

  if (!cart) {
    return sendResponse(res, 200, 'Cart cleared successfully', {
      cart: { items: [], totalAmount: 0 },
      itemCount: 0
    });
  }

  cart.items = [];
  await cart.save();

  sendResponse(res, 200, 'Cart cleared successfully', {
    cart,
    itemCount: 0
  });
});
