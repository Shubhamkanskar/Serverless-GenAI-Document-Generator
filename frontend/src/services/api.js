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

/**
 * Get presigned URL for direct S3 upload (for files >10MB)
 * @param {string} fileName - File name
 * @param {number} fileSize - File size in bytes
 * @param {string} contentType - MIME type
 * @returns {Promise<Object>} Presigned URL and file metadata
 */
export const getUploadUrl = async (fileName, fileSize, contentType = 'application/pdf') => {
  return api.post('/get-upload-url', {
    fileName,
    fileSize,
    contentType
  });
};

/**
 * Upload file directly to S3 using presigned URL
 * @param {string} presignedUrl - Presigned S3 URL
 * @param {File} file - File to upload
 * @param {Function} onProgress - Progress callback
 * @returns {Promise<void>}
 */
export const uploadToS3 = async (presignedUrl, file, onProgress) => {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable && onProgress) {
        const percentCompleted = Math.round((e.loaded * 100) / e.total);
        onProgress(percentCompleted);
      }
    });

    xhr.addEventListener('load', () => {
      if (xhr.status === 200) {
        resolve();
      } else {
        reject(new Error(`Upload failed with status ${xhr.status}`));
      }
    });

    xhr.addEventListener('error', () => {
      reject(new Error('Upload failed due to network error'));
    });

    xhr.addEventListener('abort', () => {
      reject(new Error('Upload was aborted'));
    });

    xhr.open('PUT', presignedUrl);
    xhr.setRequestHeader('Content-Type', file.type || 'application/pdf');
    xhr.send(file);
  });
};

export const uploadDocument = async (file) => {
  const FILE_SIZE_LIMIT = 10 * 1024 * 1024; // 10MB API Gateway limit

  // For files >10MB, use presigned URL upload to bypass API Gateway
  if (file.size > FILE_SIZE_LIMIT) {
    console.log(`File size (${(file.size / (1024 * 1024)).toFixed(2)}MB) exceeds API Gateway limit. Using presigned URL upload.`);
    
    // Step 1: Get presigned URL
    const response = await getUploadUrl(
      file.name,
      file.size,
      file.type || 'application/pdf'
    );
    
    // Extract response data (handle both direct response and wrapped response)
    const responseData = response.data || response;
    const { fileId, fileName, originalFileName, s3Key, s3Bucket, uploadedAt, presignedUrl } = responseData;

    // Step 2: Upload directly to S3
    await uploadToS3(
      presignedUrl,
      file,
      (progress) => {
        console.log(`Upload progress: ${progress}%`);
      }
    );

    // Step 3: Return metadata in same format as regular upload
    return {
      fileId,
      fileName,
      originalFileName,
      fileSize: file.size,
      contentType: file.type || 'application/pdf',
      s3Key,
      s3Bucket,
      uploadedAt
    };
  }

  // For files <=10MB, use regular API Gateway upload
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

/**
 * Check ingestion status for a document
 * @param {string} fileId - File ID to check status for
 * @returns {Promise<Object>} Status response
 */
export const checkIngestStatus = async (fileId) => {
  return api.get(`/ingest-status/${fileId}`);
};

export const generateDocument = async (useCase, documentIds, llmProvider = 'gemini', promptId = null) => {
  return api.post('/generate-document', { useCase, documentIds, llmProvider, promptId });
};

/**
 * Check generation status for a document generation request
 * @param {string} generationId - Generation ID to check status for
 * @returns {Promise<Object>} Status response with progress, ETA, and downloadUrl
 */
export const checkGenerationStatus = async (generationId) => {
  return api.get(`/generation-status/${generationId}`);
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

