import { create } from 'zustand';
import { generateDocument } from '../services/api.js';
import { handleApiError } from '../utils/errorHandler.js';
import { validateUseCase, validateDocumentIds } from '../utils/validators.js';
import { USE_CASES } from '../utils/constants.js';

/**
 * Zustand store for document generation
 * Handles AI generation, progress tracking, and generated file state
 */
export const useGenerationStore = create((set, get) => ({
  // State
  generating: false,
  generatedFile: null,
  error: null,
  progress: 0,

  // Actions
  generate: async (useCase, documentIds, llmProvider = 'gemini') => {
    try {
      set({
        generating: true,
        error: null,
        progress: 0,
        generatedFile: null
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

      // Simulate progress (actual progress would come from server-sent events)
      const progressInterval = setInterval(() => {
        set((state) => {
          const newProgress = state.progress >= 90 ? 90 : state.progress + 10;
          return { progress: newProgress };
        });
      }, 2000);

      const response = await generateDocument(useCase, documentIds, llmProvider);

      clearInterval(progressInterval);
      
      // Handle response structure
      const responseData = response.data || response;
      
      set({
        progress: 100,
        generatedFile: responseData,
        generating: false
      });

      return responseData;
    } catch (err) {
      const errorMessage = handleApiError(err);
      set({
        error: errorMessage,
        progress: 0,
        generating: false
      });
      throw new Error(errorMessage);
    }
  },

  reset: () => {
    set({
      generatedFile: null,
      error: null,
      progress: 0
    });
  },

  clearError: () => {
    set({ error: null });
  }
}));

