/**
 * @file order.controller.js
 * @description Order management —
 * checkout, order history, status updates, cancellation
 * @module OrderController
 */

const mongoose = require('mongoose');
const Order = require('../models/Order');
const Cart = require('../models/Cart');
const OutfitItem = require('../models/OutfitItem');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');
const sendResponse = require('../utils/sendResponse');
const getPagination = require('../utils/pagination');
const {
  createPaymentIntent,
  constructWebhookEvent
} = require('../services/stripe.service');
const { trackInteraction } = require('../services/ai.service');
const logger = require('../config/logger');

/**
 * @description Create order from cart and initialize Stripe payment intent
 * @route POST /api/order/checkout
 * @access Private (User)
 */
exports.checkout = catchAsync(async (req, res, next) => {
  const { deliveryAddress, paymentMethod = 'stripe', notes = '' } = req.body;

  // Validate delivery address
  if (!deliveryAddress?.fullName || !deliveryAddress?.phone ||
      !deliveryAddress?.addressLine1 || !deliveryAddress?.city ||
      !deliveryAddress?.province || !deliveryAddress?.postalCode) {
    return next(new AppError('Complete delivery address is required', 400));
  }

  // Validate payment method
  if (!['stripe', 'cod'].includes(paymentMethod)) {
    return next(new AppError('Payment method must be stripe or cod', 400));
  }

  // Find user's cart with populated outfits
  const cart = await Cart.findOne({ user: req.user._id })
    .populate('items.outfit', 'title video.thumbnailUrl price isActive stock partner category');

  if (!cart || cart.items.length === 0) {
    return next(new AppError('Your cart is empty', 400));
  }

  // Validate all items still available and in stock
  for (const item of cart.items) {
    if (!item.outfit || !item.outfit.isActive) {
      return next(new AppError(
        `${item.outfitSnapshot?.title || 'Item'} is no longer available`,
        400
      ));
    }
    if (item.outfit.stock < item.quantity) {
      return next(new AppError(
        `Only ${item.outfit.stock} of ${item.outfit.title} available`,
        400
      ));
    }
  }

  // Get partner from first item (simplified: one order per partner)
  const partnerRef = cart.items[0].outfit.partner;

  // Calculate total
  const totalAmount = cart.totalAmount;

  let clientSecret = null;
  let paymentIntentId = null;

  // Create Stripe payment intent for card payments
  if (paymentMethod === 'stripe') {
    const paymentData = await createPaymentIntent(
      totalAmount,
      'pkr',
      {
        userId: req.user._id.toString(),
        userEmail: req.user.email,
        itemCount: cart.items.length
      }
    );
    clientSecret = paymentData.clientSecret;
    paymentIntentId = paymentData.paymentIntentId;
  }

  // Create order
  const order = await Order.create({
    user: req.user._id,
    partner: partnerRef,
    items: cart.items.map(item => ({
      outfit: item.outfit._id,
      size: item.size,
      color: item.color,
      quantity: item.quantity,
      price: item.priceAtAdd,
      outfitSnapshot: {
        title: item.outfit.title,
        thumbnailUrl: item.outfit.video?.thumbnailUrl || '',
        category: item.outfit.category
      }
    })),
    totalAmount,
    currency: cart.currency,
    deliveryAddress,
    paymentMethod,
    paymentIntentId: paymentIntentId || '',
    notes,
    estimatedDelivery: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
  });

  // Track interactions for AI scoring (fire and forget)
  cart.items.forEach(item => {
    trackInteraction(req.user._id, item.outfit._id, 'order')
      .catch(err => logger.warn(`AI track failed: ${err.message}`));
  });

  // For COD, payment status stays 'unpaid' until delivery
  if (paymentMethod === 'cod') {
    order.paymentStatus = 'unpaid';
    await order.save();
  }

  // Clear cart
  cart.items = [];
  await cart.save();

  logger.info(`Order ${order.orderNumber} created by user ${req.user._id}`);

  sendResponse(res, 201, paymentMethod === 'stripe'
    ? 'Order created. Complete payment to confirm.'
    : 'Order placed successfully. Pay on delivery.', {
    order: {
      _id: order._id,
      orderNumber: order.orderNumber,
      totalAmount: order.totalAmount,
      status: order.status
    },
    clientSecret,
    paymentIntentId
  });
});

