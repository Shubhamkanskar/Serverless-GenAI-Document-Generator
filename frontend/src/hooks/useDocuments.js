import { useState, useCallback } from 'react';
import { uploadDocument, ingestDocument } from '../services/api.js';
import { handleApiError, isNetworkError, isTimeoutError } from '../utils/errorHandler.js';
import { validateFile, validateFileId, validateS3Key } from '../utils/validators.js';

export const useDocuments = () => {
  const [documents, setDocuments] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [ingesting, setIngesting] = useState(false);
  const [error, setError] = useState(null);

  const uploadFile = useCallback(async (file) => {
    try {
      setUploading(true);
      setError(null);

      // Validate file using validator
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

      setDocuments(prev => [...prev, newDocument]);
      return newDocument;
    } catch (err) {
      const errorMessage = handleApiError(err);
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setUploading(false);
    }
  }, []);

  const ingestFile = useCallback(async (fileId, s3Key) => {
    try {
      setIngesting(true);
      setError(null);

      // Validate inputs
      const fileIdValidation = validateFileId(fileId);
      if (!fileIdValidation.valid) {
        throw new Error(fileIdValidation.error);
      }

      const s3KeyValidation = validateS3Key(s3Key);
      if (!s3KeyValidation.valid) {
        throw new Error(s3KeyValidation.error);
      }

      // Update document status
      setDocuments(prev => 
        prev.map(doc => 
          doc.fileId === fileId 
            ? { ...doc, status: 'processing', progress: 0 }
            : doc
        )
      );

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
      setDocuments(prev => {
        const updated = prev.map(doc => {
          if (doc.fileId === fileId) {
            const updatedDoc = {
              ...doc,
              status: 'processed', // CRITICAL: Must be 'processed' to show next step
              progress: 100,
              chunksProcessed: ingestData?.chunksProcessed || ingestData?.chunks_processed,
              processingTime: ingestData?.processingTime || ingestData?.processing_time,
              metadata: ingestData?.metadata,
              ...ingestData
            };
            console.log('Updated document:', updatedDoc);
            return updatedDoc;
          }
          return doc;
        });
        console.log('All documents after update:', updated);
        return updated;
      });

      return ingestData;
    } catch (err) {
      const errorMessage = handleApiError(err);
      setError(errorMessage);
      
      // Update document status to error
      setDocuments(prev => 
        prev.map(doc => 
          doc.fileId === fileId 
            ? { ...doc, status: 'error', error: errorMessage }
            : doc
        )
      );
      
      throw new Error(errorMessage);
    } finally {
      setIngesting(false);
    }
  }, []);

  const removeDocument = useCallback((fileId) => {
    setDocuments(prev => prev.filter(doc => doc.fileId !== fileId));
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    documents,
    uploading,
    ingesting,
    error,
    uploadFile,
    ingestFile,
    removeDocument,
    clearError
  };
};

