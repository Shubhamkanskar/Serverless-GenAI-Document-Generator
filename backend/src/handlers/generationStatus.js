/**
 * Generation Status Handler
 * Checks the processing status of a document generation using DynamoDB
 * Endpoint: GET /api/generation-status/{generationId}
 */

import generationStatusService from '../services/generationStatusService.js';
import { createSuccessResponse, createErrorResponse } from '../utils/errorHandler.js';
import { logger } from '../utils/logger.js';
import { wrapHandler } from '../utils/handlerWrapper.js';

/**
 * Lambda handler for checking generation status
 * @param {Object} event - API Gateway event
 * @param {Object} context - Lambda context
 * @returns {Promise<Object>} Response object
 */
const generationStatusHandler = async (event, context) => {
  logger.info('Generation status handler invoked', {
    method: event.httpMethod,
    path: event.path
  });

  try {
    // Check HTTP method
    if (event.httpMethod !== 'GET') {
      return createErrorResponse(405, 'Method not allowed. Use GET.');
    }

    // Extract generationId from path parameters or path
    const generationId = event.pathParameters?.generationId ||
                         event.path?.split('/').pop() ||
                         event.queryStringParameters?.generationId;

    if (!generationId) {
      return createErrorResponse(400, 'Missing generationId. Provide generationId in path or query parameter.');
    }

    logger.info(`Checking generation status for: ${generationId}`);

    // Get status from DynamoDB
    const statusRecord = await generationStatusService.getStatus(generationId);

    if (!statusRecord) {
      return createErrorResponse(404, 'Generation not found');
    }

    const responseData = {
      generationId: statusRecord.generationId,
      status: statusRecord.status,
      progress: statusRecord.progress || 0,
      currentStep: statusRecord.currentStep,
      message: statusRecord.message,
      createdAt: statusRecord.createdAt,
      updatedAt: statusRecord.updatedAt,
      ...(statusRecord.elapsedTime !== undefined && { elapsedTime: statusRecord.elapsedTime }),
      ...(statusRecord.estimatedTimeRemaining !== undefined && { estimatedTimeRemaining: statusRecord.estimatedTimeRemaining }),
      ...(statusRecord.estimatedTotalTime !== undefined && { estimatedTotalTime: statusRecord.estimatedTotalTime }),
      ...(statusRecord.downloadUrl && { downloadUrl: statusRecord.downloadUrl }),
      ...(statusRecord.fileId && { fileId: statusRecord.fileId }),
      ...(statusRecord.fileName && { fileName: statusRecord.fileName }),
      ...(statusRecord.completedAt && { completedAt: statusRecord.completedAt }),
      ...(statusRecord.failedAt && { failedAt: statusRecord.failedAt }),
      ...(statusRecord.error && { error: statusRecord.error })
    };

    logger.info('Generation status retrieved', {
      generationId,
      status: statusRecord.status,
      progress: statusRecord.progress
    });

    return createSuccessResponse(responseData, 200);

  } catch (error) {
    logger.error('Generation status handler error', error);
    return createErrorResponse(500, 'Failed to check generation status', error);
  }
};

// Export wrapped handler
export const handler = wrapHandler(generationStatusHandler);