/**
 * @description Handle Stripe webhook events
 * Updates order status on payment success/failure
 * @route POST /api/order/webhook
 * @access Public (Stripe webhook)
 */
exports.stripeWebhook = catchAsync(async (req, res, next) => {
  const signature = req.headers['stripe-signature'];

  if (!signature) {
    return res.status(400).json({ error: 'Missing stripe-signature header' });
  }

  // Construct event from raw body
  const event = constructWebhookEvent(req.body, signature);

  logger.info(`Stripe webhook received: ${event.type}`);

  switch (event.type) {
    case 'payment_intent.succeeded': {
      const paymentIntentId = event.data.object.id;
      const order = await Order.findOne({ paymentIntentId });

      if (order) {
        order.paymentStatus = 'paid';
        order.status = 'confirmed';
        await order.save();
        logger.info(`Payment succeeded for order ${order.orderNumber}`);
      }
      break;
    }

    case 'payment_intent.payment_failed': {
      const paymentIntentId = event.data.object.id;
      const order = await Order.findOne({ paymentIntentId });

      if (order) {
        order.paymentStatus = 'failed';
        order.status = 'cancelled';
        await order.save();
        logger.error(`Payment failed for order ${order.orderNumber}`);
      }
      break;
    }
  }

  // Always return 200 to Stripe
  res.json({ received: true });
});

/**
 * @description Get paginated order history for user
 * Supports status filter
 * @route GET /api/order/my-orders
 * @access Private (User)
 */
exports.getUserOrders = catchAsync(async (req, res, next) => {
  const { status } = req.query;
  const { page, limit, skip } = getPagination(req.query);

  const query = { user: req.user._id };
  if (status) {
    query.status = status;
  }

  const orders = await Order.find(query)
    .populate('partner', 'brandName logo')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

  const total = await Order.countDocuments(query);
  const totalPages = Math.ceil(total / limit);

  sendResponse(res, 200, 'Orders retrieved', { orders }, {
    page,
    limit,
    total,
    totalPages,
    hasNextPage: page < totalPages,
    hasPrevPage: page > 1
  });
});

/**
 * @description Get full details of a single order
 * @route GET /api/order/:orderId
 * @access Private (User)
 */
exports.getSingleOrder = catchAsync(async (req, res, next) => {
  const { orderId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(orderId)) {
    return next(new AppError('Invalid order ID', 400));
  }

  const order = await Order.findOne({
    _id: orderId,
    user: req.user._id
  }).populate('partner', 'brandName logo email phone');

  if (!order) {
    return next(new AppError('Order not found', 404));
  }

  sendResponse(res, 200, 'Order retrieved', { order });
});

/**
 * @description Get all orders for partner's products
 * Supports status filter and pagination
 * @route GET /api/order/partner-orders
 * @access Private (Partner)
 */
exports.getPartnerOrders = catchAsync(async (req, res, next) => {
  const { status } = req.query;
  const { page, limit, skip } = getPagination(req.query);

  const query = { partner: req.partner._id };
  if (status) {
    query.status = status;
  }

  const orders = await Order.find(query)
    .populate('user', 'name email avatar')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

  const total = await Order.countDocuments(query);
  const totalPages = Math.ceil(total / limit);

  sendResponse(res, 200, 'Partner orders retrieved', { orders }, {
    page,
    limit,
    total,
    totalPages,
    hasNextPage: page < totalPages,
    hasPrevPage: page > 1
  });
});

/**
 * @description Partner updates order delivery status
 * Only certain transitions are allowed
 * @route PATCH /api/order/:orderId/status
 * @access Private (Partner)
 */
