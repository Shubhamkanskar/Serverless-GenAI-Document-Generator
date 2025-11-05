import { create } from 'zustand';

/**
 * Zustand store for app-level UI state
 * Handles UI preferences, selected use case, and modal states
 */
export const useAppStore = create((set) => ({
  // State
  selectedUseCase: null,
  selectedPromptId: null, // Track selected prompt ID
  selectedLLM: 'gemini', // Default to Gemini
  showPromptBook: false,

  // Actions
  setSelectedUseCase: (useCase) => {
    set({ selectedUseCase: useCase, selectedPromptId: null }); // Reset prompt when use case changes
  },

  setSelectedPromptId: (promptId) => {
    set({ selectedPromptId: promptId });
  },

  setSelectedLLM: (llm) => {
    set({ selectedLLM: llm });
  },

  setShowPromptBook: (show) => {
    set({ showPromptBook: show });
  },

  reset: () => {
    set({
      selectedUseCase: null,
      selectedPromptId: null,
      selectedLLM: 'gemini',
      showPromptBook: false
    });
  }
}));

