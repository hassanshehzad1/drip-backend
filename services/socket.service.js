/**
 * @file socket.service.js
 * @description Socket.io event emission service.
 * All real-time events are emitted through this service.
 * Handles notification creation + real-time delivery.
 * @module SocketService
 *
 * SOCKET.IO EVENTS EMITTED BY SERVER:
 *
 * 'new_notification' → personal room (user/partner)
 *   payload: { _id, type, title, message, data, isRead, createdAt }
 *
 * 'outfit_liked' → outfit room (outfit:outfitId)
 *   payload: { outfitId, likesCount, likedBy }
 *
 * 'new_comment' → outfit room
 *   payload: { outfitId, comment, commentsCount }
 *
 * SOCKET.IO EVENTS RECEIVED FROM CLIENT:
 *
 * 'join_outfit_room' → client joins outfit:outfitId room
 * 'leave_outfit_room' → client leaves outfit:outfitId room
 */

const { getIO } = require('../config/socket');
const Notification = require('../models/Notification');
const logger = require('../config/logger');

/**
 * @description Create notification in DB and emit via socket
 * @param {Object} notificationData - Notification details
 * @returns {Object} Created notification document
 */
const createAndSendNotification = async (notificationData) => {
  try {
    const {
      recipient,
      recipientModel,
      sender,
      senderModel,
      type,
      title,
      message,
      data = {}
    } = notificationData;

    // Save to database
    const notification = await Notification.create({
      recipient,
      recipientModel,
      sender,
      senderModel,
      type,
      title,
      message,
      data
    });

    // Emit real-time via Socket.io
    try {
      const io = getIO();
      const room = recipientModel === 'User'
        ? `user:${recipient}`
        : `partner:${recipient}`;

      io.to(room).emit('new_notification', {
        _id: notification._id,
        type,
        title,
        message,
        data,
        isRead: false,
        createdAt: notification.createdAt
      });

      logger.info(`Notification sent to room ${room}: ${type}`);
    } catch (socketError) {
      // Socket might not be initialized in tests
      // Don't fail notification creation if socket fails
      logger.warn(`Socket emit failed: ${socketError.message}`);
    }

    return notification;
  } catch (error) {
    logger.error(`createAndSendNotification failed: ${error.message}`);
    // Don't throw — notification failure shouldn't break main operation
    return null;
  }
};

/**
 * @description Emit event to a specific room without creating notification
 * @param {String} room  - Room name e.g. 'user:64f1...'
 * @param {String} event - Event name
 * @param {Object} data  - Event payload
 */
const emitToRoom = (room, event, data) => {
  try {
    const io = getIO();
    io.to(room).emit(event, data);
    logger.info(`Emitted ${event} to room ${room}`);
  } catch (error) {
    logger.warn(`emitToRoom failed: ${error.message}`);
  }
};

/**
 * @description Emit to all connected clients (broadcast)
 * @param {String} event - Event name
 * @param {Object} data  - Event payload
 */
const emitToAll = (event, data) => {
  try {
    const io = getIO();
    io.emit(event, data);
  } catch (error) {
    logger.warn(`emitToAll failed: ${error.message}`);
  }
};

/**
 * @description Notify partner when their outfit is liked
 */
const notifyOutfitLiked = async (outfit, likerUser) => {
  if (outfit.partner.toString() === likerUser._id.toString()) return;
  // Don't notify if user likes their own (not applicable but good practice)

  await createAndSendNotification({
    recipient: outfit.partner,
    recipientModel: 'FashionPartner',
    sender: likerUser._id,
    senderModel: 'User',
    type: 'like',
    title: 'New like on your outfit',
    message: `${likerUser.name} liked your outfit "${outfit.title}"`,
    data: { outfitId: outfit._id, partnerId: outfit.partner }
  });
};

/**
 * @description Notify partner when their outfit gets a comment
 */
