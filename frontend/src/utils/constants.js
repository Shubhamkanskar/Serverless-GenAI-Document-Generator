export const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

export const USE_CASES = {
  CHECKSHEET: 'checksheet',
  WORK_INSTRUCTIONS: 'workInstructions'
};

export const LLM_PROVIDERS = {
  GEMINI: 'gemini'
};

export const LLM_PROVIDER_LABELS = {
  [LLM_PROVIDERS.GEMINI]: 'Google Gemini'
};

export const FILE_TYPES = {
  PDF: 'application/pdf',
  EXCEL: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  DOCX: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
};

export const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB

