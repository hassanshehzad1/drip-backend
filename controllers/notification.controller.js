/**
 * @file notification.controller.js
 * @description Notification management —
 * fetch, mark read, delete notifications
 * @module NotificationController
 */

const Notification = require('../models/Notification');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');
const sendResponse = require('../utils/sendResponse');
const getPagination = require('../utils/pagination');
const logger = require('../config/logger');

/**
 * @description Get paginated notifications for current user/partner
 * Unread notifications come first
 * @route GET /api/notification
 * @access Private (User or Partner)
 */
exports.getNotifications = catchAsync(async (req, res, next) => {
  const { isRead, type } = req.query;
  const { page, limit, skip } = getPagination(req.query);

  // Determine recipient
  const recipientId = req.user?._id || req.partner?._id;
  const recipientModel = req.user ? 'User' : 'FashionPartner';

  // Build query
  const query = {
    recipient: recipientId,
    recipientModel
  };

  if (isRead !== undefined) {
    query.isRead = isRead === 'true';
  }

  if (type) {
    query.type = type;
  }

  // Find notifications
  const notifications = await Notification.find(query)
    .sort({ isRead: 1, createdAt: -1 })
    .skip(skip)
    .limit(limit);

  const total = await Notification.countDocuments(query);
  const totalPages = Math.ceil(total / limit);

  sendResponse(res, 200, 'Notifications retrieved', { notifications }, {
    page,
    limit,
    total,
    totalPages,
    hasNextPage: page < totalPages,
    hasPrevPage: page > 1
  });
});

/**
 * @description Get count of unread notifications
 * Used for notification bell badge in frontend
 * @route GET /api/notification/unread-count
 * @access Private (User or Partner)
 */
exports.getUnreadCount = catchAsync(async (req, res, next) => {
  const recipientId = req.user?._id || req.partner?._id;
  const recipientModel = req.user ? 'User' : 'FashionPartner';

  const count = await Notification.countDocuments({
    recipient: recipientId,
    recipientModel,
    isRead: false
  });

  sendResponse(res, 200, 'Unread count retrieved', { unreadCount: count });
});

/**
 * @description Mark a single notification as read
 * @route PATCH /api/notification/:notificationId/read
 * @access Private (User or Partner)
 */
exports.markAsRead = catchAsync(async (req, res, next) => {
  const { notificationId } = req.params;

  const recipientId = req.user?._id || req.partner?._id;
  const recipientModel = req.user ? 'User' : 'FashionPartner';

  const notification = await Notification.findOne({
    _id: notificationId,
    recipient: recipientId,
    recipientModel
  });

  if (!notification) {
    return next(new AppError('Notification not found', 404));
  }

  // If already read, return without update (idempotent)
  if (notification.isRead) {
    return sendResponse(res, 200, 'Notification already read', { notification });
  }

  notification.isRead = true;
  notification.readAt = new Date();
  await notification.save();

  sendResponse(res, 200, 'Notification marked as read', { notification });
});

/**
 * @description Mark ALL unread notifications as read
 * @route PATCH /api/notification/read-all
 * @access Private (User or Partner)
 */
exports.markAllAsRead = catchAsync(async (req, res, next) => {
  const recipientId = req.user?._id || req.partner?._id;
  const recipientModel = req.user ? 'User' : 'FashionPartner';

  const result = await Notification.updateMany(
    { recipient: recipientId, recipientModel, isRead: false },
    { isRead: true, readAt: new Date() }
  );

  sendResponse(res, 200, 'All notifications marked as read', {
    modifiedCount: result.modifiedCount
  });
});

/**
 * @description Delete a single notification
 * @route DELETE /api/notification/:notificationId
 * @access Private (User or Partner)
 */
exports.deleteNotification = catchAsync(async (req, res, next) => {
  const { notificationId } = req.params;

  const recipientId = req.user?._id || req.partner?._id;
  const recipientModel = req.user ? 'User' : 'FashionPartner';

  const notification = await Notification.findOne({
    _id: notificationId,
    recipient: recipientId,
    recipientModel
  });

  if (!notification) {
    return next(new AppError('Notification not found', 404));
  }

  await notification.deleteOne();

  sendResponse(res, 200, 'Notification deleted successfully');
});

/**
 * @description Delete all read notifications (cleanup)
 * @route DELETE /api/notification/read
 * @access Private (User or Partner)
 */
exports.deleteAllRead = catchAsync(async (req, res, next) => {
  const recipientId = req.user?._id || req.partner?._id;
  const recipientModel = req.user ? 'User' : 'FashionPartner';

  const result = await Notification.deleteMany({
    recipient: recipientId,
    recipientModel,
    isRead: true
  });

  sendResponse(res, 200, 'All read notifications deleted', {
    deletedCount: result.deletedCount
  });
});
