/**
 * Route Handler Utility
 * Provides helper functions for consistent route handling
 */

import { createErrorResponse } from './errorHandler.js';
import { logger } from './logger.js';

/**
 * Handle OPTIONS preflight request
 * @param {Object} event - API Gateway event
 * @returns {Object} CORS response
 */
export const handleOptions = (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,Accept,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
        'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
        'Access-Control-Max-Age': '86400',
        'Content-Type': 'application/json'
      },
      body: ''
    };
  }
  return null;
};

/**
 * Validate HTTP method
 * @param {Object} event - API Gateway event
 * @param {string|Array<string>} allowedMethods - Allowed HTTP method(s)
 * @returns {Object|null} Error response if invalid, null if valid
 */
export const validateMethod = (event, allowedMethods) => {
  const methods = Array.isArray(allowedMethods) ? allowedMethods : [allowedMethods];
  const method = event.httpMethod?.toUpperCase();
  
  if (!methods.includes(method)) {
    return createErrorResponse(
      405,
      `Method not allowed. Allowed methods: ${methods.join(', ')}`
    );
  }
  return null;
};

/**
 * Parse request body safely
 * @param {Object} event - API Gateway event
 * @returns {Object|null} Parsed body or null if invalid
 */
export const parseRequestBody = (event) => {
  try {
    if (!event.body) {
      return null;
    }
    return typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
  } catch (error) {
    logger.warn('Failed to parse request body', { error: error.message });
    return null;
  }
};

/**
 * Extract path parameters from event
 * @param {Object} event - API Gateway event
 * @returns {Object} Path parameters
 */
export const getPathParameters = (event) => {
  return event.pathParameters || {};
};

/**
 * Extract query string parameters from event
 * @param {Object} event - API Gateway event
 * @returns {Object} Query string parameters
 */
export const getQueryParameters = (event) => {
  return event.queryStringParameters || {};
};

/**
 * Wrapper for async route handlers with error handling
 * @param {Function} handler - Async handler function
 * @returns {Function} Wrapped handler
 */
export const asyncHandler = (handler) => {
  return async (event, context) => {
    try {
      // Handle OPTIONS preflight
      const optionsResponse = handleOptions(event);
      if (optionsResponse) {
        return optionsResponse;
      }

      return await handler(event, context);
    } catch (error) {
      logger.error('Route handler error', error);
      return createErrorResponse(500, 'Internal server error', error);
    }
  };
};

