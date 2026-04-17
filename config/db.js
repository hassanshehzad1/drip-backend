/**
 * @file db.js
 * @description MongoDB database connection configuration
 * @module DatabaseConfig
 */

const mongoose = require('mongoose');
const logger = require('./logger');

/**
 * @description Establish connection to MongoDB database
 * @async
 * @returns {Promise<void>}
 */
const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI);
    logger.info(`MongoDB connected: ${conn.connection.host}`);
  } catch (error) {
    logger.error(`MongoDB connection error: ${error.message}`);
    process.exit(1);
  }
};

/**
 * Mongoose connection event listeners
 */
mongoose.connection.on('connected', () => {
  logger.info('MongoDB connected');
});

mongoose.connection.on('error', (err) => {
  logger.error(`MongoDB connection error: ${err.message}`);
});

mongoose.connection.on('disconnected', () => {
  logger.warn('MongoDB disconnected');
});

module.exports = connectDB;
