/**
 * Upload Handler
 * Handles file uploads to S3 documents bucket
 * Endpoint: POST /api/upload
 */

import { v4 as uuidv4 } from 'uuid';
import { createSuccessResponse, createErrorResponse, handleAwsError } from '../utils/errorHandler.js';
import { validateFileType, validateFileSize, validateFileExtension } from '../utils/validators.js';
import { logger } from '../utils/logger.js';
import { parseMultipartFormData } from '../utils/multipartParser.js';
import { handleUpload } from '../controllers/uploadController.js';
import { validateMethod, handleOptions } from '../utils/routeHandler.js';
import { ALLOWED_EXTENSIONS } from '../utils/constants.js';
import { wrapHandler } from '../utils/handlerWrapper.js';
import s3Service from '../services/s3Service.js';

/**
 * Lambda handler for file upload
 * @param {Object} event - API Gateway event
 * @param {Object} context - Lambda context
 * @returns {Promise<Object>} Response object
 */
const uploadHandler = async (event, context) => {
  // Ensure context exists
  if (context) {
    context.callbackWaitsForEmptyEventLoop = false;
  }

  logger.info('Upload handler invoked', {
    method: event?.httpMethod,
    path: event?.path,
    hasHeaders: !!event?.headers
  });

  try {
    // Handle OPTIONS preflight
    const optionsResponse = handleOptions(event);
    if (optionsResponse) {
      return optionsResponse;
    }

    // Validate HTTP method
    const methodError = validateMethod(event, 'POST');
    if (methodError) {
      return methodError;
    }

    // Parse multipart form data
    let parsedData;
    try {
      parsedData = await parseMultipartFormData(event);
    } catch (parseError) {
      logger.error('Failed to parse multipart data', parseError);
      return createErrorResponse(400, 'Invalid request format. Expected multipart/form-data.', parseError);
    }

    const { files } = parsedData;

    // Validate file exists
    if (!files || files.length === 0) {
      return createErrorResponse(400, 'No file provided. Please include a file in the request.');
    }

    // Get the first file (assuming single file upload)
    const file = files[0];

    if (!file || !file.buffer) {
      return createErrorResponse(400, 'Invalid file data.');
    }

    // Validate file type (PDF only)
    try {
      validateFileType(file.contentType, ['application/pdf']);
      validateFileExtension(file.filename, ALLOWED_EXTENSIONS.DOCUMENTS);
    } catch (validationError) {
      logger.warn('File validation failed', { error: validationError.message, fileName: file.filename });
      return createErrorResponse(400, validationError.message);
    }

    // Validate file size (max 100MB for PDF)
    // Note: API Gateway REST API has a 10MB payload limit.
    // Files >10MB will automatically use presigned URL uploads (see frontend/src/services/api.js)
    try {
      validateFileSize(file.size, 100);
    } catch (sizeError) {
      logger.warn('File size validation failed', { error: sizeError.message, size: file.size });
      return createErrorResponse(400, sizeError.message);
    }
    
    // Warn if file is >10MB (API Gateway limit)
    // Note: Frontend should handle this automatically by using presigned URLs
    if (file.size > 10 * 1024 * 1024) {
      logger.warn('File size exceeds API Gateway 10MB limit - this should use presigned URL upload', { 
        size: file.size, 
        sizeMB: (file.size / (1024 * 1024)).toFixed(2) 
      });
      // Return error to guide user to use presigned URL endpoint
      return createErrorResponse(413, 'File size exceeds API Gateway 10MB limit. Please use the presigned URL upload endpoint for files larger than 10MB.');
    }

    // Generate unique file ID
    const fileId = uuidv4();
    const uploadedAt = new Date().toISOString();

    // Upload to S3
    let uploadResult;
    try {
      uploadResult = await s3Service.uploadDocument(
        file.buffer,
        file.filename,
        file.contentType,
        fileId
      );
    } catch (uploadError) {
      logger.error('S3 upload failed', uploadError);
      return handleAwsError(uploadError);
    }

    // Prepare response data
    const responseData = {
      fileId,
      fileName: file.filename,
      originalFileName: uploadResult.originalFileName,
      fileSize: file.size,
      contentType: file.contentType,
      s3Key: uploadResult.s3Key,
      s3Bucket: uploadResult.bucket,
      uploadedAt
    };

    logger.info('File uploaded successfully', {
      fileId,
      fileName: file.filename,
      s3Key: uploadResult.s3Key
    });

    return createSuccessResponse(responseData, 201);

  } catch (error) {
    logger.error('Upload handler error', error);
    return createErrorResponse(500, 'File upload failed', error);
  }
};

// Export wrapped handler to ensure all errors are caught and CORS headers are always included
export const handler = wrapHandler(uploadHandler);
