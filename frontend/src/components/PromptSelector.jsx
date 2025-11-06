import React, { useState, useEffect } from "react";
import { AlertCircle, Sparkles, Check, Info } from "lucide-react";
import { Button } from "./ui/button";
import { getPromptsForUseCase } from "../services/api";

const PromptSelector = ({
  useCase,
  selectedPromptId,
  onSelectPrompt,
  className = "",
}) => {
  const [prompts, setPrompts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (useCase) {
      loadPrompts();
    }
  }, [useCase]);

  const loadPrompts = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await getPromptsForUseCase(useCase);
      const promptsData = response.data?.prompts || response.prompts || [];
      setPrompts(promptsData);

      // If no prompt selected, select the active one
      if (!selectedPromptId && promptsData.length > 0) {
        const activePrompt =
          promptsData.find((p) => p.isActive) || promptsData[0];
        onSelectPrompt(activePrompt.id);
      }
    } catch (err) {
      console.error("Error loading prompts:", err);
      setError(err.message || "Failed to load prompts");
    } finally {
      setLoading(false);
    }
  };

  const selectedPrompt = prompts.find((p) => p.id === selectedPromptId);

  if (loading) {
    return (
      <div className={`p-4 bg-muted/30 border rounded-lg ${className}`}>
        <div className="flex items-center gap-2 text-muted-foreground">
          <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
          <span className="text-sm">Loading prompt options...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div
        className={`p-4 bg-destructive/10 border border-destructive/20 rounded-lg ${className}`}
      >
        <div className="flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-destructive flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-medium text-destructive">
              Error loading prompts
            </p>
            <p className="text-xs text-destructive/80 mt-1">{error}</p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={loadPrompts}
            className="text-xs"
          >
            Retry
          </Button>
        </div>
      </div>
    );
  }

  if (prompts.length === 0) {
    return null;
  }

  return (
    <div className={`space-y-3 ${className}`}>
      {/* Info Box */}
      <div className="p-3 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg">
        <div className="flex items-start gap-2">
          <Info className="w-4 h-4 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-xs font-medium text-blue-900 dark:text-blue-100 mb-1">
              Choose Your Generation Style
            </p>
            <p className="text-xs text-blue-800 dark:text-blue-200">
              Select from {prompts.length} different prompt styles. Each
              produces a different level of detail and format.
            </p>
          </div>
        </div>
      </div>

      {/* Prompt Selector */}
      <div className="relative">
        <label className="text-sm font-medium mb-2 block flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary" />
          Select Prompt Style
        </label>

        {/* Dropdown Button */}
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="w-full p-3 bg-card border rounded-lg text-left hover:bg-accent transition-colors flex items-center justify-between group"
        >
          <div className="flex-1 min-w-0">
            {selectedPrompt ? (
              <div>
                <div className="font-medium text-sm flex items-center gap-2">
                  {selectedPrompt.name}
                  {selectedPrompt.isActive && (
                    <span className="text-xs px-2 py-0.5 bg-primary/10 text-primary rounded-full">
                      Default
                    </span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground mt-1 truncate">
                  {selectedPrompt.description}
                </div>
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">
                Select a prompt style...
              </div>
            )}
          </div>
          <div
            className={`ml-2 transition-transform ${
              isOpen ? "rotate-180" : ""
            }`}
          >
            <svg
              className="w-5 h-5 text-muted-foreground group-hover:text-foreground"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </div>
        </button>

        {/* Dropdown Menu */}
        {isOpen && (
          <div className="absolute z-50 w-full mt-2 bg-card border rounded-lg shadow-lg max-h-96 overflow-y-auto">
            <div className="p-2 space-y-1">
              {prompts.map((prompt) => (
                <button
                  key={prompt.id}
                  onClick={() => {
                    onSelectPrompt(prompt.id);
                    setIsOpen(false);
                  }}
                  className={`w-full p-3 rounded-lg text-left transition-colors ${
                    selectedPromptId === prompt.id
                      ? "bg-primary/10 border border-primary"
                      : "hover:bg-accent border border-transparent"
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <div className="font-medium text-sm">{prompt.name}</div>
                        {prompt.isActive && (
                          <span className="text-xs px-1.5 py-0.5 bg-primary/10 text-primary rounded">
                            Default
                          </span>
                        )}
                        {prompt.tags?.includes("recommended") && (
                          <span className="text-xs px-1.5 py-0.5 bg-green-500/10 text-green-600 dark:text-green-400 rounded">
                            ⭐ Recommended
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {prompt.description}
                      </div>
                      {prompt.tags && prompt.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {prompt.tags
                            .filter(
                              (tag) =>
                                tag !== "recommended" && tag !== "default"
                            )
                            .map((tag) => (
                              <span
                                key={tag}
                                className="text-xs px-1.5 py-0.5 bg-muted rounded"
                              >
                                {tag}
                              </span>
                            ))}
                        </div>
                      )}
                    </div>
                    {selectedPromptId === prompt.id && (
                      <Check className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Click outside to close */}
      {isOpen && (
        <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
      )}
    </div>
  );
};

export default PromptSelector;
