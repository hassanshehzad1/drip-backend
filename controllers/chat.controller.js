/**
 * @file chat.controller.js
 * @description Chat/DM controller —
 * conversations list, message history,
 * send message, mark as read, delete message
 * @module ChatController
 *
 * SOCKET EVENTS — CHAT:
 *
 * SERVER EMITS:
 * 'new_message'     → receiver's personal room
 *   { _id, conversationId, sender, text,
 *     messageType, outfitSnapshot, createdAt }
 *
 * 'message_deleted' → receiver's personal room
 *   { messageId, conversationId }
 *
 * 'messages_read'   → sender's personal room
 *   { conversationId, readBy }
 *
 * CLIENT EMITS:
 * 'typing'          → { conversationId, receiverRoom }
 * 'stop_typing'     → { conversationId, receiverRoom }
 * 'join_conversation'  → conversationId string
 * 'leave_conversation' → conversationId string
 */

const mongoose = require('mongoose');
const Message = require('../models/Message');
const User = require('../models/User');
const FashionPartner = require('../models/FashionPartner');
const OutfitItem = require('../models/OutfitItem');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');
const sendResponse = require('../utils/sendResponse');
const getPagination = require('../utils/pagination');
const { emitToRoom } = require('../services/socket.service');
const logger = require('../config/logger');

/**
 * @description Extract sender info from request
 * Works for both user and partner senders
 * @param {Object} req - Express request object
 * @returns {Object} Sender details
 */
const getOtherPartyInfo = (req) => {
  return {
    senderId: req.user?._id || req.partner?._id,
    senderModel: req.user ? 'User' : 'FashionPartner',
    senderName: req.user?.name || req.partner?.brandName
  };
};

/**
 * @description Find and validate receiver exists
 * @param {String} receiverId - Receiver ID
 * @param {String} receiverModel - 'User' or 'FashionPartner'
 * @returns {Object|null} Receiver document or null
 */
const findOtherParty = async (receiverId, receiverModel) => {
  if (receiverModel === 'User') {
    return User.findById(receiverId).select('name avatar isActive');
  } else if (receiverModel === 'FashionPartner') {
    return FashionPartner.findById(receiverId)
      .select('brandName logo isActive isApproved');
  }
  return null;
};

/**
 * @description Get all conversations for current user/partner
 * Returns last message of each conversation with unread count
 * @route GET /api/chat/conversations
 * @access Private (User or Partner)
 */
exports.getConversations = catchAsync(async (req, res, next) => {
  const { senderId } = getOtherPartyInfo(req);

  // Use aggregation pipeline to find all unique conversations
  const conversations = await Message.aggregate([
    {
      $match: {
        $or: [
          { sender: senderId },
          { receiver: senderId }
        ],
        isDeleted: false
      }
    },
    { $sort: { createdAt: -1 } },
    {
      $group: {
        _id: '$conversationId',
        lastMessage: { $first: '$$ROOT' },
        unreadCount: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $eq: ['$receiver', senderId] },
                  { $eq: ['$isRead', false] }
                ]
              },
              1, 0
            ]
          }
        }
      }
    },
    { $sort: { 'lastMessage.createdAt': -1 } }
  ]);

  // Fetch other party details for each conversation
  const formattedConversations = await Promise.all(
    conversations.map(async (conv) => {
      const lastMsg = conv.lastMessage;
      const isSender = lastMsg.sender.toString() === senderId.toString();

      // The other party is whoever is not the current sender
      const otherPartyId = isSender ? lastMsg.receiver : lastMsg.sender;
      const otherPartyModel = isSender ? lastMsg.receiverModel : lastMsg.senderModel;

      const otherParty = await findOtherParty(otherPartyId, otherPartyModel);

      return {
        conversationId: conv._id,
        otherParty: {
          id: otherPartyId,
          name: otherPartyModel === 'User'
            ? otherParty?.name
            : otherParty?.brandName,
          avatar: otherPartyModel === 'User'
            ? otherParty?.avatar
            : otherParty?.logo,
          model: otherPartyModel
        },
        lastMessage: {
          text: lastMsg.text,
          messageType: lastMsg.messageType,
          createdAt: lastMsg.createdAt,
          isRead: lastMsg.isRead,
          senderId: lastMsg.sender
        },
        unreadCount: conv.unreadCount
      };
    })
  );

  sendResponse(res, 200, 'Conversations retrieved', {
    conversations: formattedConversations
  });
});

/**
 * @description Get paginated message history with a specific user or partner
 * @route GET /api/chat/:otherPartyId
 * @access Private (User or Partner)
 */
