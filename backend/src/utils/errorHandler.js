/**
 * Error Handler Utility
 * Provides standardized error and success response formatting for Lambda functions
 */

/**
 * Creates a standardized error response
 * @param {number} statusCode - HTTP status code
 * @param {string} message - Error message
 * @param {Error|null} error - Optional error object (only shown in development)
 * @returns {Object} Formatted error response
 */
export const createErrorResponse = (statusCode, message, error = null) => {
  const response = {
    statusCode,
    body: JSON.stringify({
      success: false,
      message,
      ...(error && process.env.NODE_ENV === 'development' && { error: error.message })
    }),
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type,Accept,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
      'Access-Control-Max-Age': '86400'
    }
  };
  return response;
};

/**
 * Creates a standardized success response
 * @param {*} data - Response data
 * @param {number} statusCode - HTTP status code (default: 200)
 * @returns {Object} Formatted success response
 */
export const createSuccessResponse = (data, statusCode = 200) => {
  return {
    statusCode,
    body: JSON.stringify({
      success: true,
      data
    }),
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type,Accept,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
      'Access-Control-Max-Age': '86400'
    }
  };
};

/**
 * Handles AWS service errors and converts them to user-friendly messages
 * @param {Error} error - AWS error object
 * @returns {Object} Error response with appropriate status code and message
 */
export const handleAwsError = (error) => {
  const errorCode = error.code || error.$metadata?.httpStatusCode;
  
  switch (errorCode) {
    case 'NoSuchBucket':
    case 'NoSuchKey':
      return createErrorResponse(404, 'Resource not found');
    
    case 'AccessDenied':
      return createErrorResponse(403, 'Access denied. Check IAM permissions');
    
    case 'InvalidParameterValue':
      return createErrorResponse(400, 'Invalid parameter provided');
    
    case 'ThrottlingException':
      return createErrorResponse(429, 'Too many requests. Please try again later');
    
    case 'ServiceUnavailable':
      return createErrorResponse(503, 'Service temporarily unavailable');
    
    default:
      return createErrorResponse(
        500,
        'An unexpected error occurred',
        process.env.NODE_ENV === 'development' ? error : null
      );
  }
};

