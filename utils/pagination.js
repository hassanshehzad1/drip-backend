/**
 * @file pagination.js
 * @description Utility function for calculating pagination parameters
 * @module Pagination
 */

/**
 * @description Calculate pagination parameters from query string
 * @param {Object} query - Express query object
 * @returns {Object} Pagination parameters { page, limit, skip }
 */
const getPagination = (query) => {
  let page = parseInt(query.page, 10) || 1;
  let limit = parseInt(query.limit, 10) || 10;

  // Ensure minimum values
  page = Math.max(page, 1);
  limit = Math.max(limit, 1);

  // Enforce maximum limit to prevent abuse
  limit = Math.min(limit, 50);

  const skip = (page - 1) * limit;

  return { page, limit, skip };
};

module.exports = getPagination;
module.exports.getPagination = getPagination;
