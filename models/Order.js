/**
 * @file Order.js
 * @description Order model — created when user
 * completes checkout. Tracks full order lifecycle.
 * @module Order
 */

const mongoose = require('mongoose');

/**
 * Order item sub-schema
 */
const orderItemSchema = new mongoose.Schema({
  outfit: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'OutfitItem',
    required: true
  },
  size: {
    type: String,
    required: true
  },
  color: {
    type: String,
    default: ''
  },
  quantity: {
    type: Number,
    required: true,
    min: 1
  },
  price: {
    type: Number,
    required: true,
    min: 0
  },
  outfitSnapshot: {
    title: {
      type: String,
      default: ''
    },
    thumbnailUrl: {
      type: String,
      default: ''
    },
    category: {
      type: String,
      default: ''
    }
  }
}, { _id: false });

/**
 * Delivery address sub-schema
 */
const deliveryAddressSchema = new mongoose.Schema({
  fullName: {
    type: String,
    required: [true, 'Full name is required']
  },
  phone: {
    type: String,
    required: [true, 'Phone number is required']
  },
  addressLine1: {
    type: String,
    required: [true, 'Address line 1 is required']
  },
  addressLine2: {
    type: String,
    default: ''
  },
  city: {
    type: String,
    required: [true, 'City is required']
  },
  province: {
    type: String,
    required: [true, 'Province is required']
  },
  postalCode: {
    type: String,
    required: [true, 'Postal code is required']
  },
  country: {
    type: String,
    default: 'Pakistan'
  }
}, { _id: false });

/**
 * Order Schema
 */
const orderSchema = new mongoose.Schema({
  orderNumber: {
    type: String,
    unique: true,
    index: true
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User is required'],
    index: true
  },
  partner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'FashionPartner',
    required: [true, 'Partner is required'],
    index: true
  },
  items: {
    type: [orderItemSchema],
    required: [true, 'Order must have at least one item']
  },
  totalAmount: {
    type: Number,
    required: [true, 'Total amount is required'],
    min: 0
  },
  currency: {
    type: String,
    default: 'PKR'
  },
  status: {
    type: String,
    enum: {
      values: ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded'],
      message: 'Invalid order status'
    },
    default: 'pending',
    index: true
  },
  paymentStatus: {
    type: String,
    enum: {
      values: ['unpaid', 'paid', 'refunded', 'failed'],
      message: 'Invalid payment status'
    },
    default: 'unpaid'
  },
  paymentMethod: {
    type: String,
    enum: {
      values: ['stripe', 'cod'],
      message: 'Payment method must be stripe or cod'
    },
    default: 'stripe'
  },
  paymentIntentId: {
    type: String,
    default: ''
  },
  deliveryAddress: {
    type: deliveryAddressSchema,
    required: [true, 'Delivery address is required']
  },
  estimatedDelivery: {
    type: Date,
    default: null
  },
  deliveredAt: {
    type: Date,
    default: null
  },
  cancelledAt: {
    type: Date,
    default: null
  },
  cancellationReason: {
    type: String,
    default: ''
  },
  notes: {
    type: String,
    maxLength: 500,
    default: ''
  }
}, {
  timestamps: true
});

/**
 * @description Pre-save hook for orderNumber generation
 * Format: DRP-{YEAR}{MONTH}-{6 random digits}
 * Example: DRP-202401-483920
 */
orderSchema.pre('save', async function(next) {
  if (this.isNew) {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const random = Math.floor(100000 + Math.random() * 900000);
    this.orderNumber = `DRP-${year}${month}-${random}`;
  }
  next();
});

/**
 * @description Index for user's order history
 */
orderSchema.index({ user: 1, createdAt: -1 });

/**
 * @description Index for partner's order management
 */
orderSchema.index({ partner: 1, status: 1 });

/**
 * @description Unique index for order number lookup
 */
orderSchema.index({ orderNumber: 1 }, { unique: true });

const Order = mongoose.model('Order', orderSchema);

module.exports = Order;