const notifyOutfitCommented = async (outfit, commenterUser, commentId) => {
  await createAndSendNotification({
    recipient: outfit.partner,
    recipientModel: 'FashionPartner',
    sender: commenterUser._id,
    senderModel: 'User',
    type: 'comment',
    title: 'New comment on your outfit',
    message: `${commenterUser.name} commented on "${outfit.title}"`,
    data: {
      outfitId: outfit._id,
      commentId,
      partnerId: outfit.partner
    }
  });
};

/**
 * @description Notify comment author when someone replies
 */
const notifyCommentReplied = async (
  parentComment, replierUser, outfit
) => {
  // Don't notify if replying to own comment
  if (parentComment.user.toString() === replierUser._id.toString()) return;

  await createAndSendNotification({
    recipient: parentComment.user,
    recipientModel: 'User',
    sender: replierUser._id,
    senderModel: 'User',
    type: 'reply',
    title: 'New reply to your comment',
    message: `${replierUser.name} replied to your comment on "${outfit.title}"`,
    data: {
      outfitId: outfit._id,
      commentId: parentComment._id
    }
  });
};

/**
 * @description Notify partner when user follows them
 */
const notifyNewFollower = async (partner, followerUser) => {
  await createAndSendNotification({
    recipient: partner._id,
    recipientModel: 'FashionPartner',
    sender: followerUser._id,
    senderModel: 'User',
    type: 'follow',
    title: 'New follower',
    message: `${followerUser.name} started following ${partner.brandName}`,
    data: { partnerId: partner._id }
  });
};

/**
 * @description Notify all followers when partner posts new outfit
 */
const notifyNewOutfit = async (outfit, partner, followerIds) => {
  // Send to all followers in parallel
  const notifications = followerIds.map(followerId =>
    createAndSendNotification({
      recipient: followerId,
      recipientModel: 'User',
      sender: partner._id,
      senderModel: 'FashionPartner',
      type: 'new_outfit',
      title: 'New outfit from a brand you follow',
      message: `${partner.brandName} just posted "${outfit.title}"`,
      data: {
        outfitId: outfit._id,
        partnerId: partner._id
      }
    })
  );
  await Promise.allSettled(notifications);
  logger.info(`New outfit notifications sent to ${followerIds.length} followers`);
};

/**
 * @description Notify partner when they receive a new order
 */
const notifyOrderPlaced = async (order, partner, user) => {
  await createAndSendNotification({
    recipient: partner._id,
    recipientModel: 'FashionPartner',
    sender: user._id,
    senderModel: 'User',
    type: 'order_placed',
    title: 'New order received',
    message: `${user.name} placed order ${order.orderNumber} for PKR ${order.totalAmount}`,
    data: {
      orderId: order._id,
      orderNumber: order.orderNumber
    }
  });
};

/**
 * @description Notify user when order status changes
 */
const notifyOrderStatusChange = async (order, user, newStatus) => {
  const statusMessages = {
    confirmed: {
      title: 'Order confirmed',
      message: `Your order ${order.orderNumber} has been confirmed and is being prepared.`
    },
    shipped: {
      title: 'Order shipped',
      message: `Your order ${order.orderNumber} is on its way! Estimated delivery in 3-5 days.`
    },
    delivered: {
      title: 'Order delivered',
      message: `Your order ${order.orderNumber} has been delivered. Enjoy your outfit!`
    },
    cancelled: {
      title: 'Order cancelled',
      message: `Your order ${order.orderNumber} has been cancelled.`
    }
  };

  const notifData = statusMessages[newStatus];
  if (!notifData) return;

  await createAndSendNotification({
    recipient: user._id || user,
    recipientModel: 'User',
    type: `order_${newStatus}`,
    title: notifData.title,
    message: notifData.message,
    data: {
      orderId: order._id,
      orderNumber: order.orderNumber
    }
  });
};

module.exports = {
  createAndSendNotification,
  emitToRoom,
  emitToAll,
  notifyOutfitLiked,
  notifyOutfitCommented,
  notifyCommentReplied,
  notifyNewFollower,
  notifyNewOutfit,
  notifyOrderPlaced,
  notifyOrderStatusChange
};
