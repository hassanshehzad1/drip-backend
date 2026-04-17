/**
 * @file catchAsync.js
 * @description Utility to catch async errors in Express controllers
 * @module CatchAsync
 */

/**
 * @description Wraps async controller functions to catch errors
 * Eliminates need for try-catch in every controller
 * @param {Function} fn - Async function to wrap
 * @returns {Function} Express middleware function with error handling
 */
const catchAsync = (fn) => {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
};

module.exports = catchAsync;
module.exports.catchAsync = catchAsync;
