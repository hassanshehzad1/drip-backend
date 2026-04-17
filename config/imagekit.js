/**
 * @file imagekit.js
 * @description ImageKit configuration for image and video uploads
 * @module ImageKitConfig
 * @todo This will be used in imagekit.service.js for upload operations
 */

const ImageKit = require('imagekit');

/**
 * @description Initialize ImageKit SDK with credentials
 * @type {ImageKit}
 */
const imagekit = new ImageKit({
  publicKey: process.env.IMAGEKIT_PUBLIC_KEY,
  privateKey: process.env.IMAGEKIT_PRIVATE_KEY,
  urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT
});

module.exports = imagekit;
