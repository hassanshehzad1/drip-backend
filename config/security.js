/**
 * @file security.js
 * @description Security configuration —
 * CORS, helmet, CSP headers, cookie options.
 * Centralized security settings.
 * @module SecurityConfig
 *
 * SECURITY MEASURES IMPLEMENTED:
 *
 * 1. HELMET     — Sets 15+ security HTTP headers
 *                 Prevents XSS, clickjacking, MIME sniffing
 *
 * 2. CORS       — Whitelist only frontend origins
 *                 Blocks unauthorized cross-origin requests
 *
 * 3. RATE LIMIT — Different limits per route sensitivity
 *                 Prevents brute force and DDoS
 *
 * 4. MONGO SANITIZE — Strips $ and . from inputs
 *                     Prevents NoSQL injection attacks
 *
 * 5. HPP        — Prevents HTTP parameter pollution
 *                 e.g. ?sort=asc&sort=desc attack
 *
 * 6. BCRYPT     — Password hashing (salt rounds: 12)
 *                 Industry standard — cannot be reversed
 *
 * 7. JWT        — Stateless auth with expiry
 *                 Access: 15min, Refresh: 7 days
 *
 * 8. HTTPONLY COOKIES — Refresh tokens in httpOnly cookie
 *                       Cannot be accessed by JavaScript
 *
 * 9. INPUT VALIDATION — express-validator on all inputs
 *                       422 on invalid data
 *
 * 10. XSS ESCAPE  — .escape() on text fields
 *                   Strips HTML/JS from inputs
 *
 * 11. ENV VALIDATION — Fail fast on missing secrets
 *                      Never deploy without required vars
 *
 * 12. SELECT FALSE — Password/refreshToken never returned
 *                    Even if accidentally queried
 *
 * 13. OWNERSHIP CHECK — Users can only modify own data
 *                       Partner can only edit own outfits
 *
 * 14. ROLE BASED ACCESS — Admin, Partner, User roles
 *                         403 on wrong role access
 *
 * 15. SOFT DELETE — Data never permanently lost
 *                   Can restore if mistake made
 */

/**
 * @description CORS configuration
 * Whitelist allowed origins
 */
exports.corsOptions = {
  origin: (origin, callback) => {
    const whitelist = [
      process.env.CLIENT_URL,
      process.env.ADMIN_URL || 'http://localhost:5174',
      'http://localhost:5173',
      'http://localhost:3000'
    ];

    // Allow requests with no origin (mobile apps, Postman)
    if (!origin || whitelist.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`CORS: Origin ${origin} not allowed`));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type', 'Authorization',
    'X-Requested-With', 'stripe-signature'
  ],
  exposedHeaders: ['X-Total-Count', 'X-Page-Count']
};

/**
 * @description Helmet security headers configuration
 * Protects against common web vulnerabilities
 */
exports.helmetOptions = {
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https://ik.imagekit.io"],
      connectSrc: ["'self'", "https://api.stripe.com"],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"]
    }
  },
  crossOriginEmbedderPolicy: false // needed for ImageKit
};

/**
 * @description Cookie security options
 * Different for dev and production
 */
exports.cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
  maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
};

/**
 * @description Validate all required environment variables
 * Call at server startup — fail fast if missing
 */
exports.validateEnvVars = () => {
  const required = [
    'MONGO_URI',
    'JWT_SECRET',
    'JWT_REFRESH_SECRET',
    'JWT_EXPIRES_IN',
    'JWT_REFRESH_EXPIRES_IN',
    'PORT',
    'NODE_ENV',
    'CLIENT_URL'
  ];

  const optional = [
    'IMAGEKIT_PUBLIC_KEY',
    'IMAGEKIT_PRIVATE_KEY',
    'IMAGEKIT_URL_ENDPOINT',
    'STRIPE_SECRET_KEY',
    'STRIPE_WEBHOOK_SECRET',
    'ADMIN_EMAIL',
    'ADMIN_PASSWORD'
  ];

  const missing = required.filter(key => !process.env[key]);

  if (missing.length > 0) {
    console.error('❌ Missing required environment variables:');
    missing.forEach(key => console.error(`   - ${key}`));
    process.exit(1);
  }

  const missingOptional = optional.filter(key => !process.env[key]);
  if (missingOptional.length > 0) {
    console.warn('⚠️  Missing optional env vars (some features disabled):');
    missingOptional.forEach(key => console.warn(`   - ${key}`));
  }

  console.log('✅ Environment variables validated');
};

/**
 * @description Check JWT secret strength
 * Warn if secrets are too weak
 */
exports.validateSecrets = () => {
  const jwtSecret = process.env.JWT_SECRET || '';
  const refreshSecret = process.env.JWT_REFRESH_SECRET || '';

  if (jwtSecret.length < 32) {
    console.warn('⚠️  JWT_SECRET is too short. Use at least 32 characters.');
  }

  if (refreshSecret.length < 32) {
    console.warn('⚠️  JWT_REFRESH_SECRET is too short. Use at least 32 characters.');
  }

  if (jwtSecret === refreshSecret) {
    console.error('❌ JWT_SECRET and JWT_REFRESH_SECRET must be different!');
    process.exit(1);
  }
};
