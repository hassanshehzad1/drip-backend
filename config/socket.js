/**
 * @file socket.js
 * @description Socket.io server configuration.
 * Handles real-time connections, authentication,
 * and room management for users and partners.
 * @module SocketConfig
 */

const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const logger = require('./logger');
const User = require('../models/User');
const FashionPartner = require('../models/FashionPartner');

let io = null;

/**
 * @description Initialize Socket.io server
 * @param {http.Server} httpServer - Node HTTP server instance
 * @returns {Server} Configured Socket.io instance
 */
const initSocket = (httpServer) => {
  io = new Server(httpServer, {
    cors: {
      origin: process.env.CLIENT_URL,
      methods: ['GET', 'POST'],
      credentials: true
    },
    pingTimeout: 60000,
    pingInterval: 25000
  });

  /**
   * @description Auth middleware for Socket.io
   * Verifies JWT token on connection handshake
   * Token sent in socket.handshake.auth.token
   */
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token ||
                    socket.handshake.headers?.authorization?.split(' ')[1];

      if (!token) {
        // Allow unauthenticated connections for public events
        socket.user = null;
        socket.partner = null;
        return next();
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      if (decoded.role === 'partner') {
        const partner = await FashionPartner.findById(decoded.id)
          .select('_id brandName isApproved isActive');
        if (partner && partner.isApproved && partner.isActive) {
          socket.partner = partner;
          socket.user = null;
        }
      } else {
        const user = await User.findById(decoded.id)
          .select('_id name isActive');
        if (user && user.isActive) {
          socket.user = user;
          socket.partner = null;
        }
      }
      next();
    } catch (error) {
      // Invalid token — allow as unauthenticated
      socket.user = null;
      socket.partner = null;
      next();
    }
  });

  /**
   * @description Handle socket connections
   */
  io.on('connection', (socket) => {
    logger.info(`Socket connected: ${socket.id}`);

    // Join personal room based on identity
    if (socket.user) {
      const room = `user:${socket.user._id}`;
      socket.join(room);
      logger.info(`User ${socket.user._id} joined room: ${room}`);
    }

    if (socket.partner) {
      const room = `partner:${socket.partner._id}`;
      socket.join(room);
      logger.info(`Partner ${socket.partner._id} joined room: ${room}`);
    }

    // Client can manually join a room (for public outfit rooms)
    socket.on('join_outfit_room', (outfitId) => {
      socket.join(`outfit:${outfitId}`);
      logger.info(`Socket ${socket.id} joined outfit room: ${outfitId}`);
    });

    socket.on('leave_outfit_room', (outfitId) => {
      socket.leave(`outfit:${outfitId}`);
    });

    /**
     * @description Handle typing indicator
     * Client emits this while typing
     */
    socket.on('typing', ({ conversationId, receiverRoom }) => {
      socket.to(receiverRoom).emit('user_typing', {
        conversationId,
        isTyping: true
      });
    });

    /**
     * @description Handle stopped typing
     */
    socket.on('stop_typing', ({ conversationId, receiverRoom }) => {
      socket.to(receiverRoom).emit('user_typing', {
        conversationId,
        isTyping: false
      });
    });

    /**
     * @description Handle joining a conversation room
     * For real-time delivery within active chat
     */
    socket.on('join_conversation', (conversationId) => {
      socket.join(`conv:${conversationId}`);
      logger.info(`Socket ${socket.id} joined conversation: ${conversationId}`);
    });

    socket.on('leave_conversation', (conversationId) => {
      socket.leave(`conv:${conversationId}`);
    });

    // Handle disconnect
    socket.on('disconnect', (reason) => {
      logger.info(`Socket disconnected: ${socket.id} — ${reason}`);
    });

    // Handle errors
    socket.on('error', (error) => {
      logger.error(`Socket error: ${socket.id} — ${error.message}`);
    });
  });

  logger.info('Socket.io initialized successfully');
  return io;
};

/**
 * @description Get the Socket.io instance
 * @returns {Server} Socket.io instance
 * @throws {Error} If socket not initialized yet
 */
const getIO = () => {
  if (!io) {
    throw new Error('Socket.io not initialized. Call initSocket first.');
  }
  return io;
};

module.exports = { initSocket, getIO };
