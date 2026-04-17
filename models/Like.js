/**
 * @file Like.js
 * @description Like model — tracks which user liked
 * which outfit. Uses compound unique index to prevent
 * duplicate likes.
 * @module Like
 */

const mongoose = require('mongoose');

/**
 * Like Schema
 */
const likeSchema = new mongoose.Schema({
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
  }
}, {
  timestamps: true
});

/**
 * @description Compound unique index to prevent duplicate likes
 * One user can only like an outfit once
 */
likeSchema.index({ user: 1, outfit: 1 }, { unique: true });

const Like = mongoose.model('Like', likeSchema);

module.exports = Like;
