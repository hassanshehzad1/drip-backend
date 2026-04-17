/**
 * @file app.js
 * @description Express application configuration for the Drip Fashion Reels API
 * @module DripApp
 */

//Backend configure karti ha (rules + security + routes)
require('dotenv').config();

/**
 * Express - Fast, unopinionated, minimalist web framework for Node.js
 */
const express = require('express');

/**
 * Helmet - Helps secure Express apps by setting HTTP response headers from hackers
 */
const helmet = require('helmet');

/**
 * CORS - Enable Cross-Origin Resource Sharing for frontend communication
 */
const cors = require('cors');

/**
 * Morgan - HTTP request logger middleware for Node.js which call api
 */
const morgan = require('morgan');

/**
 * Mongo Sanitize - Middleware which sanitizes user-supplied data to prevent MongoDB Operator Injection from hackers and clean the user input
 */
const mongoSanitize = require('express-mongo-sanitize');

/**
 * HPP - Express middleware to protect against HTTP Parameter Pollution attacks duplicate parameters
 */
const hpp = require('hpp');

/**
 * Rate Limit - Basic rate-limiting middleware for Express
 */
const rateLimit = require('express-rate-limit');

/**
 * Cookie Parser - Parse Cookie header and populate req.cookies
 */
const cookieParser = require('cookie-parser');

/**
 * AppError - Custom error class for operational errors
 */
const AppError = require('./utils/AppError');

/**
 * Global error handler middleware
 */
const errorHandler = require('./middleware/error.middleware');

/**
 * Security configurations
 */
const { corsOptions, helmetOptions } = require('./config/security');

/**
 * Global rate limiter
 */
const { globalLimiter } = require('./middleware/rateLimit.middleware');

/**
 * Logger for request logging
 */
const logger = require('./config/logger');

/**
 * Auth routes
 */
const authRoutes = require('./routes/auth.routes');

/**
 * Partner routes
 */
const partnerRoutes = require('./routes/partner.routes');

/**
 * Upload routes
 */
const uploadRoutes = require('./routes/upload.routes');

/**
 * Outfit routes
 */
const outfitRoutes = require('./routes/outfit.routes');

/**
 * Social routes
 */
const socialRoutes = require('./routes/social.routes');

/**
 * Search routes
 */
const searchRoutes = require('./routes/search.routes');

/**
 * Cart routes
 */
const cartRoutes = require('./routes/cart.routes');

/**
 * Order routes
 */
const orderRoutes = require('./routes/order.routes');

/**
 * Chat routes
 */
const chatRoutes = require('./routes/chat.routes');

/**
 * Chat routes
 */
const notificationRoutes = require('./routes/notification.routes');

/**
 * Admin routes
 */
const adminRoutes = require('./routes/admin.routes');

/**
 * AI recommendation routes
 */
const aiRoutes = require('./routes/ai.routes');

/**
 * Initialize Express application
 */
const app = express();

/**
 * Apply security middleware
 */

// Security headers middleware with custom options
app.use(helmet(helmetOptions));

// CORS middleware with whitelist
app.use(cors(corsOptions));

// Parse JSON body - limit 10mb for image uploads
app.use(express.json({ limit: '10mb' }));

// Parse URL encoded data
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Parse cookies
app.use(cookieParser());

// HTTP request logging - only in development
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// Prevent NoSQL injection attacks
app.use(mongoSanitize());

// Prevent HTTP parameter pollution attacks
app.use(hpp());

// Apply global rate limiting
app.use(globalLimiter);

// Request logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    const log = `${req.method} ${req.originalUrl} ${res.statusCode} ${duration}ms`;
    if (res.statusCode >= 400) {
      logger.warn(log);
    } else {
      logger.info(log);
    }
  });
  next();
});

/**
 * Health check endpoint
 */
app.get('/api/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Drip API is running smoothly',
    environment: process.env.NODE_ENV,
    timestamp: new Date().toISOString()
  });
});

/**
 * Route mounts - Phase 2-11 will implement these
 * @todo Implement route modules for each feature
 */
app.use('/api/auth', authRoutes);
app.use('/api/partner', partnerRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/outfit', outfitRoutes);
app.use('/api/social', socialRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/order', orderRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/notification', notificationRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/ai', aiRoutes);

/**
 * 404 handler for unknown routes
 */
app.all('*', (req, res, next) => {
  next(new AppError(`Cannot find ${req.originalUrl} on this server`, 404));
});

/**
 * Global error handling middleware
 */
app.use(errorHandler);

module.exports = app;