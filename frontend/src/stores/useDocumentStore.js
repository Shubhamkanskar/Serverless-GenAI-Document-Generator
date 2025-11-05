import { create } from 'zustand';
import { uploadDocument, ingestDocument } from '../services/api.js';
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
      
      // Update document status to 'processed' - THIS IS CRITICAL
      // Note: API returns status: 'success', but we need status: 'processed' for UI
      set((state) => {
        const updated = state.documents.map(doc => {
          if (doc.fileId === fileId) {
            // Extract only the fields we need, excluding status from API response
            const { status: _, ...ingestDataWithoutStatus } = ingestData || {};
            
            const updatedDoc = {
              ...doc,
              ...ingestDataWithoutStatus, // Spread first to get all fields
              status: 'processed', // CRITICAL: Override with 'processed' - must be last to ensure it's not overridden
              progress: 100,
              chunksProcessed: ingestData?.chunksProcessed || ingestData?.chunks_processed || ingestDataWithoutStatus?.chunksProcessed,
              processingTime: ingestData?.processingTime || ingestData?.processing_time || ingestDataWithoutStatus?.processingTime,
              metadata: ingestData?.metadata || ingestDataWithoutStatus?.metadata
            };
            console.log('Updated document:', updatedDoc);
            console.log('Document status:', updatedDoc.status); // Debug log
            return updatedDoc;
          }
          return doc;
        });
        console.log('All documents after update:', updated);
        console.log('First document status:', updated[0]?.status); // Debug log
        console.log('Documents array length:', updated.length); // Debug log
        
        // Ensure we return a new array reference to trigger React re-render
        const newState = {
          documents: [...updated], // Create new array reference
          ingesting: false
        };
        console.log('New state being set:', newState);
        return newState;
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

  // Computed selectors
  getProcessedDocuments: () => {
    return get().documents.filter(doc => doc.status === 'processed');
  },

  hasProcessedDocuments: () => {
    return get().getProcessedDocuments().length > 0;
  }
}));

