/**
 * @file Notification.js
 * @description Notification model — stores all
 * in-app notifications for users and partners.
 * Real-time delivery via Socket.io, persisted in DB.
 * @module Notification
 */

const mongoose = require('mongoose');

/**
 * Notification Schema
 */
const notificationSchema = new mongoose.Schema({
  recipient: {
    type: mongoose.Schema.Types.ObjectId,
    required: [true, 'Recipient is required'],
    index: true
  },
  recipientModel: {
    type: String,
    required: [true, 'Recipient model is required'],
    enum: ['User', 'FashionPartner']
  },
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    default: null
  },
  senderModel: {
    type: String,
    enum: ['User', 'FashionPartner', 'System'],
    default: 'System'
  },
  type: {
    type: String,
    required: [true, 'Notification type is required'],
    enum: [
      'like',
      'comment',
      'reply',
      'follow',
      'new_outfit',
      'order_placed',
      'order_confirmed',
      'order_shipped',
      'order_delivered',
      'order_cancelled',
      'system'
    ],
    index: true
  },
  title: {
    type: String,
    required: [true, 'Title is required'],
    maxlength: [100, 'Title cannot exceed 100 characters']
  },
  message: {
    type: String,
    required: [true, 'Message is required'],
    maxlength: [300, 'Message cannot exceed 300 characters']
  },
  data: {
    outfitId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null
    },
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null
    },
    orderNumber: {
      type: String,
      default: ''
    },
    partnerId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null
    },
    commentId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null
    }
  },
  isRead: {
    type: Boolean,
    default: false,
    index: true
  },
  readAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

/**
 * Index for fetching notifications by recipient with read status
 */
notificationSchema.index({ recipient: 1, isRead: 1 });

/**
 * Index for fetching notifications sorted by creation date
 */
notificationSchema.index({ recipient: 1, createdAt: -1 });

const Notification = mongoose.model('Notification', notificationSchema);

module.exports = Notification;
