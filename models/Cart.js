/**
 * @file Cart.js
 * @description Shopping cart model — one cart per user.
 * Items array holds outfit references with size, color,
 * quantity and price locked at time of adding.
 * @module Cart
 */

const mongoose = require('mongoose');

/**
 * Outfit snapshot sub-schema for cart items
 * Captures outfit data at time of adding so cart
 * remains valid even if outfit is deleted later
 */
const outfitSnapshotSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true
  },
  thumbnailUrl: {
    type: String,
    default: ''
  },
  partnerName: {
    type: String,
    default: ''
  },
  category: {
    type: String,
    default: ''
  }
}, { _id: false });

/**
 * Cart item sub-schema
 */
const cartItemSchema = new mongoose.Schema({
  outfit: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'OutfitItem',
    required: [true, 'Outfit is required']
  },
  size: {
    type: String,
    required: [true, 'Size is required']
  },
  color: {
    type: String,
    default: ''
  },
  quantity: {
    type: Number,
    required: [true, 'Quantity is required'],
    min: [1, 'Quantity must be at least 1'],
    max: [10, 'Maximum 10 items per product'],
    default: 1
  },
  priceAtAdd: {
    type: Number,
    required: [true, 'Price at add time is required'],
    min: 0
  },
  outfitSnapshot: {
    type: outfitSnapshotSchema,
    default: () => ({})
  }
}, { _id: true, timestamps: true });

/**
 * Cart Schema
 */
const cartSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User is required'],
    unique: true,
    index: true
  },
  items: {
    type: [cartItemSchema],
    default: []
  },
  totalAmount: {
    type: Number,
    default: 0,
    min: 0
  },
  currency: {
    type: String,
    default: 'PKR'
  }
}, {
  timestamps: true
});

/**
 * @description Pre-save middleware to auto-calculate totalAmount
 * Uses priceAtAdd * quantity for each item
 */
cartSchema.pre('save', function(next) {
  this.totalAmount = this.items.reduce((total, item) => {
    return total + (item.priceAtAdd * item.quantity);
  }, 0);
  next();
});

/**
 * @description Instance method to get total item count in cart
 * @returns {Number} Total quantity of all items
 */
cartSchema.methods.getItemCount = function() {
  return this.items.reduce((count, item) => count + item.quantity, 0);
};

const Cart = mongoose.model('Cart', cartSchema);

module.exports = Cart;
