/**
 * @file validate.middleware.js
 * @description Centralized validation middleware.
 * Reusable validation chains and sanitizers.
 * @module ValidateMiddleware
 */

const { validationResult, body, param } = require('express-validator');

/**
 * @description Standard request validator
 * Use after any express-validator chain
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
exports.validateRequest = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(422).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array().map(err => ({
        field: err.path,
        message: err.msg,
        value: err.value
      }))
    });
  }
  next();
};

/**
 * @description Validate MongoDB ObjectId in params
 * Usage: router.get('/:id', validateObjectId('id'), handler)
 * @param {String} paramName - Parameter name to validate
 * @returns {Array} Express validator chain
 */
exports.validateObjectId = (paramName = 'id') => {
  return param(paramName)
    .isMongoId()
    .withMessage(`Invalid ${paramName} format`);
};

/**
 * @description Common field validators (reusable)
 */
exports.validators = {
  /**
   * @description Email validator
   * @returns {Array} Validator chain
   */
  email: () => body('email')
    .trim()
    .isEmail().withMessage('Please provide a valid email')
    .normalizeEmail()
    .isLength({ max: 255 }).withMessage('Email too long'),

  /**
   * @description Password validator
   * @returns {Array} Validator chain
   */
  password: () => body('password')
    .isLength({ min: 8, max: 128 })
    .withMessage('Password must be 8-128 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/)
    .withMessage('Password must contain uppercase, lowercase, number and special character'),

  /**
   * @description Name field validator
   * @param {String} field - Field name
   * @returns {Array} Validator chain
   */
  name: (field = 'name') => body(field)
    .trim()
    .notEmpty().withMessage(`${field} is required`)
    .isLength({ min: 2, max: 50 })
    .withMessage(`${field} must be 2-50 characters`)
    .escape(), // XSS protection

  /**
   * @description Text field validator
   * @param {String} field - Field name
   * @param {Number} max - Maximum length
   * @returns {Array} Validator chain
   */
  text: (field, max = 500) => body(field)
    .trim()
    .notEmpty().withMessage(`${field} is required`)
    .isLength({ max })
    .withMessage(`${field} cannot exceed ${max} characters`),

  /**
   * @description MongoDB ObjectId validator for body
   * @param {String} field - Field name
   * @returns {Array} Validator chain
   */
  mongoId: (field) => body(field)
    .isMongoId()
    .withMessage(`Invalid ${field}`),

  /**
   * @description Price validator
   * @param {String} field - Field name
   * @returns {Array} Validator chain
   */
  price: (field = 'price') => body(field)
    .isNumeric().withMessage('Price must be a number')
    .custom(val => val >= 0).withMessage('Price cannot be negative'),

  /**
   * @description Pagination params validator
   * @returns {Array} Validator chain
   */
  pagination: () => [
    body('page').optional()
      .isInt({ min: 1 }).withMessage('Page must be positive integer'),
    body('limit').optional()
      .isInt({ min: 1, max: 50 }).withMessage('Limit must be 1-50')
  ]
};

/**
 * @description Sanitize request body
 * Removes any __proto__ or constructor pollution attempts
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
exports.sanitizeBody = (req, res, next) => {
  if (req.body) {
    delete req.body.__proto__;
    delete req.body.constructor;
    delete req.body.prototype;
  }
  next();
};
