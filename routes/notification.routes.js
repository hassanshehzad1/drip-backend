/**
 * @file notification.routes.js
 * @description Notification routes
 * @module NotificationRoutes
 */

const express = require('express');
const jwt = require('jsonwebtoken');

/**
 * Import controllers
 */
const {
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  deleteAllRead
} = require('../controllers/notification.controller');

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
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
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
 * IMPORTANT route order (specific before param):
 * GET    /unread-count        → allowUserOrPartner, getUnreadCount
 * PATCH  /read-all            → allowUserOrPartner, markAllAsRead
 * DELETE /read                → allowUserOrPartner, deleteAllRead
 * GET    /                    → allowUserOrPartner, getNotifications
 * PATCH  /:notificationId/read → allowUserOrPartner, markAsRead
 * DELETE /:notificationId     → allowUserOrPartner, deleteNotification
 */

/**
 * @route GET /api/notification/unread-count
 * @description Get count of unread notifications
 * @access Private (User or Partner)
 */
router.get('/unread-count', allowUserOrPartner, getUnreadCount);

/**
 * @route PATCH /api/notification/read-all
 * @description Mark ALL unread notifications as read
 * @access Private (User or Partner)
 */
router.patch('/read-all', allowUserOrPartner, markAllAsRead);

/**
 * @route DELETE /api/notification/read
 * @description Delete all read notifications
 * @access Private (User or Partner)
 */
router.delete('/read', allowUserOrPartner, deleteAllRead);

/**
 * @route GET /api/notification
 * @description Get paginated notifications
 * @access Private (User or Partner)
 */
router.get('/', allowUserOrPartner, getNotifications);

/**
 * @route PATCH /api/notification/:notificationId/read
 * @description Mark a single notification as read
 * @access Private (User or Partner)
 */
router.patch('/:notificationId/read', allowUserOrPartner, markAsRead);

/**
 * @route DELETE /api/notification/:notificationId
 * @description Delete a single notification
 * @access Private (User or Partner)
 */
router.delete('/:notificationId', allowUserOrPartner, deleteNotification);

module.exports = router;
