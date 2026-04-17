/**
 * @file error.middleware.js
 * @description Global error handling middleware for the application
 * @module ErrorMiddleware
 */

const logger = require('../config/logger');

/**
 * @description Global error handling middleware
 * @param {Error} err - Error object
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
const errorHandler = (err, req, res, next) => {
  let error = { ...err };
  error.message = err.message;

  // Log error
  logger.error(err);

  // Mongoose CastError - Invalid ObjectId
  if (err.name === 'CastError') {
    const message = `Invalid ${err.path}: ${err.value}`;
    error = { ...error, message, statusCode: 400 };
  }

  // Mongoose duplicate key error
  if (err.code === 11000) {
    const fieldName = Object.keys(err.keyValue)[0];
    const message = `Duplicate field value: ${fieldName} already exists`;
    error = { ...error, message, statusCode: 409 };
  }

  // Mongoose ValidationError
  if (err.name === 'ValidationError') {
    const errors = Object.values(err.errors).map((val) => ({
      field: val.path,
      message: val.message
    }));
    const message = 'Validation Error';
    error = { ...error, message, errors, statusCode: 422 };
  }

  // JWT Invalid Token
  if (err.name === 'JsonWebTokenError') {
    const message = 'Invalid token. Please log in again.';
    error = { ...error, message, statusCode: 401 };
  }

  // JWT Expired Token
  if (err.name === 'TokenExpiredError') {
    const message = 'Your token has expired. Please log in again.';
    error = { ...error, message, statusCode: 401 };
  }

  // Multer file too large
  if (err.name === 'MulterError' && err.code === 'LIMIT_FILE_SIZE') {
    const limit = err.limit ? `${err.limit / (1024 * 1024)}MB` : 'unknown';
    const message = `File too large. Maximum size is ${limit}`;
    error = { ...error, message, statusCode: 400 };
  }

  // SyntaxError in JSON body
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    const message = 'Invalid JSON in request body';
    error = { ...error, message, statusCode: 400 };
  }

  // Payload too large error (413)
  if (err.type === 'entity.too.large') {
    const message = 'Request payload too large';
    error = { ...error, message, statusCode: 413 };
  }

  // CORS error (403)
  if (err.message?.includes('CORS')) {
    const message = 'Cross-origin request blocked';
    error = { ...error, message, statusCode: 403 };
  }

  // MongoDB timeout / connection error (503)
  if (err.name === 'MongooseServerSelectionError') {
    const message = 'Database connection timeout. Please try again.';
    error = { ...error, message, statusCode: 503 };
  }

  const statusCode = error.statusCode || err.statusCode || 500;
  const message = error.message || err.message || 'Internal Server Error';

  // Log 500 errors
  if (statusCode >= 500) {
    logger.error(`[ERROR] ${statusCode} - ${message}`, { error: err });
  }

  // Build response with request ID for debugging
  const response = {
    success: false,
    message,
    statusCode,
    requestId: req.headers['x-request-id'] || 'N/A'
  };

  if (process.env.NODE_ENV === 'development') {
    response.error = err.message;
    response.stack = err.stack;

    // Include validation errors if present
    if (error.errors) {
      response.errors = error.errors;
    }
  }

  res.status(statusCode).json(response);
};

module.exports = errorHandler;
