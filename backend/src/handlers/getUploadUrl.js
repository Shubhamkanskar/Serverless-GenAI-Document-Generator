/**
 * Get Upload URL Handler
 * Generates presigned URLs for direct S3 uploads (for files >10MB)
 * Endpoint: POST /api/get-upload-url
 */

import { v4 as uuidv4 } from 'uuid';
import { createSuccessResponse, createErrorResponse } from '../utils/errorHandler.js';
import { logger } from '../utils/logger.js';
import { validateMethod, handleOptions, parseRequestBody } from '../utils/routeHandler.js';
import s3Service from '../services/s3Service.js';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

/**
 * Lambda handler for generating presigned upload URLs
 * @param {Object} event - API Gateway event
 * @param {Object} context - Lambda context
 * @returns {Promise<Object>} Response object with presigned URL and fileId
 */
const getUploadUrlHandler = async (event, context) => {
  logger.info('Get upload URL handler invoked', {
    method: event?.httpMethod,
    path: event?.path
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

    // Parse request body
    const requestBody = parseRequestBody(event);
    if (!requestBody) {
      return createErrorResponse(400, 'Invalid or missing request body');
    }

    const { fileName, fileSize, contentType = 'application/pdf' } = requestBody;

    // Validate required fields
    if (!fileName) {
      return createErrorResponse(400, 'fileName is required');
    }

    if (!fileSize || fileSize <= 0) {
      return createErrorResponse(400, 'Valid fileSize is required');
    }

    // Validate file size (max 30MB for PDF to control processing costs and server load)
    const maxSize = 30 * 1024 * 1024; // 30MB
    if (fileSize > maxSize) {
      return createErrorResponse(400, `File size exceeds maximum allowed size of ${maxSize / (1024 * 1024)}MB`);
    }

    // Validate content type (PDF only)
    if (contentType !== 'application/pdf') {
      return createErrorResponse(400, 'Only PDF files are allowed');
    }

    // Generate unique file ID
    const fileId = uuidv4();
    const uploadedAt = new Date().toISOString();

    // Sanitize file name
    const sanitizedName = s3Service.sanitizeFileName(fileName);
    const s3Key = `documents/${fileId}/${sanitizedName}`;

    const documentsBucket = process.env.S3_DOCUMENTS_BUCKET || process.env.DOCUMENTS_BUCKET;
    if (!documentsBucket) {
      return createErrorResponse(500, 'S3 documents bucket not configured');
    }

    // Create S3 client (same region as s3Service)
    const region = process.env.AWS_REGION || process.env.REGION || 'us-east-1';
    const s3Client = new S3Client({ region });

    // Create presigned URL for PUT operation
    const command = new PutObjectCommand({
      Bucket: documentsBucket,
      Key: s3Key,
      ContentType: contentType,
      Metadata: {
        originalFileName: fileName,
        fileId: fileId,
        uploadedAt: uploadedAt
      }
    });

    // Generate presigned URL (expires in 1 hour)
    const presignedUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });

    logger.info('Presigned upload URL generated', {
      fileId,
      fileName: sanitizedName,
      s3Key,
      fileSize
    });

    const responseData = {
      fileId,
      fileName: sanitizedName,
      originalFileName: fileName,
      s3Key,
      s3Bucket: documentsBucket,
      presignedUrl,
      expiresIn: 3600, // 1 hour
      uploadedAt
    };

    return createSuccessResponse(responseData, 200);

  } catch (error) {
    logger.error('Get upload URL handler error', error);
    return createErrorResponse(500, 'Failed to generate upload URL', error);
  }
};

export const handler = getUploadUrlHandler;
