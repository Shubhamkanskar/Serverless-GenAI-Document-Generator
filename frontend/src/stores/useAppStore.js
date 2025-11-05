import { create } from 'zustand';

/**
 * Zustand store for app-level UI state
 * Handles UI preferences, selected use case, and modal states
 */
export const useAppStore = create((set) => ({
  // State
  selectedUseCase: null,
  selectedLLM: 'gemini', // Default to Gemini
  showPromptBook: false,

  // Actions
  setSelectedUseCase: (useCase) => {
    set({ selectedUseCase: useCase });
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
      selectedLLM: 'gemini',
      showPromptBook: false
    });
  }
}));

