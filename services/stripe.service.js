/**
 * @file stripe.service.js
 * @description Stripe payment service —
 * handles payment intent creation and verification
 * @module StripeService
 */

const Stripe = require('stripe');
const AppError = require('../utils/AppError');
const logger = require('../config/logger');

/**
 * @description Initialize Stripe with secret key
 * Fail fast if key is missing
 */
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

/**
 * @description Create a Stripe PaymentIntent
 * @param {Number} amount - Amount in smallest unit
 *                           (PKR uses whole numbers, no paisa)
 * @param {String} currency - Currency code lowercase 'pkr'
 * @param {Object} metadata - Order metadata for Stripe dashboard
 * @returns {Object} { clientSecret, paymentIntentId }
 */
/**
 * @description Create a Stripe PaymentIntent
 * @param {Number} amount   - Amount in PKR (whole number)
 * @param {String} currency - Currency code
 * @param {Object} metadata - Order metadata
 * @returns {Object} { clientSecret, paymentIntentId }
 */
const createPaymentIntent = async (amount, currency, metadata) => {
  try {
    // Stripe requires amount in smallest currency unit
    // PKR is a zero-decimal currency (no paisa subdivision)
    // Minimum amount for PKR is 50 PKR
    // We use USD for Stripe processing to avoid PKR conversion issues
    // Convert PKR to USD approximately for Stripe (1 USD ≈ 278 PKR)
    // OR simply use USD as the Stripe currency with PKR amount as metadata

    // Best approach for Pakistani apps — use USD with minimum $0.50
    // Store actual PKR amount in metadata for reference
    const PKR_TO_USD_RATE = 278;
    const amountInUSD = Math.max(
      Math.round((amount / PKR_TO_USD_RATE) * 100), // convert to cents
      50 // Stripe minimum is 50 cents ($0.50)
    );

    const intent = await stripe.paymentIntents.create({
      amount: amountInUSD,         // in cents (USD)
      currency: 'usd',             // use USD — PKR not well supported by Stripe
      metadata: {
        ...metadata,
        actualAmountPKR: amount,   // store real PKR amount for records
        currency: 'PKR',
        platform: 'drip-app'
      },
      automatic_payment_methods: { enabled: true }
    });

    logger.info(`PaymentIntent created: ${intent.id} for PKR ${amount} (~USD ${(amountInUSD/100).toFixed(2)})`);

    return {
      clientSecret: intent.client_secret,
      paymentIntentId: intent.id
    };
  } catch (error) {
    logger.error(`Stripe createPaymentIntent failed: ${error.message}`);
    throw new AppError('Payment initialization failed. Please try again.', 500);
  }
};


/**
 * @description Retrieve a payment intent by ID
 * Used to verify payment status
 * @param {String} paymentIntentId
 * @returns {Object} Stripe PaymentIntent object
 */
const retrievePaymentIntent = async (paymentIntentId) => {
  try {
    const intent = await stripe.paymentIntents.retrieve(paymentIntentId);
    return intent;
  } catch (error) {
    logger.error(`Stripe retrievePaymentIntent failed: ${error.message}`);
    throw new AppError('Failed to retrieve payment status', 500);
  }
};

/**
 * @description Verify and construct Stripe webhook event
 * Verifies the webhook signature for security
 * @param {Buffer} payload - Raw request body buffer
 * @param {String} signature - Stripe-Signature header value
 * @returns {Object} Stripe Event object
 */
const constructWebhookEvent = (payload, signature) => {
  try {
    const event = stripe.webhooks.constructEvent(
      payload,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );
    return event;
  } catch (error) {
    logger.error(`Stripe webhook verification failed: ${error.message}`);
    throw new AppError('Invalid webhook signature', 400);
  }
};

/**
 * @description Create a refund for a payment
 * @param {String} paymentIntentId
 * @param {Number} amount - Partial refund amount (optional)
 * @returns {Object} Stripe Refund object
 */
const createRefund = async (paymentIntentId, amount) => {
  try {
    const refundData = {
      payment_intent: paymentIntentId
    };

    if (amount) {
      // For PKR, use amount directly; for others, multiply by 100
      refundData.amount = amount;
    }

    const refund = await stripe.refunds.create(refundData);
    logger.info(`Refund created for payment ${paymentIntentId}: ${refund.id}`);
    return refund;
  } catch (error) {
    logger.error(`Stripe createRefund failed: ${error.message}`);
    throw new AppError('Refund processing failed', 500);
  }
};

module.exports = {
  createPaymentIntent,
  retrievePaymentIntent,
  constructWebhookEvent,
  createRefund
};
