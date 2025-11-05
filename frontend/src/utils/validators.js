/**
 * Input validation utilities
 */

/**
 * Validate file for upload
 * @param {File} file - The file to validate
 * @returns {{ valid: boolean, error?: string }}
 */
export const validateFile = (file) => {
  if (!file) {
    return { valid: false, error: 'No file selected' };
  }

  // Check file type
  const allowedTypes = ['application/pdf'];
  if (!allowedTypes.includes(file.type)) {
    return { valid: false, error: 'Only PDF files are allowed' };
  }

  // Check file size (100MB max for PDF)
  const maxSize = 100 * 1024 * 1024; // 100MB
  if (file.size > maxSize) {
    return {
      valid: false,
      error: `File size must be less than ${maxSize / (1024 * 1024)}MB`
    };
  }

  if (file.size === 0) {
    return { valid: false, error: 'File is empty' };
  }

  return { valid: true };
};

/**
 * Validate use case selection
 * @param {string} useCase - The use case value
 * @param {Object} validUseCases - Object with valid use case values
 * @returns {{ valid: boolean, error?: string }}
 */
export const validateUseCase = (useCase, validUseCases) => {
  if (!useCase) {
    return { valid: false, error: 'Please select a use case' };
  }

  if (!Object.values(validUseCases).includes(useCase)) {
    return { valid: false, error: 'Invalid use case selected' };
  }

  return { valid: true };
};

/**
 * Validate document IDs array
 * @param {Array<string>} documentIds - Array of document IDs
 * @returns {{ valid: boolean, error?: string }}
 */
export const validateDocumentIds = (documentIds) => {
  if (!documentIds || !Array.isArray(documentIds)) {
    return { valid: false, error: 'Document IDs must be an array' };
  }

  if (documentIds.length === 0) {
    return { valid: false, error: 'Please select at least one document' };
  }

  // Validate each ID is a string
  const invalidIds = documentIds.filter(id => typeof id !== 'string' || !id.trim());
  if (invalidIds.length > 0) {
    return { valid: false, error: 'Invalid document ID format' };
  }

  return { valid: true };
};

/**
 * Validate file ID
 * @param {string} fileId - The file ID to validate
 * @returns {{ valid: boolean, error?: string }}
 */
export const validateFileId = (fileId) => {
  if (!fileId) {
    return { valid: false, error: 'File ID is required' };
  }

  if (typeof fileId !== 'string') {
    return { valid: false, error: 'File ID must be a string' };
  }

  // UUID format validation (basic check)
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(fileId)) {
    return { valid: false, error: 'Invalid file ID format' };
  }

  return { valid: true };
};

/**
 * Validate S3 key
 * @param {string} s3Key - The S3 key to validate
 * @returns {{ valid: boolean, error?: string }}
 */
export const validateS3Key = (s3Key) => {
  if (!s3Key) {
    return { valid: false, error: 'S3 key is required' };
  }

  if (typeof s3Key !== 'string') {
    return { valid: false, error: 'S3 key must be a string' };
  }

  if (s3Key.length > 1024) {
    return { valid: false, error: 'S3 key is too long' };
  }

  return { valid: true };
};

