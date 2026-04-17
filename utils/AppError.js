/**
 * @file AppError.js
 * @description Custom error class for operational errors
 * @module AppError
 */

/**
 * @class AppError
 * @description Custom error class for handling operational errors
 * @extends Error
 */
class AppError extends Error {
  /**
   * @description Create an AppError instance
   * @param {string} message - Error message
   * @param {number} statusCode - HTTP status code
   */
  constructor(message, statusCode) {
    super(message);

    this.statusCode = statusCode;
    this.status = statusCode >= 400 && statusCode < 500 ? 'fail' : 'error';
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}

module.exports = AppError;
