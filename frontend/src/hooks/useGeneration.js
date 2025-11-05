import { useState, useCallback } from 'react';
import { generateDocument } from '../services/api.js';
import { handleApiError, isNetworkError, isTimeoutError } from '../utils/errorHandler.js';
import { validateUseCase, validateDocumentIds } from '../utils/validators.js';
import { USE_CASES } from '../utils/constants.js';

export const useGeneration = () => {
  const [generating, setGenerating] = useState(false);
  const [generatedFile, setGeneratedFile] = useState(null);
  const [error, setError] = useState(null);
  const [progress, setProgress] = useState(0);

  const generate = useCallback(async (useCase, documentIds) => {
    try {
      setGenerating(true);
      setError(null);
      setProgress(0);
      setGeneratedFile(null);

      // Validate inputs using validators
      const useCaseValidation = validateUseCase(useCase, USE_CASES);
      if (!useCaseValidation.valid) {
        throw new Error(useCaseValidation.error);
      }

      const documentIdsValidation = validateDocumentIds(documentIds);
      if (!documentIdsValidation.valid) {
        throw new Error(documentIdsValidation.error);
      }

      // Simulate progress (actual progress would come from server-sent events)
      const progressInterval = setInterval(() => {
        setProgress(prev => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return 90;
          }
          return prev + 10;
        });
      }, 2000);

      const response = await generateDocument(useCase, documentIds);

      clearInterval(progressInterval);
      setProgress(100);
      setGeneratedFile(response.data);

      return response.data;
    } catch (err) {
      const errorMessage = handleApiError(err);
      setError(errorMessage);
      setProgress(0);
      throw new Error(errorMessage);
    } finally {
      setGenerating(false);
    }
  }, []);

  const reset = useCallback(() => {
    setGeneratedFile(null);
    setError(null);
    setProgress(0);
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    generating,
    generatedFile,
    error,
    progress,
    generate,
    reset,
    clearError
  };
};

