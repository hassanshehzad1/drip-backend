/**
 * @file logger.js
 * @description Winston logger configuration for application logging
 * @module LoggerConfig
 */

const winston = require('winston');
const fs = require('fs');
const path = require('path');

const { combine, timestamp, json, errors, splat, printf, colorize } = winston.format;

/**
 * Create logs directory if it doesn't exist
 */
const logsDir = path.join(__dirname, '..', 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

/**
 * Custom format for console output in development
 */
const consoleFormat = printf(({ level, message, timestamp, stack }) => {
  if (stack) {
    return `${timestamp} [${level}]: ${message}\n${stack}`;
  }
  return `${timestamp} [${level}]: ${message}`;
});

/**
 * Winston logger configuration
 */
const logger = winston.createLogger({
  format: combine(
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    errors({ stack: true }),
    splat(),
    json()
  ),
  defaultMeta: { service: 'drip-backend' },
  transports: [
    /**
     * Write all logs with level 'error' to error.log
     */
    new winston.transports.File({
      filename: path.join(logsDir, 'error.log'),
      level: 'error',
      handleExceptions: true
    }),
    /**
     * Write all logs to combined.log
     */
    new winston.transports.File({
      filename: path.join(logsDir, 'combined.log')
    })
  ]
});

/**
 * Add console transport for development environment
 */
if (process.env.NODE_ENV === 'development') {
  logger.add(new winston.transports.Console({
    format: combine(
      colorize(),
      timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
      consoleFormat
    )
  }));
}

module.exports = logger;