exports.getMessages = catchAsync(async (req, res, next) => {
  const { otherPartyId } = req.params;
  const { otherPartyModel } = req.query;
  const { senderId } = getOtherPartyInfo(req);

  // Validate otherPartyId
  if (!mongoose.Types.ObjectId.isValid(otherPartyId)) {
    return next(new AppError('Invalid other party ID', 400));
  }

  // Validate otherPartyModel
  if (!otherPartyModel || !['User', 'FashionPartner'].includes(otherPartyModel)) {
    return next(new AppError('otherPartyModel must be User or FashionPartner', 400));
  }

  // Find other party
  const otherParty = await findOtherParty(otherPartyId, otherPartyModel);
  if (!otherParty || !otherParty.isActive) {
    return next(new AppError('User or partner not found', 404));
  }

  if (otherPartyModel === 'FashionPartner' &&
      (!otherParty.isApproved || !otherParty.isActive)) {
    return next(new AppError('Partner not found or not approved', 404));
  }

  // Generate conversation ID
  const conversationId = Message.generateConversationId(senderId, otherPartyId);

  // Get pagination (default 30, max 50)
  const { page, limit, skip } = getPagination(req.query);
  const actualLimit = Math.min(limit, 50);
  const actualSkip = (page - 1) * actualLimit;

  // Find messages
  const messages = await Message.find({ conversationId, isDeleted: false })
    .sort({ createdAt: -1 })
    .skip(actualSkip)
    .limit(actualLimit)
    .populate('sender', 'name avatar brandName logo')
    .populate('outfitRef', 'title video.thumbnailUrl price category');

  const total = await Message.countDocuments({ conversationId, isDeleted: false });
  const totalPages = Math.ceil(total / actualLimit);

  // Mark messages as read (receiver side)
  await Message.updateMany(
    {
      conversationId,
      receiver: senderId,
      isRead: false
    },
    { isRead: true, readAt: new Date() }
  );

  // Emit read receipt via socket (fire and forget)
  const receiverRoom = `${otherPartyModel === 'User' ? 'user' : 'partner'}:${otherPartyId}`;
  emitToRoom(receiverRoom, 'messages_read', { conversationId, readBy: senderId });

  // Return messages in chronological order (reverse the array)
  sendResponse(res, 200, 'Messages retrieved', {
    messages: messages.reverse(),
    otherParty: {
      id: otherPartyId,
      name: otherPartyModel === 'User' ? otherParty.name : otherParty.brandName,
      avatar: otherPartyModel === 'User' ? otherParty.avatar : otherParty.logo,
      model: otherPartyModel
    }
  }, {
    page,
    limit: actualLimit,
    total,
    totalPages,
    hasNextPage: page < totalPages,
    hasPrevPage: page > 1
  });
});

/**
 * @description Send a message to user or partner
 * Supports text, outfit sharing
 * @route POST /api/chat/:otherPartyId
 * @access Private (User or Partner)
 */
exports.sendMessage = catchAsync(async (req, res, next) => {
  const { otherPartyId } = req.params;
  const { text = '', outfitId, otherPartyModel } = req.body;
  const { senderId, senderModel, senderName } = getOtherPartyInfo(req);

  // Validate otherPartyModel
  if (!otherPartyModel || !['User', 'FashionPartner'].includes(otherPartyModel)) {
    return next(new AppError('otherPartyModel is required and must be User or FashionPartner', 400));
  }

  // Validate at least one of text or outfitId
  if (!text.trim() && !outfitId) {
    return next(new AppError('Message must have text or outfit reference', 400));
  }

  // Validate text length
  if (text && text.length > 1000) {
    return next(new AppError('Message cannot exceed 1000 characters', 400));
  }

  // Cannot message yourself
  if (senderId.toString() === otherPartyId.toString()) {
    return next(new AppError('You cannot message yourself', 400));
  }

  // Validate otherPartyId
  if (!mongoose.Types.ObjectId.isValid(otherPartyId)) {
    return next(new AppError('Invalid other party ID', 400));
  }

  // Find other party
  const otherParty = await findOtherParty(otherPartyId, otherPartyModel);
  if (!otherParty || !otherParty.isActive) {
    return next(new AppError('Receiver not found or inactive', 404));
  }

  if (otherPartyModel === 'FashionPartner' &&
      (!otherParty.isApproved || !otherParty.isActive)) {
    return next(new AppError('Partner not found or not approved', 404));
  }

  // Generate conversation ID
  const conversationId = Message.generateConversationId(senderId, otherPartyId);

  // Determine message type and get outfit data if needed
  let messageType = 'text';
  let outfitSnapshot = {};
  let outfitRef = null;

  if (outfitId) {
    if (!mongoose.Types.ObjectId.isValid(outfitId)) {
      return next(new AppError('Invalid outfit ID', 400));
    }

    const outfit = await OutfitItem.findById(outfitId);
    if (!outfit) {
      return next(new AppError('Outfit not found', 400));
    }

    messageType = 'outfit_share';
    outfitRef = outfitId;
    outfitSnapshot = {
      title: outfit.title,
      thumbnailUrl: outfit.video?.thumbnailUrl || '',
      price: outfit.price,
      category: outfit.category
    };
  }

  // Create message
  const message = await Message.create({
    sender: senderId,
    senderModel,
    receiver: otherPartyId,
    receiverModel: otherPartyModel,
    text: text || '',
    outfitRef,
    outfitSnapshot,
    messageType,
    conversationId
  });

  // Populate sender for response
  await message.populate('sender', 'name avatar brandName logo');

  // Emit real-time message via socket (fire and forget)
  const roomPrefix = otherPartyModel === 'User' ? 'user' : 'partner';
  emitToRoom(
    `${roomPrefix}:${otherPartyId}`,
    'new_message',
    {
      _id: message._id,
      conversationId,
      sender: {
        id: senderId,
        name: senderName,
        model: senderModel
      },
      text: message.text,
      messageType: message.messageType,
      outfitSnapshot: message.outfitSnapshot,
      createdAt: message.createdAt
    }
  );

  logger.info(`${senderName} sent ${messageType} message to ${otherPartyModel}:${otherPartyId}`);

  sendResponse(res, 201, 'Message sent', { message });
});

