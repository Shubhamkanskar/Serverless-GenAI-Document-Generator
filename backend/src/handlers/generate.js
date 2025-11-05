/**
 * Generate Handler
 * Generates documents using AI based on user requirements and ingested documents
 * Endpoint: POST /api/generate
 */

import { createSuccessResponse, createErrorResponse } from '../utils/errorHandler.js';
import { validateGenerateRequest } from '../utils/validators.js';
import { logger } from '../utils/logger.js';
import { handleGenerate } from '../controllers/generateController.js';
import { validateMethod, handleOptions, parseRequestBody } from '../utils/routeHandler.js';

/**
 * Lambda handler for document generation
 * @param {Object} event - API Gateway event
 * @param {Object} context - Lambda context
 * @returns {Promise<Object>} Response object
 */
export const handler = async (event, context) => {
  logger.info('Generate handler invoked', {
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
    const methodError = validateMethod(event, 'POST');
    if (methodError) {
      return methodError;
    }

    // Parse request body
    const requestBody = parseRequestBody(event);
    if (!requestBody) {
      return createErrorResponse(400, 'Invalid or missing request body');
    }

    const { useCase, documentIds, queryText, llmProvider = 'gemini' } = requestBody;

    // Validate input
    try {
      validateGenerateRequest({ useCase, documentIds });
    } catch (validationError) {
      logger.warn('Request validation failed', { error: validationError.message });
      return createErrorResponse(400, validationError.message);
    }

    logger.info(`Generating ${useCase} for documents: ${documentIds.join(', ')}`);

    // Use controller for business logic
    let responseData;
    try {
      responseData = await handleGenerate({ useCase, documentIds, queryText, llmProvider });
    } catch (generateError) {
      logger.error('Generate controller error', generateError);
      
      // Handle specific error types
      if (generateError.message.includes('No relevant chunks')) {
        return createErrorResponse(404, generateError.message);
      }
      if (generateError.message.includes('Invalid use case')) {
        return createErrorResponse(400, generateError.message);
      }
      
      return createErrorResponse(500, `Document generation failed: ${generateError.message}`, generateError);
    }

    logger.info('Document generation completed successfully', {
      useCase,
      chunksUsed: responseData.chunksUsed,
      processingTime: responseData.processingTime
    });

    return createSuccessResponse(responseData, 200);

  } catch (error) {
    logger.error('Generate handler error', error);
    return createErrorResponse(500, 'Document generation failed', error);
  }
};
