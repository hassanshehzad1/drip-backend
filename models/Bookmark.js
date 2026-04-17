/**
 * @file Bookmark.js
 * @description Bookmark model — saved/wishlisted outfits
 * per user. Compound unique index prevents duplicates.
 * @module Bookmark
 */

const mongoose = require('mongoose');

/**
 * Bookmark Schema
 */
const bookmarkSchema = new mongoose.Schema({
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
 * @description Compound unique index to prevent duplicate bookmarks
 * One user can only bookmark an outfit once
 */
bookmarkSchema.index({ user: 1, outfit: 1 }, { unique: true });

const Bookmark = mongoose.model('Bookmark', bookmarkSchema);

module.exports = Bookmark;
