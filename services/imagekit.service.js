/**
 * @file imagekit.service.js
 * @description ImageKit CDN service — handles all file upload and delete operations
 * @module ImageKitService
 */

const imagekitInstance = require('../config/imagekit');
const logger = require('../config/logger');
const AppError = require('../utils/AppError');

/**
 * @description Upload a file buffer to ImageKit CDN
 * @param {Buffer} fileBuffer - File buffer from multer
 * @param {String} fileName   - Original file name
 * @param {String} folder     - ImageKit folder path e.g. '/drip/outfits' or '/drip/avatars'
 * @param {String} fileType   - 'image' or 'video'
 * @returns {Object} { url, fileId, thumbnailUrl, name }
 */
const uploadToImageKit = async (fileBuffer, fileName, folder, fileType) => {
  try {
    // Convert buffer to base64
    const base64String = fileBuffer.toString('base64');

    // Generate unique fileName
    const uniqueFileName = `${Date.now()}_${fileName.replace(/\s+/g, '_')}`;

    // Upload to ImageKit
    const result = await imagekitInstance.upload({
      file: base64String,
      fileName: uniqueFileName,
      folder: folder,
      useUniqueFileName: false
    });

    // Log success
    logger.info(`File uploaded to ImageKit: ${uniqueFileName} in folder ${folder}`);

    // Return upload result
    return {
      url: result.url,
      fileId: result.fileId,
      thumbnailUrl: result.thumbnailUrl || result.url,
      name: result.name
    };
  } catch (error) {
    logger.error(`ImageKit upload failed: ${error.message}`);
    throw new AppError('File upload failed. Please try again.', 500);
  }
};

/**
 * @description Delete a file from ImageKit CDN by fileId
 * @param {String} fileId - ImageKit file ID to delete
 * @returns {Boolean} true on success, false on failure
 */
const deleteFromImageKit = async (fileId) => {
  // If no fileId provided, nothing to delete
  if (!fileId) {
    return true;
  }

  try {
    await imagekitInstance.deleteFile(fileId);
    logger.info(`File deleted from ImageKit: ${fileId}`);
    return true;
  } catch (error) {
    // Log warning but don't throw - deletion failure shouldn't break main operation
    logger.warn(`Failed to delete file from ImageKit: ${fileId} - ${error.message}`);
    return false;
  }
};

/**
 * @description Generate a transformed ImageKit URL
 * @param {String} filePath       - ImageKit file path
 * @param {Array}  transformations - ImageKit transformations array
 * @returns {String} transformed URL
 */
const getImageKitUrl = (filePath, transformations) => {
  return imagekitInstance.url({
    path: filePath,
    transformation: transformations || []
  });
};

module.exports = {
  uploadToImageKit,
  deleteFromImageKit,
  getImageKitUrl
};
