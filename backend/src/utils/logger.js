/**
 * Logger Utility
 * Provides consistent logging across the application
 */

/**
 * Logger object with different log levels
 */
export const logger = {
  /**
   * Log informational messages
   * @param {string} message - Log message
   * @param {*} data - Optional data to log
   */
  info: (message, data) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [INFO] ${message}`, data || '');
  },

  /**
   * Log error messages
   * @param {string} message - Error message
   * @param {Error|*} error - Error object or data
   */
  error: (message, error) => {
    const timestamp = new Date().toISOString();
    console.error(`[${timestamp}] [ERROR] ${message}`, error || '');
    if (error instanceof Error && error.stack) {
      console.error(`[${timestamp}] [ERROR] Stack:`, error.stack);
    }
  },

  /**
   * Log warning messages
   * @param {string} message - Warning message
   * @param {*} data - Optional data to log
   */
  warn: (message, data) => {
    const timestamp = new Date().toISOString();
    console.warn(`[${timestamp}] [WARN] ${message}`, data || '');
  },

  /**
   * Log debug messages (only in development)
   * @param {string} message - Debug message
   * @param {*} data - Optional data to log
   */
  debug: (message, data) => {
    if (process.env.NODE_ENV === 'development') {
      const timestamp = new Date().toISOString();
      console.log(`[${timestamp}] [DEBUG] ${message}`, data || '');
    }
  }
};