/**
 * @description Soft delete a message
 * Only sender can delete their own messages
 * Within 24 hours of sending only
 * @route DELETE /api/chat/message/:messageId
 * @access Private (User or Partner)
 */
exports.deleteMessage = catchAsync(async (req, res, next) => {
  const { messageId } = req.params;
  const { senderId } = getOtherPartyInfo(req);

  // Validate messageId
  if (!mongoose.Types.ObjectId.isValid(messageId)) {
    return next(new AppError('Invalid message ID', 400));
  }

  // Find message
  const message = await Message.findById(messageId);
  if (!message) {
    return next(new AppError('Message not found', 404));
  }

  // Check ownership
  if (message.sender.toString() !== senderId.toString()) {
    return next(new AppError('You can only delete your own messages', 403));
  }

  // Check time limit (24 hours)
  const hoursSinceSent = (Date.now() - message.createdAt) / (1000 * 60 * 60);
  if (hoursSinceSent > 24) {
    return next(new AppError('Messages can only be deleted within 24 hours of sending', 400));
  }

  // Soft delete
  message.isDeleted = true;
  message.deletedAt = new Date();
  message.text = 'This message was deleted';
  await message.save();

  // Emit deletion event (fire and forget)
  const receiverRoom = `${message.receiverModel === 'User' ? 'user' : 'partner'}:${message.receiver}`;
  emitToRoom(receiverRoom, 'message_deleted', {
    messageId: message._id,
    conversationId: message.conversationId
  });

  sendResponse(res, 200, 'Message deleted successfully');
});

/**
 * @description Get total unread message count
 * Used for chat badge in navigation
 * @route GET /api/chat/unread-count
 * @access Private (User or Partner)
 */
exports.getUnreadMessageCount = catchAsync(async (req, res, next) => {
  const { senderId } = getOtherPartyInfo(req);

  const unreadCount = await Message.countDocuments({
    receiver: senderId,
    isRead: false,
    isDeleted: false
  });

  sendResponse(res, 200, 'Unread count retrieved', { unreadCount });
});

/**
 * @description Search messages in a conversation
 * @route GET /api/chat/:otherPartyId/search
 * @access Private (User or Partner)
 */
exports.searchMessages = catchAsync(async (req, res, next) => {
  const { otherPartyId } = req.params;
  const { q, otherPartyModel } = req.query;
  const { senderId } = getOtherPartyInfo(req);

  // Validate search term
  if (!q || q.length < 2) {
    return next(new AppError('Search term must be at least 2 characters', 400));
  }

  // Validate otherPartyModel
  if (!otherPartyModel || !['User', 'FashionPartner'].includes(otherPartyModel)) {
    return next(new AppError('otherPartyModel is required and must be User or FashionPartner', 400));
  }

  // Validate otherPartyId
  if (!mongoose.Types.ObjectId.isValid(otherPartyId)) {
    return next(new AppError('Invalid other party ID', 400));
  }

  // Generate conversation ID
  const conversationId = Message.generateConversationId(senderId, otherPartyId);

  // Search with regex
  const messages = await Message.find({
    conversationId,
    isDeleted: false,
    text: { $regex: q, $options: 'i' }
  })
    .sort({ createdAt: -1 })
    .limit(20)
    .populate('sender', 'name brandName avatar logo');

  sendResponse(res, 200, 'Search results', { messages });
});
