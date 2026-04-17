/**
 * @file Comment.js
 * @description Comment model — supports nested replies
 * (one level deep only). Each comment belongs to an outfit.
 * @module Comment
 */

const mongoose = require('mongoose');

/**
 * Comment Schema
 */
const commentSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User is required'],
    index: true
  },
  outfit: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'OutfitItem',
    required: [true, 'Outfit is required'],
    index: true
  },
  text: {
    type: String,
    required: [true, 'Comment text is required'],
    trim: true,
    minLength: [1, 'Comment cannot be empty'],
    maxLength: [500, 'Comment cannot exceed 500 characters']
  },
  parentComment: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Comment',
    default: null,
    index: true
  },
  isReply: {
    type: Boolean,
    default: false
  },
  likesCount: {
    type: Number,
    default: 0,
    min: 0
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

/**
 * @description Index for outfit comments sorted by newest first
 */
commentSchema.index({ outfit: 1, createdAt: -1 });

/**
 * @description Index for replies lookup
 */
commentSchema.index({ parentComment: 1 });

/**
 * @description Index for active comments lookup
 */
commentSchema.index({ isActive: 1 });

const Comment = mongoose.model('Comment', commentSchema);

module.exports = Comment;
