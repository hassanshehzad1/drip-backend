/**
 * @file constants.js
 * @description All application constants —
 * enums, limits, messages, config values.
 * Single source of truth. Never hardcode values.
 * @module Constants
 */

/**
 * @description Valid outfit categories
 */
exports.CATEGORIES = [
  'casual', 'formal', 'streetwear', 'sportswear',
  'ethnic', 'luxury', 'accessories', 'footwear',
  'kids', 'other'
];

/**
 * @description Valid clothing sizes
 */
exports.SIZES = [
  'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL',
  'Free Size', 'Custom'
];

/**
 * @description Supported currencies
 */
exports.CURRENCIES = ['PKR', 'USD', 'EUR', 'GBP', 'AED', 'SAR'];

/**
 * @description Order status lifecycle
 */
exports.ORDER_STATUSES = [
  'pending', 'confirmed', 'processing',
  'shipped', 'delivered', 'cancelled', 'refunded'
];

/**
 * @description Payment status states
 */
exports.PAYMENT_STATUSES = ['unpaid', 'paid', 'refunded', 'failed'];

/**
 * @description Notification types
 */
exports.NOTIFICATION_TYPES = [
  'like', 'comment', 'reply', 'follow', 'new_outfit',
  'order_placed', 'order_confirmed', 'order_shipped',
  'order_delivered', 'order_cancelled', 'system'
];

/**
 * @description Valid interaction actions for AI tracking
 */
exports.INTERACTION_ACTIONS = [
  'view', 'like', 'bookmark', 'comment', 'order', 'share'
];

/**
 * @description Admin permission types
 */
exports.ADMIN_PERMISSIONS = [
  'manage_users', 'manage_partners', 'manage_content',
  'manage_orders', 'view_analytics', 'manage_admins'
];

/**
 * @description Application limits and constraints
 */
exports.LIMITS = {
  // Pagination
  DEFAULT_PAGE_SIZE: 10,
  MAX_PAGE_SIZE: 50,
  MAX_FEED_SIZE: 20,
  MAX_CHAT_PAGE_SIZE: 50,

  // File sizes
  MAX_IMAGE_SIZE_MB: 5,
  MAX_VIDEO_SIZE_MB: 100,
  MAX_IMAGE_SIZE_BYTES: 5 * 1024 * 1024,
  MAX_VIDEO_SIZE_BYTES: 100 * 1024 * 1024,

  // Text lengths
  MAX_COMMENT_LENGTH: 500,
  MAX_MESSAGE_LENGTH: 1000,
  MAX_BIO_LENGTH: 500,
  MAX_TITLE_LENGTH: 100,
  MAX_TAGS_COUNT: 10,
  MAX_CART_QUANTITY: 10,

  // AI
  AI_SCORING_POOL: 200,
  MAX_SIMILAR_OUTFITS: 12,
  MAX_TRENDING: 20
};

/**
 * @description Password strength regex
 * Requires: uppercase, lowercase, number, special character
 */
exports.PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/;

/**
 * @description Standard application messages
 */
exports.MESSAGES = {
  AUTH: {
    INVALID_CREDENTIALS: 'Invalid email or password',
    ACCOUNT_DEACTIVATED: 'Your account has been deactivated',
    TOKEN_INVALID: 'Invalid token. Please log in again.',
    TOKEN_EXPIRED: 'Your session has expired. Please log in again.',
    NOT_LOGGED_IN: 'You are not logged in. Please log in to get access.',
    UNAUTHORIZED: 'You do not have permission to perform this action',
    ADMIN_REQUIRED: 'Access denied. Admin account required.',
    PARTNER_REQUIRED: 'Access denied. Partner account required.'
  },
  VALIDATION: {
    REQUIRED: (field) => `${field} is required`,
    MIN_LENGTH: (field, min) => `${field} must be at least ${min} characters`,
    MAX_LENGTH: (field, max) => `${field} cannot exceed ${max} characters`,
    INVALID_EMAIL: 'Please provide a valid email address',
    WEAK_PASSWORD: 'Password must contain uppercase, lowercase, number and special character',
    INVALID_ID: (field) => `Invalid ${field} ID`,
    NOT_FOUND: (entity) => `${entity} not found`
  },
  SUCCESS: {
    CREATED: (entity) => `${entity} created successfully`,
    UPDATED: (entity) => `${entity} updated successfully`,
    DELETED: (entity) => `${entity} deleted successfully`,
    LOGGED_IN: 'Login successful',
    LOGGED_OUT: 'Logged out successfully'
  }
};
