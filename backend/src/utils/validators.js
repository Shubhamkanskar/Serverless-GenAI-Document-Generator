/**
 * Validators Utility
 * Provides validation functions for common data types and inputs
 */

/**
 * Validates if a value is a non-empty string
 * @param {*} value - Value to validate
 * @param {string} fieldName - Name of the field (for error messages)
 * @returns {boolean} True if valid
 */
export const validateString = (value, fieldName = 'field') => {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${fieldName} must be a non-empty string`);
  }
  return true;
};

/**
 * Validates if a value is a valid email
 * @param {string} email - Email to validate
 * @returns {boolean} True if valid
 */
export const validateEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    throw new Error('Invalid email format');
  }
  return true;
};

/**
 * Validates if a value is a valid UUID
 * @param {string} uuid - UUID to validate
 * @returns {boolean} True if valid
 */
export const validateUUID = (uuid) => {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(uuid)) {
    throw new Error('Invalid UUID format');
  }
  return true;
};

/**
 * Validates file extension
 * @param {string} filename - File name
 * @param {string[]} allowedExtensions - Array of allowed extensions (e.g., ['pdf', 'docx'])
 * @returns {boolean} True if valid
 */
export const validateFileExtension = (filename, allowedExtensions) => {
  const extension = filename.split('.').pop()?.toLowerCase();
  if (!extension || !allowedExtensions.includes(extension)) {
    throw new Error(`File extension must be one of: ${allowedExtensions.join(', ')}`);
  }
  return true;
};

/**
 * Validates file type (MIME type)
 * @param {string} contentType - MIME type of the file
 * @param {string[]} allowedTypes - Array of allowed MIME types
 * @returns {boolean} True if valid
 */
export const validateFileType = (contentType, allowedTypes = ['application/pdf']) => {
  if (!allowedTypes.includes(contentType)) {
    throw new Error(`Invalid file type. Allowed types: ${allowedTypes.join(', ')}`);
  }
  return true;
};

/**
 * Validates file size
 * @param {number} size - File size in bytes
 * @param {number} maxSizeMB - Maximum size in MB (default: 100 for PDF)
 * @returns {boolean} True if valid
 */
export const validateFileSize = (size, maxSizeMB = 100) => {
  const maxSizeBytes = maxSizeMB * 1024 * 1024;
  if (size > maxSizeBytes) {
    throw new Error(`File size exceeds maximum limit of ${maxSizeMB}MB`);
  }
  return true;
};

/**
 * Validates required fields in an object
 * @param {Object} data - Object to validate
 * @param {string[]} requiredFields - Array of required field names
 * @throws {Error} If any required field is missing
 */
export const validateRequiredFields = (data, requiredFields) => {
  const missingFields = requiredFields.filter(field => !data || data[field] === undefined || data[field] === null);
  if (missingFields.length > 0) {
    throw new Error(`Missing required fields: ${missingFields.join(', ')}`);
  }
};

/**
 * Validates S3 bucket name format
 * @param {string} bucketName - Bucket name to validate
 * @returns {boolean} True if valid
 */
export const validateBucketName = (bucketName) => {
  // S3 bucket naming rules: 3-63 characters, lowercase, numbers, hyphens, dots
  const bucketNameRegex = /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/;
  if (!bucketNameRegex.test(bucketName)) {
    throw new Error('Invalid S3 bucket name format');
  }
  return true;
};

/**
 * Validates ingest request parameters
 * @param {Object} data - Request data with fileId and s3Key
 * @throws {Error} If validation fails
 */
export const validateIngestRequest = ({ fileId, s3Key }) => {
  if (!fileId || typeof fileId !== 'string' || fileId.trim().length === 0) {
    throw new Error('Invalid fileId: must be a non-empty string');
  }

  // Validate UUID format (basic check)
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(fileId)) {
    throw new Error('Invalid fileId: must be a valid UUID');
  }

  if (!s3Key || typeof s3Key !== 'string' || s3Key.trim().length === 0) {
    throw new Error('Invalid s3Key: must be a non-empty string');
  }

  // Validate S3 key format (should start with documents/)
  if (!s3Key.startsWith('documents/')) {
    throw new Error('Invalid s3Key: must start with "documents/"');
  }

  return true;
};

/**
 * Validates generate request parameters
 * @param {Object} data - Request data with useCase and documentIds
 * @throws {Error} If validation fails
 */
export const validateGenerateRequest = ({ useCase, documentIds }) => {
  const validUseCases = ['checksheet', 'workInstructions'];
  
  if (!useCase || typeof useCase !== 'string' || !validUseCases.includes(useCase)) {
    throw new Error(`Invalid useCase. Must be one of: ${validUseCases.join(', ')}`);
  }

  if (!Array.isArray(documentIds) || documentIds.length === 0) {
    throw new Error('documentIds must be a non-empty array');
  }

  if (documentIds.length > 5) {
    throw new Error('Maximum 5 documents allowed per generation');
  }

  // Validate each document ID is a valid UUID
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  for (const docId of documentIds) {
    if (!docId || typeof docId !== 'string' || !uuidRegex.test(docId)) {
      throw new Error(`Invalid documentId: ${docId}. Must be a valid UUID.`);
    }
  }

  return true;
};

