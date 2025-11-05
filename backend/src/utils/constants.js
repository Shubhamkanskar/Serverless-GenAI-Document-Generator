/**
 * Constants Utility
 * Application-wide constants and configuration values
 */

// File size limits (in bytes)
export const MAX_FILE_SIZE = {
  PDF: 100 * 1024 * 1024, // 100MB
  DOCX: 10 * 1024 * 1024, // 10MB
  EXCEL: 10 * 1024 * 1024, // 10MB
  DEFAULT: 100 * 1024 * 1024 // 100MB
};

// Allowed file extensions
export const ALLOWED_EXTENSIONS = {
  DOCUMENTS: ['pdf', 'docx', 'doc'],
  EXCEL: ['xlsx', 'xls', 'csv'],
  ALL: ['pdf', 'docx', 'doc', 'xlsx', 'xls', 'csv']
};

// MIME types mapping
export const MIME_TYPES = {
  PDF: 'application/pdf',
  DOCX: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  DOC: 'application/msword',
  XLSX: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  XLS: 'application/vnd.ms-excel',
  CSV: 'text/csv'
};

// AWS Bedrock model IDs
export const BEDROCK_MODELS = {
  CLAUDE_3_5_SONNET: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
  CLAUDE_3_OPUS: 'anthropic.claude-3-opus-20240229-v1:0',
  CLAUDE_3_HAIKU: 'anthropic.claude-3-haiku-20240307-v1:0'
};

// ChromaDB configuration
export const CHROMA_CONFIG = {
  TOP_K: 10 // Default number of results to return
};

// HTTP status codes
export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  INTERNAL_SERVER_ERROR: 500
};

// Response messages
export const MESSAGES = {
  SUCCESS: 'Operation completed successfully',
  INVALID_REQUEST: 'Invalid request parameters',
  NOT_FOUND: 'Resource not found',
  UNAUTHORIZED: 'Unauthorized access',
  INTERNAL_ERROR: 'An internal error occurred'
};

// Document processing status
export const DOCUMENT_STATUS = {
  UPLOADED: 'uploaded',
  PROCESSING: 'processing',
  INGESTED: 'ingested',
  ERROR: 'error'
};

