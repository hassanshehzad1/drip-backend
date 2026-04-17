/**
 * @file OutfitItem.js
 * @description Outfit item model — core of the reels feed.
 * Each outfit is a short video with product details attached.
 * @module OutfitItem
 */

const mongoose = require('mongoose');

/**
 * Valid clothing sizes
 */
const VALID_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL', 'Free Size', 'Custom'];

/**
 * Valid outfit categories
 */
const VALID_CATEGORIES = [
  'casual', 'formal', 'streetwear', 'sportswear',
  'ethnic', 'luxury', 'accessories', 'footwear', 'kids', 'other'
];

/**
 * Valid currencies
 */
const VALID_CURRENCIES = ['PKR', 'USD', 'EUR', 'GBP', 'AED', 'SAR'];

/**
 * Color sub-schema
 */
const colorSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  hexCode: {
    type: String,
    default: ''
  }
}, { _id: false });

/**
 * Video sub-schema
 */
const videoSchema = new mongoose.Schema({
  url: {
    type: String,
    required: [true, 'Video URL is required']
  },
  fileId: {
    type: String,
    required: [true, 'Video file ID is required']
  },
  thumbnailUrl: {
    type: String,
    default: ''
  }
}, { _id: false });

/**
 * Image sub-schema
 */
const imageSchema = new mongoose.Schema({
  url: {
    type: String,
    required: true
  },
  fileId: {
    type: String,
    required: true
  }
}, { _id: false });

/**
 * Outfit Item Schema
 */
const outfitItemSchema = new mongoose.Schema({
  partner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'FashionPartner',
    required: [true, 'Partner is required'],
    index: true
  },
  title: {
    type: String,
    required: [true, 'Outfit title is required'],
    trim: true,
    minLength: [3, 'Title must be at least 3 characters'],
    maxLength: [100, 'Title cannot exceed 100 characters']
  },
  description: {
    type: String,
    trim: true,
    maxLength: [500, 'Description cannot exceed 500 characters'],
    default: ''
  },
  video: {
    type: videoSchema,
    required: [true, 'Video is required']
  },
  images: {
    type: [imageSchema],
    default: [],
    validate: {
      validator: function(v) {
        return v.length <= 5;
      },
      message: 'Maximum 5 images allowed per outfit'
    }
  },
  price: {
    type: Number,
    required: [true, 'Price is required'],
    min: [0, 'Price cannot be negative']
  },
  currency: {
    type: String,
    default: 'PKR',
    enum: {
      values: VALID_CURRENCIES,
      message: `Currency must be one of: ${VALID_CURRENCIES.join(', ')}`
    }
  },
  originalPrice: {
    type: Number,
    min: 0,
    default: null
  },
  sizes: {
    type: [{
      type: String,
      enum: {
        values: VALID_SIZES,
        message: `Size must be one of: ${VALID_SIZES.join(', ')}`
      }
    }],
    required: [true, 'At least one size is required'],
    validate: {
      validator: function(v) {
        return v && v.length > 0;
      },
      message: 'At least one size is required'
    }
  },
  colors: {
    type: [colorSchema],
    default: []
  },
  category: {
    type: String,
    required: [true, 'Category is required'],
    enum: {
      values: VALID_CATEGORIES,
      message: `Category must be one of: ${VALID_CATEGORIES.join(', ')}`
    }
  },
  tags: {
    type: [{
      type: String,
      lowercase: true,
      trim: true,
      maxLength: [30, 'Tag cannot exceed 30 characters']
    }],
    default: [],
    validate: {
      validator: function(v) {
        return v.length <= 10;
      },
      message: 'Maximum 10 tags allowed'
    }
  },
  stock: {
    type: Number,
    default: 0,
    min: 0
  },
  isActive: {
    type: Boolean,
    default: true,
    index: true
  },
  isFeatured: {
    type: Boolean,
    default: false
  },
  likesCount: {
    type: Number,
    default: 0,
    min: 0
  },
  bookmarksCount: {
    type: Number,
    default: 0,
    min: 0
  },
  viewsCount: {
    type: Number,
    default: 0,
    min: 0
  },
  commentsCount: {
    type: Number,
    default: 0,
    min: 0
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

/**
 * @description Virtual field for discount percentage
 */
outfitItemSchema.virtual('discountPercentage').get(function() {
  if (this.originalPrice && this.originalPrice > this.price) {
    return Math.round(((this.originalPrice - this.price) / this.originalPrice) * 100);
  }
  return 0;
});

/**
 * @description Virtual field for stock availability
 */
outfitItemSchema.virtual('isInStock').get(function() {
  return this.stock > 0;
});

/**
 * @description Text index for search
 */
outfitItemSchema.index({
  title: 'text',
  description: 'text',
  tags: 'text',
  category: 'text'
});

/**
 * @description Compound index for feed query (active + newest first)
 */
outfitItemSchema.index({ isActive: 1, createdAt: -1 });

/**
 * @description Partner + active index
 */
outfitItemSchema.index({ partner: 1, isActive: 1 });

/**
 * @description Category + active index for filtered feeds
 */
outfitItemSchema.index({ category: 1, isActive: 1, createdAt: -1 });

const OutfitItem = mongoose.model('OutfitItem', outfitItemSchema);

module.exports = OutfitItem;
