import React, { useState, useEffect } from 'react';
import { Sparkles, Info, BookOpen } from 'lucide-react';
import { getPromptLibrary } from '../services/api.js';

const ActivePromptInfo = ({ useCase }) => {
  const [activePrompt, setActivePrompt] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (useCase) {
      loadActivePrompt();
    }
  }, [useCase]);

  const loadActivePrompt = async () => {
    try {
      setLoading(true);
      const response = await getPromptLibrary(useCase);
      const library = response.data?.library || response.library;
      
      if (library && library.prompts) {
        const active = library.prompts.find(p => p.isActive || p.id === library.activePromptId);
        setActivePrompt(active || library.prompts[0]);
      }
    } catch (err) {
      console.error('Error loading active prompt:', err);
      setActivePrompt(null);
    } finally {
      setLoading(false);
    }
  };

  if (!useCase || loading) {
    return null;
  }

  if (!activePrompt) {
    return (
      <div className="mt-3 p-3 bg-muted/50 border rounded-lg flex items-start gap-2">
        <Info className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
        <p className="text-sm text-muted-foreground">
          Default prompt will be used for generation.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-3 p-3 bg-primary/5 border border-primary/20 rounded-lg">
      <div className="flex items-start gap-2">
        <Sparkles className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
        <div className="flex-1">
          <p className="text-sm text-foreground mb-1">
            <span className="font-medium">Active Prompt:</span>{' '}
            <span className="text-primary">{activePrompt.name}</span>
          </p>
          {activePrompt.description && (
            <p className="text-xs text-muted-foreground">
              {activePrompt.description}
            </p>
          )}
          <button
            onClick={() => {
              // Open PromptBook modal - this would be handled by parent
              // For now, just show info
            }}
            className="mt-2 text-xs text-primary hover:underline flex items-center gap-1"
          >
            <BookOpen className="w-3 h-3" />
            Manage prompts
          </button>
        </div>
      </div>
    </div>
  );
};

export default ActivePromptInfo;

