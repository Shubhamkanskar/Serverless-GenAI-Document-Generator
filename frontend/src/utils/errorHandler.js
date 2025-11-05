/**
 * Enhanced API error handler with user-friendly messages
 * @param {Error} error - The error object from axios or fetch
 * @returns {string} User-friendly error message
 */
export const handleApiError = (error) => {
  // Log error for debugging
  console.error('API Error:', error);

  // Axios error structure
  if (error.response) {
    // Server responded with error status
    const status = error.response.status;
    const data = error.response.data;

    // Handle specific HTTP status codes
    switch (status) {
      case 400:
        return data?.message || 'Invalid request. Please check your input and try again.';
      case 401:
        return 'Authentication required. Please log in and try again.';
      case 403:
        return 'You do not have permission to perform this action.';
      case 404:
        return data?.message || 'The requested resource was not found.';
      case 409:
        return data?.message || 'A conflict occurred. The resource may already exist.';
      case 413:
        return 'File too large. Please upload a smaller file.';
      case 422:
        return data?.message || 'Validation failed. Please check your input.';
      case 429:
        return 'Too many requests. Please wait a moment and try again.';
      case 500:
        return 'Server error occurred. Please try again later.';
      case 503:
        return 'Service temporarily unavailable. Please try again later.';
      default:
        return data?.message || `Server error (${status}). Please try again.`;
    }
  } else if (error.request) {
    // Request was made but no response received
    if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
      return 'Request timed out. Please check your connection and try again.';
    }
    if (error.code === 'ERR_NETWORK' || error.message?.includes('Network Error')) {
      return 'Network error. Please check your internet connection and try again.';
    }
    return 'Unable to connect to server. Please check your connection and try again.';
  } else {
    // Error in request setup
    if (error.message?.includes('timeout')) {
      return 'Request timed out. Please try again.';
    }
    return error.message || 'An unexpected error occurred. Please try again.';
  }
};

/**
 * Check if error is a network error
 * @param {Error} error - The error object
 * @returns {boolean} True if network error
 */
export const isNetworkError = (error) => {
  return (
    !error.response &&
    (error.request ||
      error.code === 'ERR_NETWORK' ||
      error.message?.includes('Network Error') ||
      error.message?.includes('timeout'))
  );
};

/**
 * Check if error is a timeout error
 * @param {Error} error - The error object
 * @returns {boolean} True if timeout error
 */
export const isTimeoutError = (error) => {
  return (
    error.code === 'ECONNABORTED' ||
    error.message?.includes('timeout') ||
    error.message?.includes('Timeout')
  );
};

/**
 * Get user-friendly error message based on error type
 * @param {Error|string} error - The error object or message string
 * @returns {string} User-friendly error message
 */
export const getErrorMessage = (error) => {
  if (typeof error === 'string') {
    return error;
  }
  if (error instanceof Error) {
    return handleApiError(error);
  }
  return 'An unexpected error occurred. Please try again.';
};