exports.updateOrderStatus = catchAsync(async (req, res, next) => {
  const { orderId } = req.params;
  const { status, reason } = req.body;

  if (!mongoose.Types.ObjectId.isValid(orderId)) {
    return next(new AppError('Invalid order ID', 400));
  }

  const order = await Order.findOne({
    _id: orderId,
    partner: req.partner._id
  });

  if (!order) {
    return next(new AppError('Order not found', 404));
  }

  // Define allowed transitions
  const allowedTransitions = {
    confirmed: ['processing'],
    processing: ['shipped'],
    shipped: ['delivered']
  };

  const currentStatus = order.status;

  if (!allowedTransitions[currentStatus]) {
    return next(new AppError(`Cannot update order in ${currentStatus} status`, 400));
  }

  if (!allowedTransitions[currentStatus].includes(status)) {
    return next(new AppError(
      `Invalid status transition from ${currentStatus} to ${status}`,
      400
    ));
  }

  // Update status
  order.status = status;

  // Set deliveredAt timestamp
  if (status === 'delivered') {
    order.deliveredAt = new Date();
    // For COD, mark as paid on delivery
    if (order.paymentMethod === 'cod') {
      order.paymentStatus = 'paid';
    }
  }

  await order.save();

  logger.info(`Order ${order.orderNumber} status updated to ${status}`);

  sendResponse(res, 200, `Order status updated to ${status}`, { order });
});

/**
 * @description User cancels their own order
 * Only pending or confirmed orders can be cancelled
 * @route PATCH /api/order/:orderId/cancel
 * @access Private (User)
 */
exports.cancelOrder = catchAsync(async (req, res, next) => {
  const { orderId } = req.params;
  const { reason } = req.body;

  if (!mongoose.Types.ObjectId.isValid(orderId)) {
    return next(new AppError('Invalid order ID', 400));
  }

  const order = await Order.findOne({
    _id: orderId,
    user: req.user._id
  });

  if (!order) {
    return next(new AppError('Order not found', 404));
  }

  // Check cancellable statuses
  const cancellableStatuses = ['pending', 'confirmed'];
  if (!cancellableStatuses.includes(order.status)) {
    return next(new AppError(
      `Order cannot be cancelled at ${order.status} stage. Contact support for assistance.`,
      400
    ));
  }

  // Update order
  order.status = 'cancelled';
  order.cancelledAt = new Date();
  order.cancellationReason = reason || 'Cancelled by user';
  await order.save();

  logger.info(`Order ${order.orderNumber} cancelled by user ${req.user._id}`);

  sendResponse(res, 200, 'Order cancelled successfully', { order });
});

/**
 * @description Get order statistics for partner dashboard
 * @route GET /api/order/partner-stats
 * @access Private (Partner)
 */
exports.getOrderStats = catchAsync(async (req, res, next) => {
  // Aggregate by status
  const statusStats = await Order.aggregate([
    { $match: { partner: req.partner._id } },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
        revenue: { $sum: '$totalAmount' }
      }
    }
  ]);

  // Total orders
  const totalOrders = await Order.countDocuments({ partner: req.partner._id });

  // Total paid revenue
  const paidOrders = await Order.find({
    partner: req.partner._id,
    paymentStatus: 'paid'
  });
  const totalRevenue = paidOrders.reduce((sum, o) => sum + o.totalAmount, 0);

  // Pending orders count
  const pendingOrders = await Order.countDocuments({
    partner: req.partner._id,
    status: 'pending'
  });

  // This month's revenue
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const thisMonthOrders = await Order.find({
    partner: req.partner._id,
    paymentStatus: 'paid',
    createdAt: { $gte: startOfMonth }
  });
  const thisMonthRevenue = thisMonthOrders.reduce((sum, o) => sum + o.totalAmount, 0);

  // Format status stats
  const statusBreakdown = statusStats.reduce((acc, stat) => {
    acc[stat._id] = {
      count: stat.count,
      revenue: stat.revenue
    };
    return acc;
  }, {});

  sendResponse(res, 200, 'Partner stats retrieved', {
    summary: {
      totalOrders,
      pendingOrders,
      totalRevenue,
      thisMonthRevenue
    },
    statusBreakdown
  });
});
