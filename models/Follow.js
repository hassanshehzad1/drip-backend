/**
 * @file Follow.js
 * @description Follow model — users follow fashion partners.
 * Compound unique index prevents duplicate follows.
 * @module Follow
 */

const mongoose = require('mongoose');

/**
 * Follow Schema
 */
const followSchema = new mongoose.Schema({
  follower: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Follower (user) is required'],
    index: true
  },
  following: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'FashionPartner',
    required: [true, 'Following (partner) is required'],
    index: true
  }
}, {
  timestamps: true
});

/**
 * @description Compound unique index to prevent duplicate follows
 * A user can only follow a partner once
 */
followSchema.index({ follower: 1, following: 1 }, { unique: true });

const Follow = mongoose.model('Follow', followSchema);

module.exports = Follow;
