import { create } from 'zustand';
import { generateDocument, checkGenerationStatus } from '../services/api.js';
import { handleApiError } from '../utils/errorHandler.js';
import { validateUseCase, validateDocumentIds } from '../utils/validators.js';
import { USE_CASES } from '../utils/constants.js';

/**
 * Zustand store for document generation
 * Handles async AI generation with real-time progress tracking and polling
 */
export const useGenerationStore = create((set, get) => ({
  // State
  generating: false,
  generatedFile: null,
  error: null,
  progress: 0,
  currentStep: '',
  message: '',
  estimatedTimeRemaining: null,
  elapsedTime: null,
  generationId: null,

  // Actions
  generate: async (useCase, documentIds, llmProvider = 'gemini', promptId = null) => {
    try {
      set({
        generating: true,
        error: null,
        progress: 0,
        currentStep: 'initializing',
        message: 'Starting document generation...',
        generatedFile: null,
        estimatedTimeRemaining: null,
        elapsedTime: null,
        generationId: null
      });

      // Validate inputs
      const useCaseValidation = validateUseCase(useCase, USE_CASES);
      if (!useCaseValidation.valid) {
        throw new Error(useCaseValidation.error);
      }

      const documentIdsValidation = validateDocumentIds(documentIds);
      if (!documentIdsValidation.valid) {
        throw new Error(documentIdsValidation.error);
      }

      // Call API - now returns 202 Accepted with generationId for async processing
      const response = await generateDocument(useCase, documentIds, llmProvider, promptId);
      
      // Handle different response formats from API
      let responseData;
      if (response.success && response.data) {
        // Standard format: { success: true, data: {...} }
        responseData = response.data;
      } else if (response.data) {
        // Response wrapped in data property
        responseData = response.data;
      } else if (response.status || response.generationId) {
        // Direct response object
        responseData = response;
      } else {
        responseData = response;
      }

      console.log('Generation response:', responseData);

      // Check if this is async processing (status: 'processing' with generationId)
      if (responseData.status === 'processing' && responseData.generationId) {
        const generationId = responseData.generationId;
        
        // Store generationId for polling
        set({
          generationId,
          currentStep: 'queued',
          message: responseData.message || 'Document generation queued. Processing will continue in the background.',
          progress: 0
        });

        // Start polling for status updates
        try {
          const finalStatus = await get().pollGenerationStatus(generationId);
          return finalStatus;
        } catch (pollError) {
          console.error('Polling error:', pollError);
          throw pollError;
        }
      }
      
      // Legacy synchronous response handling (fallback)
      if (responseData.status === 'completed' && responseData.downloadUrl) {
        set({
          progress: 100,
          generatedFile: {
            fileId: responseData.fileId,
            fileName: responseData.fileName,
            fileType: responseData.fileType,
            contentType: responseData.contentType,
            downloadUrl: responseData.downloadUrl,
            s3Key: responseData.s3Key,
            s3Bucket: responseData.s3Bucket,
            useCase: responseData.useCase,
            processingTime: responseData.processingTime
          },
          generating: false,
          currentStep: 'completed',
          message: 'Document generated successfully!'
        });

        return responseData;
      } else {
        throw new Error(responseData.message || 'Generation failed');
      }

    } catch (err) {
      const errorMessage = handleApiError(err);
      set({
        error: errorMessage,
        progress: 0,
        generating: false,
        currentStep: 'error',
        message: errorMessage
      });
      throw new Error(errorMessage);
    }
  },

  /**
   * Poll generation status until completion or timeout
   * Uses exponential backoff for efficient polling
   * @param {string} generationId - Generation ID to poll status for
   * @param {Object} options - Polling options
   * @returns {Promise<Object>} Final status data
   */
  pollGenerationStatus: async (generationId, options = {}) => {
    const {
      maxAttempts = 120, // 120 attempts = ~10 minutes
      initialInterval = 3000, // Start with 3 seconds
      maxInterval = 10000, // Max 10 seconds between polls
      backoffMultiplier = 1.2 // Exponential backoff factor
    } = options;

    let attempts = 0;
    let currentInterval = initialInterval;

    return new Promise((resolve, reject) => {
      const poll = async () => {
        try {
          attempts++;

          const response = await checkGenerationStatus(generationId);
          
          // Handle different response formats from API
          let statusData;
          if (response.success && response.data) {
            // Standard format: { success: true, data: {...} }
            statusData = response.data;
          } else if (response.data) {
            // Response wrapped in data property
            statusData = response.data;
          } else if (response.status) {
            // Direct status object
            statusData = response;
          } else {
            throw new Error('Invalid status response format');
          }

          if (!statusData || typeof statusData !== 'object') {
            throw new Error('Invalid status response');
          }

          console.log(`Polling attempt ${attempts}:`, statusData);

          // Update state with current status
          set({
            progress: statusData.progress || 0,
            currentStep: statusData.currentStep || (statusData.status === 'queued' ? 'queued' : 'processing'),
            message: statusData.message || (statusData.status === 'queued' ? 'Queued for processing...' : 'Processing...'),
            estimatedTimeRemaining: statusData.estimatedTimeRemaining,
            elapsedTime: statusData.elapsedTime,
            generationId: statusData.generationId || generationId
          });

          // Check if generation is complete
          if (statusData.status === 'completed') {
            console.log(`Generation completed after ${attempts} attempts`);

            set({
              progress: 100,
              generatedFile: {
                fileId: statusData.fileId,
                fileName: statusData.fileName,
                fileType: statusData.fileType,
                contentType: statusData.contentType,
                downloadUrl: statusData.downloadUrl,
                s3Key: statusData.s3Key,
                s3Bucket: statusData.s3Bucket,
                useCase: statusData.useCase,
                processingTime: statusData.processingTime,
                generatedAt: statusData.completedAt
              },
              generating: false,
              currentStep: 'completed',
              message: 'Document generated successfully!'
            });

            resolve(statusData);
            return;
          }

          // Check if generation failed
          if (statusData.status === 'failed') {
            console.error(`Generation failed after ${attempts} attempts:`, statusData.error);

            set({
              error: statusData.error || statusData.message || 'Generation failed',
              generating: false,
              currentStep: 'error',
              message: statusData.error || statusData.message || 'Generation failed'
            });

            reject(new Error(statusData.error || statusData.message || 'Generation failed'));
            return;
          }

          // Check if we've exceeded max attempts
          if (attempts >= maxAttempts) {
            const error = new Error('Generation timeout - processing may still be in progress');
            console.warn(`Polling timeout after ${attempts} attempts`);

            set({
              error: error.message,
              generating: false,
              currentStep: 'timeout',
              message: 'Generation timed out. Please check back later.'
            });

            reject(error);
            return;
          }

          // Continue polling with exponential backoff
          currentInterval = Math.min(
            currentInterval * backoffMultiplier,
            maxInterval
          );

          setTimeout(poll, currentInterval);

        } catch (error) {
          console.error(`Error polling generation status (attempt ${attempts}):`, error);

          // If it's a network error or timeout, continue polling
          const isRetryable = error.isNetworkError ||
                             error.isTimeoutError ||
                             error.message?.includes('timeout') ||
                             error.message?.includes('network');

          if (isRetryable && attempts < maxAttempts) {
            // Exponential backoff on error
            currentInterval = Math.min(
              currentInterval * backoffMultiplier * 1.5,
              maxInterval * 2
            );
            setTimeout(poll, currentInterval);
            return;
          }

          // Non-retryable error or max attempts reached
          set({
            error: error.message || 'Failed to check generation status',
            generating: false,
            currentStep: 'error',
            message: error.message || 'Failed to check generation status'
          });

          reject(error);
        }
      };

      // Start polling
      poll();
    });
  },

  reset: () => {
    set({
      generatedFile: null,
      error: null,
      progress: 0,
      currentStep: '',
      message: '',
      estimatedTimeRemaining: null,
      elapsedTime: null,
      generationId: null
    });
  },

  clearError: () => {
    set({ error: null });
  }
}));

