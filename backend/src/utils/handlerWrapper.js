/**
 * Handler Wrapper Utility
 * Wraps Lambda handlers to ensure all responses include CORS headers
 * and all errors are caught and returned as valid API Gateway responses
 */

import { createErrorResponse } from './errorHandler.js';
import { logger } from './logger.js';

// Fallback error response creator in case imports fail
const createFallbackErrorResponse = (statusCode, message) => ({
  statusCode: statusCode || 500,
  body: JSON.stringify({ success: false, message: message || 'Internal server error' }),
  headers: {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,Accept,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Max-Age': '86400'
  }
});

/**
 * Wraps a Lambda handler to ensure:
 * 1. All responses include CORS headers
 * 2. All errors are caught and returned as valid responses
 * 3. Response format is always valid for API Gateway
 * 
 * @param {Function} handler - Lambda handler function
 * @returns {Function} Wrapped handler
 */
export const wrapHandler = (handler) => {
  return async (event, context) => {
    // Set callbackWaitsForEmptyEventLoop to false for faster responses
    if (context) {
      context.callbackWaitsForEmptyEventLoop = false;
    }

    try {
      // Call the original handler
      const response = await handler(event, context);

      // Ensure response is valid
      if (!response || typeof response !== 'object') {
        logger.error('Handler returned invalid response', { response });
        return createErrorResponse(500, 'Invalid response from handler');
      }

      // Ensure response has required fields
      if (!response.statusCode) {
        logger.error('Handler response missing statusCode', { response });
        return createErrorResponse(500, 'Response missing status code');
      }

      // Ensure CORS headers are always present
      if (!response.headers) {
        response.headers = {};
      }

      // Add/update CORS headers
      response.headers['Access-Control-Allow-Origin'] = '*';
      response.headers['Access-Control-Allow-Headers'] = 'Content-Type,Accept,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token';
      response.headers['Access-Control-Allow-Methods'] = 'GET,POST,PUT,DELETE,OPTIONS';
      response.headers['Access-Control-Max-Age'] = '86400';

      // Ensure Content-Type is set for JSON responses
      if (response.body && !response.headers['Content-Type']) {
        try {
          JSON.parse(response.body);
          response.headers['Content-Type'] = 'application/json';
        } catch {
          // Body is not JSON, that's okay
        }
      }

      return response;

    } catch (error) {
      // Catch any unhandled errors
      try {
        logger.error('Unhandled error in handler wrapper', {
          error: error.message,
          stack: error.stack,
          event: {
            httpMethod: event?.httpMethod,
            path: event?.path,
            pathParameters: event?.pathParameters
          }
        });
      } catch (logError) {
        // If logger fails, use console
        console.error('Unhandled error in handler wrapper:', error);
        console.error('Logger also failed:', logError);
      }

      // Return a valid error response with CORS headers
      try {
        return createErrorResponse(
          500,
          'Internal server error',
          process.env.NODE_ENV === 'development' ? error : null
        );
      } catch (responseError) {
        // If createErrorResponse fails, use fallback
        console.error('createErrorResponse failed, using fallback:', responseError);
        return createFallbackErrorResponse(500, 'Internal server error');
      }
    }
  };
};

