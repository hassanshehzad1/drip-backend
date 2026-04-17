/**
 * @file rateLimit.middleware.js
 * @description Rate limiting middleware for all routes.
 * Prevents brute force, DDoS, and API abuse.
 * Different limits for different route sensitivity.
 * @module RateLimitMiddleware
 */

const rateLimit = require('express-rate-limit');
const logger = require('../config/logger');

/**
 * @description Helper to create rate limiter with logging
 * @param {Object} options - Rate limit options
 * @returns {Function} Express rate limit middleware
 */
const createLimiter = (options) => {
  return rateLimit({
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res, next, options) => {
      logger.warn(
        `Rate limit exceeded: ${req.ip} → ${req.originalUrl}`
      );
      res.status(429).json({
        success: false,
        message: options.message,
        retryAfter: Math.ceil(options.windowMs / 1000 / 60) + ' minutes'
      });
    },
    ...options
  });
};

/**
 * @description Global rate limiter for all routes
 * 100 requests per 15 minutes per IP
 */
exports.globalLimiter = createLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: 'Too many requests from this IP. Try again after 15 minutes.'
});

/**
 * @description Authentication rate limiter
 * 10 attempts per 15 minutes, skips successful requests
 */
exports.authLimiter = createLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  message: 'Too many auth attempts. Try again after 15 minutes.',
  skipSuccessfulRequests: true // Don't count successful logins
});

/**
 * @description Strict rate limiter for sensitive operations
 * 5 attempts per 15 minutes
 */
exports.strictLimiter = createLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  message: 'Too many attempts. Try again after 15 minutes.'
});

/**
 * @description Upload rate limiter
 * 20 uploads per hour
 */
exports.uploadLimiter = createLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20,
  message: 'Upload limit reached. Try again after 1 hour.'
});

/**
 * @description Search rate limiter
 * 30 searches per minute
 */
exports.searchLimiter = createLimiter({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 30,
  message: 'Too many search requests. Slow down a bit.'
});

/**
 * @description AI recommendations rate limiter
 * 20 requests per minute
 */
exports.aiLimiter = createLimiter({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 20,
  message: 'Too many AI requests. Try again in a minute.'
});

/**
 * @description Tracking rate limiter
 * 60 requests per minute — high limit since called frequently
 */
exports.trackingLimiter = createLimiter({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 60, // High limit — called frequently by frontend
  message: 'Too many tracking requests.'
});
