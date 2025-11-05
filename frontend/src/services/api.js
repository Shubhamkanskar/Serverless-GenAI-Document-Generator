import axios from 'axios';
import { API_BASE_URL } from '../utils/constants.js';

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 300000, // 5 minutes for long operations
  headers: {
    'Content-Type': 'application/json'
  }
});

// Request interceptor
api.interceptors.request.use(
  (config) => {
    // Remove Content-Type header for FormData - browser will set it with boundary
    if (config.data instanceof FormData) {
      delete config.headers['Content-Type'];
    }
    // Add auth token if needed
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor
api.interceptors.response.use(
  (response) => {
    // If response.data exists, return it; otherwise return the full response
    return response.data !== undefined ? response.data : response;
  },
  (error) => {
    // Enhanced error handling with logging
    console.error('API Error:', {
      url: error.config?.url,
      method: error.config?.method,
      status: error.response?.status,
      message: error.message,
      data: error.response?.data
    });

    // Handle errors globally
    const message = error.response?.data?.message || error.message || 'An error occurred';

    // Create enhanced error with more context
    const enhancedError = new Error(message);
    enhancedError.status = error.response?.status;
    enhancedError.code = error.code;
    enhancedError.response = error.response;
    enhancedError.isNetworkError = !error.response && !!error.request;
    enhancedError.isTimeoutError = error.code === 'ECONNABORTED' || error.message?.includes('timeout');

    throw enhancedError;
  }
);

export const uploadDocument = async (file) => {
  const formData = new FormData();
  formData.append('file', file);
  // Don't set Content-Type manually - browser will set it automatically with boundary parameter
  return api.post('/upload', formData, {
    onUploadProgress: (progressEvent) => {
      // Track upload progress
      const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
      console.log(`Upload progress: ${percentCompleted}%`);
    }
  });
};

export const ingestDocument = async (fileId, s3Key) => {
  return api.post('/ingest', { fileId, s3Key });
};

export const generateDocument = async (useCase, documentIds, llmProvider = 'gemini') => {
  return api.post('/generate-document', { useCase, documentIds, llmProvider });
};

export const getDownloadUrl = async (fileId) => {
  return api.get(`/download/${fileId}`);
};

// Prompt management APIs (legacy - for backward compatibility)
export const getPrompts = async () => api.get('/prompts');

export const getPrompt = async (useCase) => api.get(`/prompts/${useCase}`);

export const updatePrompt = async (useCase, promptData) =>
  api.put(`/prompts/${useCase}`, promptData);

export const addPrompt = async (promptData) =>
  api.post('/prompts', promptData);

export const resetPrompts = async () => api.post('/prompts/reset');

// Prompt Library APIs (new - supports multiple prompts per use case)
export const getAllPromptLibraries = async () => api.get('/prompts/library');

export const getPromptLibrary = async (useCase) => api.get(`/prompts/library/${useCase}`);

export const getPromptsForUseCase = async (useCase) => api.get(`/prompts/library/${useCase}/prompts`);

export const getPromptFromLibrary = async (useCase, promptId = null) => {
  if (promptId) {
    return api.get(`/prompts/library/${useCase}/${promptId}`);
  }
  return api.get(`/prompts/library/${useCase}`);
};

export const addPromptToLibrary = async (useCase, promptData) =>
  api.post(`/prompts/library/${useCase}`, promptData);

export const updatePromptInLibrary = async (useCase, promptId, promptData) =>
  api.put(`/prompts/library/${useCase}/${promptId}`, promptData);

export const activatePrompt = async (useCase, promptId) =>
  api.post(`/prompts/library/${useCase}/${promptId}/activate`);

export const deletePromptFromLibrary = async (useCase, promptId) =>
  api.delete(`/prompts/library/${useCase}/${promptId}`);

export const resetPromptLibrary = async () => api.post('/prompts/library/reset');

