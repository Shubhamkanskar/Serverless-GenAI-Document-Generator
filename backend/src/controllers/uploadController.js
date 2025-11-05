/**
 * Upload Controller
 * Business logic for document upload operations
 * Separates controller logic from handler
 */

import { v4 as uuidv4 } from 'uuid';
import s3Service from '../services/s3Service.js';
import { validateFileType, validateFileSize, validateFileExtension } from '../utils/validators.js';
import { logger } from '../utils/logger.js';
import { ALLOWED_EXTENSIONS, MAX_FILE_SIZE } from '../utils/constants.js';

/**
 * Handle file upload
 * @param {Object} file - File object from multipart parser
 * @returns {Promise<Object>} Upload result with fileId and metadata
 */
export const handleUpload = async (file) => {
  try {
    // Validate file
    if (!file || !file.data || !file.filename) {
      throw new Error('Invalid file: file data and filename are required');
    }

    // Validate file type
    validateFileType(file.mimetype);
    validateFileExtension(file.filename);
    validateFileSize(file.data.length);

    // Generate unique file ID
    const fileId = uuidv4();
    logger.info('Generated file ID', { fileId, filename: file.filename });

    // Upload to S3
    const s3Key = `documents/${fileId}/${file.filename}`;
    const uploadResult = await s3Service.uploadDocument(
      file.data,
      file.filename,
      file.mimetype,
      fileId
    );

    logger.info('File uploaded successfully', {
      fileId,
      s3Key: uploadResult.key,
      size: file.data.length
    });

    return {
      fileId,
      fileName: file.filename,
      fileSize: file.data.length,
      contentType: file.mimetype,
      s3Key: uploadResult.key,
      uploadDate: new Date().toISOString()
    };
  } catch (error) {
    logger.error('Upload controller error', error);
    throw error;
  }
};

