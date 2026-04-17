/**
 * @file sendResponse.js
 * @description Utility function for sending standardized API responses
 * @module SendResponse
 */

/**
 * @description Send a standardized API response
 * @param {Object} res - Express response object
 * @param {number} statusCode - HTTP status code
 * @param {string} message - Response message
 * @param {Object} [data=null] - Response data payload
 * @param {Object} [pagination=null] - Pagination metadata
 * @returns {Object} Express response
 */
const sendResponse = (res, statusCode, message, data = null, pagination = null) => {
  const response = {
    success: statusCode < 400,
    message,
    data,
    ...(pagination && { pagination })
  };

  return res.status(statusCode).json(response);
};

module.exports = sendResponse;
module.exports.sendResponse = sendResponse;
