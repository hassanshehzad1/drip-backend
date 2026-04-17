/**
 * @file server.js
 * @description Main entry point for the Drip Fashion Reels API
 * @module DripServer
 */

require('dotenv').config();

const http = require('http');

/**
 * Security configuration - validate env vars and secrets
 */
const { validateEnvVars, validateSecrets } = require('./config/security');

/**
 * ConnectDB - Database connection function
 */
const connectDB = require('./config/db');

/**
 * Logger - Winston logger instance
 */
const logger = require('./config/logger');

/**
 * Import Express App
 */
const app = require('./app');

/**
 * Socket.io initialization
 */
const { initSocket } = require('./config/socket');

/**
 * Validate required environment variables
 * Fail fast if any required env vars are missing
 */
validateEnvVars();

/**
 * Check JWT secret strength
 */
validateSecrets();

/**
 * Connect to MongoDB
 */
connectDB();

/**
 * Create HTTP server from Express app (needed for Socket.io)
 */
const server = http.createServer(app);

/**
 * Initialize Socket.io
 */
const io = initSocket(server);
app.set('io', io);

/**
 * Server configuration
 */
const PORT = process.env.PORT || 5000;
const NODE_ENV = process.env.NODE_ENV || 'development';

/**
 * Start HTTP server
 */
server.listen(PORT, () => {
  logger.info(`Server running in ${NODE_ENV} mode on port ${PORT}`);
  logger.info(`Health check: http://localhost:${PORT}/api/health`);
});

/**
 * Graceful shutdown handlers
 */

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  logger.error('UNHANDLED REJECTION! Shutting down...');
  logger.error(err.name, err.message);
  server.close(() => {
    process.exit(1);
  });
});

// Handle uncaught exceptions crash errors
process.on('uncaughtException', (err) => {
  logger.error('UNCAUGHT EXCEPTION! Shutting down...');
  logger.error(err.name, err.message);
  process.exit(1);
});

// Handle SIGTERM signal safely close server
process.on('SIGTERM', () => {
  logger.info('SIGTERM received. Shutting down gracefully...');
  server.close(() => {
    logger.info('Process terminated.');
  });
});