import { create } from 'zustand';
import { uploadDocument, ingestDocument, checkIngestStatus } from '../services/api.js';
import { handleApiError } from '../utils/errorHandler.js';
import { validateFile, validateFileId, validateS3Key } from '../utils/validators.js';

/**
 * Zustand store for document management
 * Handles upload, ingestion, and document state
 */
export const useDocumentStore = create((set, get) => ({
  // State
  documents: [],
  uploading: false,
  ingesting: false,
  error: null,

  // Actions
  uploadFile: async (file) => {
    try {
      set({ uploading: true, error: null });

      // Validate file
      const fileValidation = validateFile(file);
      if (!fileValidation.valid) {
        throw new Error(fileValidation.error);
      }

      const response = await uploadDocument(file);
      
      // Handle different response structures
      const responseData = response.data || response;
      
      const newDocument = {
        ...responseData,
        status: 'uploaded',
        progress: 0,
        // Ensure s3Key is available (handle different naming)
        s3Key: responseData.s3Key || responseData.s3_key || responseData.s3key
      };

      set((state) => ({
        documents: [...state.documents, newDocument],
        uploading: false
      }));

      return newDocument;
    } catch (err) {
      const errorMessage = handleApiError(err);
      set({ error: errorMessage, uploading: false });
      throw new Error(errorMessage);
    }
  },

  ingestFile: async (fileId, s3Key) => {
    try {
      set({ ingesting: true, error: null });

      // Validate inputs
      const fileIdValidation = validateFileId(fileId);
      if (!fileIdValidation.valid) {
        throw new Error(fileIdValidation.error);
      }

      const s3KeyValidation = validateS3Key(s3Key);
      if (!s3KeyValidation.valid) {
        throw new Error(s3KeyValidation.error);
      }

      // Update document status to processing
      set((state) => ({
        documents: state.documents.map(doc =>
          doc.fileId === fileId
            ? { ...doc, status: 'processing', progress: 0 }
            : doc
        )
      }));

      const response = await ingestDocument(fileId, s3Key);

      // Handle response structure: API returns { success: true, data: {...} }
      // Axios interceptor extracts response.data, so we get { success: true, data: {...} }
      // Extract the inner data object
      let ingestData;
      if (response.success && response.data) {
        // Response structure: { success: true, data: {...} }
        ingestData = response.data;
      } else if (response.data) {
        // Response structure: { data: {...} }
        ingestData = response.data;
      } else {
        // Response is already the data object
        ingestData = response;
      }
      
      console.log('Ingest response received:', { response, ingestData });
      
      // Handle async processing response (status: 'processing') or completed (status: 'success')
      const apiStatus = ingestData?.status || 'unknown';
      const isProcessing = apiStatus === 'processing';
      const isCompleted = apiStatus === 'success';
      
      if (isProcessing) {
        // Async processing - start polling in background
        console.log(`Starting async processing for ${fileId}, will poll for status`);
        
        // Update document to processing status
        set((state) => ({
          documents: state.documents.map(doc =>
            doc.fileId === fileId
              ? {
                  ...doc,
                  status: 'processing',
                  progress: 0,
                  chunksProcessed: 0
                }
              : doc
          ),
          ingesting: false
        }));

        // Start polling in background (don't await - let it run async)
        get().pollIngestStatus(fileId)
          .then((statusData) => {
            console.log(`Polling completed successfully for ${fileId}:`, statusData);
            // Status already updated in pollIngestStatus
          })
          .catch((pollError) => {
            console.error(`Polling failed for ${fileId}:`, pollError);
            // Update document to show warning but keep as processing
            set((state) => ({
              documents: state.documents.map(doc =>
                doc.fileId === fileId
                  ? {
                      ...doc,
                      status: 'processing',
                      error: 'Status check timed out. Processing may still be in progress.'
                    }
                  : doc
              )
            }));
          });

        return ingestData;
      }

      // Synchronous completion (status: 'success')
      if (isCompleted) {
        set((state) => {
          const updated = state.documents.map(doc => {
            if (doc.fileId === fileId) {
              const { status: _, ...ingestDataWithoutStatus } = ingestData || {};
              
              return {
                ...doc,
                ...ingestDataWithoutStatus,
                status: 'processed',
                progress: 100,
                chunksProcessed: ingestData?.chunksProcessed || ingestData?.chunks_processed || 0,
                processingTime: ingestData?.processingTime || ingestData?.processing_time,
                metadata: ingestData?.metadata
              };
            }
            return doc;
          });

          return {
            documents: [...updated],
            ingesting: false
          };
        });

        return ingestData;
      }

      // Unknown status - default to processing and start polling
      console.warn(`Unknown status '${apiStatus}' for ${fileId}, starting polling`);
      set((state) => ({
        documents: state.documents.map(doc =>
          doc.fileId === fileId
            ? { ...doc, status: 'processing', progress: 0 }
            : doc
        ),
        ingesting: false
      }));

      // Start polling for unknown status
      get().pollIngestStatus(fileId).catch((error) => {
        console.error(`Polling failed for ${fileId}:`, error);
      });

      return ingestData;
    } catch (err) {
      const errorMessage = handleApiError(err);
      
      // Update document status to error
      set((state) => ({
        documents: state.documents.map(doc =>
          doc.fileId === fileId
            ? { ...doc, status: 'error', error: errorMessage }
            : doc
        ),
        error: errorMessage,
        ingesting: false
      }));
      
      throw new Error(errorMessage);
    }
  },

  removeDocument: (fileId) => {
    set((state) => ({
      documents: state.documents.filter(doc => doc.fileId !== fileId)
    }));
  },

  clearError: () => {
    set({ error: null });
  },

  /**
   * Poll ingestion status until completion or timeout
   * Uses exponential backoff for efficient polling
   * @param {string} fileId - File ID to poll status for
   * @param {Object} options - Polling options
   * @returns {Promise<Object>} Final status data
   */
  pollIngestStatus: async (fileId, options = {}) => {
    const {
      maxAttempts = 120, // 120 attempts = ~10 minutes (5s intervals)
      initialInterval = 3000, // Start with 3 seconds
      maxInterval = 10000, // Max 10 seconds between polls
      backoffMultiplier = 1.2 // Exponential backoff factor
    } = options;

    let attempts = 0;
    let currentInterval = initialInterval;
    let pollTimeoutId = null;

    return new Promise((resolve, reject) => {
      const poll = async () => {
        try {
          attempts++;
          
          const response = await checkIngestStatus(fileId);
          const statusData = response.success ? response.data : response;

          if (!statusData) {
            throw new Error('Invalid status response');
          }

          // Update document with current status
          set((state) => {
            const updated = state.documents.map(doc => {
              if (doc.fileId === fileId) {
                const updatedDoc = {
                  ...doc,
                  status: statusData.status === 'completed' ? 'processed' : 'processing',
                  chunksProcessed: statusData.chunksProcessed || doc.chunksProcessed || 0,
                  ...(statusData.metadata && { metadata: statusData.metadata }),
                  ...(statusData.metadata?.processingTime && { 
                    processingTime: statusData.metadata.processingTime 
                  })
                };

                // Update progress based on status
                if (statusData.status === 'completed') {
                  updatedDoc.progress = 100;
                } else if (statusData.chunksProcessed) {
                  // Estimate progress based on chunks (if we had initial chunk count)
                  // For now, keep it at a low value to show processing
                  updatedDoc.progress = Math.min(updatedDoc.progress || 10, 90);
                }

                return updatedDoc;
              }
              return doc;
            });

            return { documents: updated };
          });

          // Check if processing is complete
          if (statusData.status === 'completed') {
            console.log(`Polling completed for ${fileId} after ${attempts} attempts`);
            resolve(statusData);
            return;
          }

          // Check if we've exceeded max attempts
          if (attempts >= maxAttempts) {
            const error = new Error('Polling timeout - processing may still be in progress');
            console.warn(`Polling timeout for ${fileId} after ${attempts} attempts`);
            
            // Don't mark as error, just keep as processing
            set((state) => ({
              documents: state.documents.map(doc =>
                doc.fileId === fileId
                  ? { ...doc, status: 'processing' } // Keep as processing
                  : doc
              )
            }));
            
            reject(error);
            return;
          }

          // Continue polling with exponential backoff
          currentInterval = Math.min(
            currentInterval * backoffMultiplier,
            maxInterval
          );

          pollTimeoutId = setTimeout(poll, currentInterval);

        } catch (error) {
          console.error(`Error polling ingest status for ${fileId}:`, error);

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
            pollTimeoutId = setTimeout(poll, currentInterval);
            return;
          }

          // Non-retryable error or max attempts reached
          if (attempts >= maxAttempts) {
            reject(new Error(`Polling failed after ${attempts} attempts: ${error.message}`));
          } else {
            // Continue with normal backoff
            pollTimeoutId = setTimeout(poll, currentInterval);
          }
        }
      };

      // Start polling
      poll();
    });
  },

  // Computed selectors
  getProcessedDocuments: () => {
    return get().documents.filter(doc => doc.status === 'processed');
  },

  hasProcessedDocuments: () => {
    return get().getProcessedDocuments().length > 0;
  }
}));

