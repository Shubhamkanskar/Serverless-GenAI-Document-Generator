/**
 * Download Handler
 * Generates presigned URLs for downloading generated documents
 * Endpoint: GET /api/download/{fileId}?s3Key=...
 * 
 * Note: The s3Key should be obtained from the generate-document response.
 * For convenience, you can also pass it as a query parameter.
 */

import s3Service from '../services/s3Service.js';
import { createSuccessResponse, createErrorResponse, handleAwsError } from '../utils/errorHandler.js';
import { logger } from '../utils/logger.js';
import { validateMethod, handleOptions, getPathParameters, getQueryParameters } from '../utils/routeHandler.js';

/**
 * Lambda handler for document download
 * @param {Object} event - API Gateway event with fileId in path and optional s3Key in query
 * @param {Object} context - Lambda context
 * @returns {Promise<Object>} Response object with presigned URL
 */
export const handler = async (event, context) => {
  logger.info('Download handler invoked', {
    method: event.httpMethod,
    path: event.path
  });

  try {
    // Handle OPTIONS preflight
    const optionsResponse = handleOptions(event);
    if (optionsResponse) {
      return optionsResponse;
    }

    // Validate HTTP method
    const methodError = validateMethod(event, 'GET');
    if (methodError) {
      return methodError;
    }

    // Extract fileId from path parameters
    const pathParams = getPathParameters(event);
    const fileId = pathParams?.fileId || pathParams?.documentId;

    if (!fileId) {
      return createErrorResponse(400, 'File ID is required in the URL path');
    }

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(fileId)) {
      return createErrorResponse(400, 'Invalid file ID format. Must be a valid UUID.');
    }

    // Get s3Key from query parameters or construct from fileId
    const queryParams = getQueryParameters(event);
    const s3Key = queryParams?.s3Key;

    const bucket = process.env.S3_OUTPUTS_BUCKET || process.env.OUTPUTS_BUCKET;
    if (!bucket) {
      logger.error('S3_OUTPUTS_BUCKET or OUTPUTS_BUCKET environment variable is not set');
      return createErrorResponse(500, 'Server configuration error: S3_OUTPUTS_BUCKET or OUTPUTS_BUCKET not set');
    }

    let finalS3Key;

    if (s3Key) {
      // Use provided s3Key
      finalS3Key = s3Key;
      logger.info('Using s3Key from query parameter', { fileId, s3Key: finalS3Key });
    } else {
      // Try to construct s3Key from fileId pattern
      // Note: This assumes the file is in outputs/{fileId}/filename pattern
      // Since we don't know the exact filename, we'll return an error asking for s3Key
      return createErrorResponse(
        400,
        's3Key query parameter is required. Please provide the s3Key from the generate-document response. Example: /api/download/{fileId}?s3Key=outputs/{fileId}/filename.xlsx'
      );
    }

    // Validate s3Key format
    if (!finalS3Key.startsWith('outputs/')) {
      return createErrorResponse(400, 'Invalid s3Key format. Must start with "outputs/"');
    }

    // Get expiration time from query (default: 1 hour)
    const expiresIn = parseInt(queryParams?.expiresIn || '3600', 10);
    if (expiresIn < 60 || expiresIn > 86400) {
      return createErrorResponse(400, 'expiresIn must be between 60 and 86400 seconds (1 minute to 24 hours)');
    }

    logger.info('Generating presigned download URL', {
      fileId,
      s3Key: finalS3Key,
      expiresIn
    });

    // Generate presigned URL
    let downloadUrl;
    try {
      downloadUrl = await s3Service.getPresignedUrl(
        bucket,
        finalS3Key,
        expiresIn
      );

      logger.info('Presigned URL generated successfully', {
        fileId,
        expiresIn
      });
    } catch (urlError) {
      logger.error('Presigned URL generation failed', urlError);
      return handleAwsError(urlError);
    }

    return createSuccessResponse({
      fileId,
      downloadUrl,
      s3Key: finalS3Key,
      expiresIn,
      expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
      bucket
    });

  } catch (error) {
    logger.error('Download handler error', error);
    return createErrorResponse(500, 'Failed to generate download URL', error);
  }
};
