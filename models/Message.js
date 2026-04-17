   /**
 * @file Message.js
 * @description Direct message model — supports
 * user ↔ partner messaging with optional outfit reference.
 * Messages are stored permanently for chat history.
 * @module Message
 */

const mongoose = require('mongoose');

/**
 * Outfit snapshot sub-schema for message context
 * Captures outfit data so chat history remains valid
 * even if outfit is deleted later
 */
const outfitSnapshotSchema = new mongoose.Schema({
  title: {
    type: String,
    default: ''
  },
  thumbnailUrl: {
    type: String,
    default: ''
  },
  price: {
    type: Number,
    default: 0
  },
  category: {
    type: String,
    default: ''
  }
}, { _id: false });

/**
 * Message Schema
 */
const messageSchema = new mongoose.Schema({
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    required: [true, 'Sender is required'],
    refPath: 'senderModel'
  },
  senderModel: {
    type: String,
    required: [true, 'Sender model is required'],
    enum: ['User', 'FashionPartner']
  },
  receiver: {
    type: mongoose.Schema.Types.ObjectId,
    required: [true, 'Receiver is required'],
    refPath: 'receiverModel'
  },
  receiverModel: {
    type: String,
    required: [true, 'Receiver model is required'],
    enum: ['User', 'FashionPartner']
  },
  text: {
    type: String,
    trim: true,
    maxlength: [1000, 'Message cannot exceed 1000 characters'],
    default: ''
  },
  outfitRef: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'OutfitItem',
    default: null
  },
  outfitSnapshot: {
    type: outfitSnapshotSchema,
    default: () => ({})
  },
  messageType: {
    type: String,
    enum: ['text', 'outfit_share', 'order_ref', 'image'],
    default: 'text'
  },
  imageUrl: {
    type: String,
    default: ''
  },
  isRead: {
    type: Boolean,
    default: false,
    index: true
  },
  readAt: {
    type: Date,
    default: null
  },
  isDeleted: {
    type: Boolean,
    default: false
  },
  deletedAt: {
    type: Date,
    default: null
  },
  conversationId: {
    type: String,
    required: [true, 'Conversation ID is required'],
    index: true
  }
}, {
  timestamps: true
});

/**
 * Index for fetching messages in a conversation, sorted by creation date
 */
messageSchema.index({ conversationId: 1, createdAt: -1 });

/**
 * Index for finding conversations between specific users/partners
 */
messageSchema.index({ sender: 1, receiver: 1 });

/**
 * Index for finding unread messages for a receiver
 */
messageSchema.index({ receiver: 1, isRead: 1 });

/**
 * @description Generate a consistent conversation ID for two parties
 * Sorts IDs alphabetically to ensure same ID regardless of who initiates
 * @param {String} id1 - First party ID
 * @param {String} id2 - Second party ID
 * @returns {String} Conversation ID format: sortedId1_sortedId2
 */
messageSchema.statics.generateConversationId = function(id1, id2) {
  const sorted = [id1.toString(), id2.toString()].sort();
  return sorted.join('_');
};

const Message = mongoose.model('Message', messageSchema);

module.exports = Message;
