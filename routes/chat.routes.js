/**
 * @file chat.routes.js
 * @description Chat/DM routes
 * @module ChatRoutes
 */

const express = require('express');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');

/**
 * Import controllers
 */
const {
  getConversations,
  getMessages,
  sendMessage,
  deleteMessage,
  getUnreadMessageCount,
  searchMessages
} = require('../controllers/chat.controller');

/**
 * Import auth middleware
 */
const { protect: protectUser } = require('../middleware/authUser.middleware');
const { protect: protectPartner } = require('../middleware/authPartner.middleware');

/**
 * Import models for verification
 */
const User = require('../models/User');
const FashionPartner = require('../models/FashionPartner');
const logger = require('../config/logger');

/**
 * Create router
 */
const router = express.Router();

/**
 * @description Middleware to allow either User or Partner
 * Tries user token first, then partner token
 * Pass if either valid, 401 if both fail
 */
const allowUserOrPartner = async (req, res, next) => {
  try {
    // Try user token first
    let token = req.cookies?.accessToken ||
                req.headers.authorization?.split(' ')[1];

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. Please log in.'
      });
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      if (decoded.role === 'partner') {
        const partner = await FashionPartner.findById(decoded.id);
        if (partner && partner.isApproved && partner.isActive) {
          req.partner = partner;
          return next();
        }
      } else {
        const user = await User.findById(decoded.id);
        if (user && user.isActive) {
          req.user = user;
          return next();
        }
      }
    } catch (jwtError) {
      // Token invalid
      return res.status(401).json({
        success: false,
        message: 'Invalid token. Please log in again.'
      });
    }

    return res.status(401).json({
      success: false,
      message: 'Access denied. Please log in.'
    });
  } catch (error) {
    logger.error(`allowUserOrPartner middleware error: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: 'Authentication failed'
    });
  }
};

/**
 * @description Validation array for sending message
 */
const sendMessageValidation = [
  body('otherPartyModel')
    .notEmpty()
    .withMessage('Receiver model is required')
    .isIn(['User', 'FashionPartner'])
    .withMessage('otherPartyModel must be User or FashionPartner'),
  body('text')
    .optional()
    .isLength({ max: 1000 })
    .withMessage('Message cannot exceed 1000 characters'),
  body('outfitId')
    .optional()
    .isMongoId()
    .withMessage('Invalid outfit ID'),
  body()
    .custom((value, { req }) => {
      if (!req.body.text && !req.body.outfitId) {
        throw new Error('Message must have text or outfit reference');
      }
      return true;
    })
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
 * IMPORTANT route order (specific before param):
 * GET    /conversations        → allowUserOrPartner, getConversations
 * GET    /unread-count         → allowUserOrPartner, getUnreadMessageCount
 * DELETE /message/:messageId   → allowUserOrPartner, deleteMessage
 * GET    /:otherPartyId/search → allowUserOrPartner, searchMessages
 * GET    /:otherPartyId        → allowUserOrPartner, getMessages
 * POST   /:otherPartyId        → allowUserOrPartner,
 *                                sendMessageValidation,
 *                                validateRequest,
 *                                sendMessage
 */

/**
 * @route GET /api/chat/conversations
 * @description Get all conversations for current user/partner
 * @access Private (User or Partner)
 */
router.get('/conversations', allowUserOrPartner, getConversations);

/**
 * @route GET /api/chat/unread-count
 * @description Get total unread message count
 * @access Private (User or Partner)
 */
router.get('/unread-count', allowUserOrPartner, getUnreadMessageCount);

/**
 * @route DELETE /api/chat/message/:messageId
 * @description Soft delete a message
 * @access Private (User or Partner)
 */
router.delete('/message/:messageId', allowUserOrPartner, deleteMessage);

/**
 * @route GET /api/chat/:otherPartyId/search
 * @description Search messages in a conversation
 * @access Private (User or Partner)
 */
router.get('/:otherPartyId/search', allowUserOrPartner, searchMessages);

/**
 * @route GET /api/chat/:otherPartyId
 * @description Get paginated message history
 * @access Private (User or Partner)
 */
router.get('/:otherPartyId', allowUserOrPartner, getMessages);

/**
 * @route POST /api/chat/:otherPartyId
 * @description Send a message
 * @access Private (User or Partner)
 */
router.post(
  '/:otherPartyId',
  allowUserOrPartner,
  sendMessageValidation,
  validateRequest,
  sendMessage
);

module.exports = router;
