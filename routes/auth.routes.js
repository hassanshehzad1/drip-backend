/**
 * @file auth.routes.js
 * @description Authentication routes with validation
 * @module AuthRoutes
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
  changePassword
} = require('../controllers/auth.controller');

/**
 * Import auth middleware
 */
const { protect } = require('../middleware/authUser.middleware');

/**
 * Create router
 */
const router = express.Router();

/**
 * @description Auth rate limiter - stricter limits for auth endpoints
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
  body('name')
    .trim()
    .notEmpty()
    .withMessage('Name is required')
    .isLength({ min: 2, max: 50 })
    .withMessage('Name must be 2-50 characters'),
  body('email')
    .trim()
    .isEmail()
    .withMessage('Please provide a valid email')
    .normalizeEmail(),
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .withMessage('Password must contain uppercase, lowercase, number and special character')
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
 * @route POST /api/auth/register
 * @description Register a new user
 */
router.post('/register', authLimiter, registerValidation, validateRequest, register);

/**
 * @route POST /api/auth/login
 * @description Login user
 */
router.post('/login', authLimiter, loginValidation, validateRequest, login);

/**
 * @route POST /api/auth/refresh
 * @description Refresh access token
 */
router.post('/refresh', refreshToken);

/**
 * @route POST /api/auth/logout
 * @description Logout user
 * @access Private
 */
router.post('/logout', protect, logout);

/**
 * @route GET /api/auth/me
 * @description Get current user profile
 * @access Private
 */
router.get('/me', protect, getMe);

/**
 * @route PATCH /api/auth/update-profile
 * @description Update user profile
 * @access Private
 */
router.patch('/update-profile', protect, updateProfile);

/**
 * @route PATCH /api/auth/change-password
 * @description Change password
 * @access Private
 */
router.patch('/change-password', protect, changePassword);

module.exports = router;
