/**
 * @file partner.routes.js
 * @description Fashion Partner authentication routes
 * @module PartnerRoutes
 */

const express = require('express');
const { body, validationResult } = require('express-validator');
const rateLimit = require('express-rate-limit');

/**
 * Import controller functions
 */
const {
  register,
  login,
  refreshToken,
  logout,
  getMe,
  updateProfile,
  changePassword,
  getPartnerPublicProfile
} = require('../controllers/partner.controller');

/**
 * Import auth middleware
 */
const { protect } = require('../middleware/authPartner.middleware');

/**
 * Create router
 */
const router = express.Router();

/**
 * @description Auth rate limiter for partner endpoints
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 requests per window
  message: {
    success: false,
    message: 'Too many auth attempts, please try again after 15 minutes'
  }
});

/**
 * @description Validation arrays
 */
const registerValidation = [
  body('brandName')
    .trim()
    .notEmpty()
    .withMessage('Brand name is required')
    .isLength({ min: 2, max: 100 })
    .withMessage('Brand name must be 2-100 characters'),
  body('email')
    .trim()
    .isEmail()
    .withMessage('Please provide a valid email')
    .normalizeEmail(),
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/)
    .withMessage('Password must contain uppercase, lowercase, number and special character'),
  body('category')
    .notEmpty()
    .withMessage('Category is required')
    .isIn(['casual', 'formal', 'streetwear', 'sportswear', 'ethnic', 'luxury', 'accessories', 'footwear', 'kids', 'other'])
    .withMessage('Invalid category')
];

const loginValidation = [
  body('email')
    .trim()
    .isEmail()
    .withMessage('Please provide a valid email'),
  body('password')
    .notEmpty()
    .withMessage('Password is required')
];

/**
 * @description Middleware to validate request
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const validateRequest = (req, res, next) => {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    return res.status(422).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array().map(e => ({
        field: e.path,
        message: e.msg
      }))
    });
  }

  next();
};

/**
 * @route POST /api/partner/auth/register
 * @description Register a new fashion partner
 */
router.post('/auth/register', authLimiter, registerValidation, validateRequest, register);

/**
 * @route POST /api/partner/auth/login
 * @description Login fashion partner
 */
router.post('/auth/login', authLimiter, loginValidation, validateRequest, login);

/**
 * @route POST /api/partner/auth/refresh
 * @description Refresh access token
 */
router.post('/auth/refresh', refreshToken);

/**
 * @route POST /api/partner/auth/logout
 * @description Logout partner
 * @access Private
 */
router.post('/auth/logout', protect, logout);

/**
 * @route GET /api/partner/me
 * @description Get partner profile
 * @access Private
 */
router.get('/me', protect, getMe);

/**
 * @route PATCH /api/partner/update-profile
 * @description Update partner profile
 * @access Private
 */
router.patch('/update-profile', protect, updateProfile);

/**
 * @route PATCH /api/partner/change-password
 * @description Change password
 * @access Private
 */
router.patch('/change-password', protect, changePassword);

/**
 * @route GET /api/partner/:partnerId
 * @description Get partner public profile
 * @access Public
 */
router.get('/:partnerId', getPartnerPublicProfile);

module.exports = router;
