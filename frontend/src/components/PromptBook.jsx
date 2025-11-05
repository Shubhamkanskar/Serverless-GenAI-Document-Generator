import React, { useState, useEffect } from 'react';
import { BookOpen, Eye, Edit2, X, Check, Copy, AlertCircle, Save, Plus, RotateCcw, Loader2, Star, Trash2, Sparkles, FileText } from 'lucide-react';
import { Button } from './ui/button';
import { 
  getAllPromptLibraries, 
  getPromptsForUseCase,
  getPromptFromLibrary,
  addPromptToLibrary,
  updatePromptInLibrary,
  activatePrompt,
  deletePromptFromLibrary,
  resetPromptLibrary
} from '../services/api.js';
import { USE_CASES } from '../utils/constants.js';

const PromptBook = ({ onClose }) => {
  const [libraries, setLibraries] = useState({});
  const [selectedUseCase, setSelectedUseCase] = useState('checksheet');
  const [prompts, setPrompts] = useState([]);
  const [selectedPrompt, setSelectedPrompt] = useState(null);
  const [editingPrompt, setEditingPrompt] = useState(null);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [showAddPrompt, setShowAddPrompt] = useState(false);
  const [newPrompt, setNewPrompt] = useState({
    name: '',
    description: '',
    system: '',
    userTemplate: '',
    version: '1.0.0',
    tags: []
  });

  // Load libraries on mount
  useEffect(() => {
    loadLibraries();
  }, []);

  // Load prompts when use case changes
  useEffect(() => {
    if (selectedUseCase) {
      loadPromptsForUseCase(selectedUseCase);
    }
  }, [selectedUseCase]);

  const loadLibraries = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await getAllPromptLibraries();
      const librariesData = response.data?.libraries || response.libraries || {};
      setLibraries(librariesData);
      
      // Set first use case as selected if available
      const useCases = Object.keys(librariesData);
      if (useCases.length > 0 && !selectedUseCase) {
        setSelectedUseCase(useCases[0]);
      }
    } catch (err) {
      setError(err.message || 'Failed to load prompt libraries');
      console.error('Error loading libraries:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadPromptsForUseCase = async (useCase) => {
    try {
      setLoading(true);
      setError(null);
      const response = await getPromptsForUseCase(useCase);
      const promptsData = response.data?.prompts || response.prompts || [];
      setPrompts(promptsData);
      
      // Select active prompt or first prompt
      const activePrompt = promptsData.find(p => p.isActive) || promptsData[0];
      if (activePrompt) {
        setSelectedPrompt(activePrompt.id);
      }
    } catch (err) {
      setError(err.message || 'Failed to load prompts');
      console.error('Error loading prompts:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleViewPrompt = (promptId) => {
    setSelectedPrompt(promptId);
    setEditingPrompt(null);
    setShowAddPrompt(false);
  };

  const handleEditPrompt = (promptId) => {
    setEditingPrompt(promptId);
    setSelectedPrompt(promptId);
    setShowAddPrompt(false);
  };

  const handleSavePrompt = async () => {
    if (!editingPrompt) return;
    
    const prompt = prompts.find(p => p.id === editingPrompt);
    if (!prompt) return;

    try {
      setSaving(true);
      setError(null);
      
      await updatePromptInLibrary(selectedUseCase, editingPrompt, {
        name: prompt.name,
        description: prompt.description,
        system: prompt.system,
        userTemplate: prompt.userTemplate,
        version: prompt.version,
        tags: prompt.tags || []
      });

      setEditingPrompt(null);
      await loadPromptsForUseCase(selectedUseCase);
    } catch (err) {
      setError(err.message || 'Failed to save prompt');
      console.error('Error saving prompt:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleAddPrompt = async () => {
    if (!newPrompt.name || !newPrompt.system || !newPrompt.userTemplate) {
      setError('Name, system prompt, and user template are required');
      return;
    }

    try {
      setSaving(true);
      setError(null);
      
      await addPromptToLibrary(selectedUseCase, newPrompt);

      setShowAddPrompt(false);
      setNewPrompt({
        name: '',
        description: '',
        system: '',
        userTemplate: '',
        version: '1.0.0',
        tags: []
      });
      await loadPromptsForUseCase(selectedUseCase);
      
      // Select the newly added prompt
      const updatedPrompts = await getPromptsForUseCase(selectedUseCase);
      const newPrompts = updatedPrompts.data?.prompts || updatedPrompts.prompts || [];
      if (newPrompts.length > 0) {
        const newPrompt = newPrompts[newPrompts.length - 1];
        setSelectedPrompt(newPrompt.id);
      }
    } catch (err) {
      setError(err.message || 'Failed to add prompt');
      console.error('Error adding prompt:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleActivatePrompt = async (promptId) => {
    try {
      setSaving(true);
      setError(null);
      
      await activatePrompt(selectedUseCase, promptId);
      await loadPromptsForUseCase(selectedUseCase);
    } catch (err) {
      setError(err.message || 'Failed to activate prompt');
      console.error('Error activating prompt:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleDeletePrompt = async (promptId) => {
    if (!confirm('Are you sure you want to delete this prompt? This action cannot be undone.')) {
      return;
    }

    try {
      setSaving(true);
      setError(null);
      
      await deletePromptFromLibrary(selectedUseCase, promptId);
      await loadPromptsForUseCase(selectedUseCase);
      
      // Select first remaining prompt
      const updatedPrompts = await getPromptsForUseCase(selectedUseCase);
      const newPrompts = updatedPrompts.data?.prompts || updatedPrompts.prompts || [];
      if (newPrompts.length > 0) {
        setSelectedPrompt(newPrompts[0].id);
      } else {
        setSelectedPrompt(null);
      }
    } catch (err) {
      setError(err.message || 'Failed to delete prompt');
      console.error('Error deleting prompt:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleResetLibrary = async () => {
    if (!confirm('Are you sure you want to reset all prompt libraries to defaults? This will delete all custom prompts.')) {
      return;
    }

    try {
      setSaving(true);
      setError(null);
      
      await resetPromptLibrary();
      await loadLibraries();
      await loadPromptsForUseCase(selectedUseCase);
    } catch (err) {
      setError(err.message || 'Failed to reset libraries');
      console.error('Error resetting libraries:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleCopy = (text) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePromptChange = (field, value) => {
    if (editingPrompt) {
      setPrompts(prev => prev.map(p => 
        p.id === editingPrompt 
          ? { ...p, [field]: value }
          : p
      ));
    }
  };

  const currentPrompt = selectedPrompt ? prompts.find(p => p.id === selectedPrompt) : null;
  const isEditing = editingPrompt === selectedPrompt && !showAddPrompt;
  const useCaseLabels = {
    checksheet: 'Checksheet',
    workInstructions: 'Work Instructions'
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-card border rounded-lg shadow-xl w-full max-w-6xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <BookOpen className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="text-xl font-semibold">Prompt Library</h2>
              <p className="text-sm text-muted-foreground">Manage AI prompts for each use case</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleResetLibrary}
              disabled={saving}
              className="flex items-center gap-2"
            >
              <RotateCcw className="w-4 h-4" />
              Reset to Default
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="h-8 w-8"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mx-6 mt-4 p-3 bg-destructive/10 border border-destructive/20 rounded-lg flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-destructive flex-shrink-0 mt-0.5" />
            <p className="text-sm text-destructive flex-1">{error}</p>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setError(null)}
              className="ml-auto h-6 w-6 p-0"
            >
              <X className="w-3 h-3" />
            </Button>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-hidden flex">
          {/* Left Sidebar - Use Case Tabs */}
          <div className="w-48 border-r bg-muted/30 p-4 flex flex-col">
            <h3 className="text-sm font-semibold mb-4">Use Cases</h3>
            <div className="space-y-2 flex-1 overflow-y-auto">
              {Object.keys(USE_CASES).map(key => {
                const useCase = USE_CASES[key];
                const isSelected = selectedUseCase === useCase;
                const library = libraries[useCase];
                const promptCount = library?.prompts?.length || 0;
                const activePrompt = library?.prompts?.find(p => p.isActive);
                
                return (
                  <button
                    key={useCase}
                    onClick={() => setSelectedUseCase(useCase)}
                    className={`w-full text-left p-3 rounded-lg border transition-colors ${
                      isSelected
                        ? 'bg-primary/10 border-primary'
                        : 'bg-card border-border hover:bg-accent'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      {useCase === 'checksheet' ? (
                        <FileText className="w-4 h-4" />
                      ) : (
                        <Sparkles className="w-4 h-4" />
                      )}
                      <div className="font-medium text-sm">{useCaseLabels[useCase] || useCase}</div>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {promptCount} prompt{promptCount !== 1 ? 's' : ''}
                      {activePrompt && (
                        <span className="ml-2 text-primary">• Active: {activePrompt.name}</span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Middle Sidebar - Prompt List */}
          <div className="w-64 border-r bg-muted/30 p-4 flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold">Prompts</h3>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setShowAddPrompt(true);
                  setEditingPrompt(null);
                  setSelectedPrompt(null);
                }}
                className="h-7 px-2"
              >
                <Plus className="w-3 h-3" />
              </Button>
            </div>
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="space-y-2 flex-1 overflow-y-auto">
                {prompts.map((prompt) => {
                  const isSelected = selectedPrompt === prompt.id;
                  const isActive = prompt.isActive;
                  
                  return (
                    <div
                      key={prompt.id}
                      className={`p-3 rounded-lg border transition-colors ${
                        isSelected
                          ? 'bg-primary/10 border-primary'
                          : 'bg-card border-border hover:bg-accent'
                      }`}
                    >
                      <button
                        onClick={() => handleViewPrompt(prompt.id)}
                        className="w-full text-left"
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <div className="font-medium text-sm flex-1">{prompt.name}</div>
                          {isActive && (
                            <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" />
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground line-clamp-2 mb-2">
                          {prompt.description || 'No description'}
                        </div>
                        {prompt.tags && prompt.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1 mb-2">
                            {prompt.tags.map(tag => (
                              <span key={tag} className="text-xs px-1.5 py-0.5 bg-muted rounded">
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
                        <div className="text-xs text-muted-foreground">
                          v{prompt.version}
                        </div>
                      </button>
                      <div className="flex gap-1 mt-2">
                        {!isActive && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleActivatePrompt(prompt.id)}
                            disabled={saving}
                            className="h-6 px-2 text-xs flex-1"
                            title="Set as active"
                          >
                            <Star className="w-3 h-3 mr-1" />
                            Activate
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEditPrompt(prompt.id)}
                          className="h-6 px-2 text-xs"
                          title="Edit prompt"
                        >
                          <Edit2 className="w-3 h-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeletePrompt(prompt.id)}
                          disabled={saving || prompts.length === 1}
                          className="h-6 px-2 text-xs text-destructive hover:text-destructive"
                          title="Delete prompt"
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
                {prompts.length === 0 && (
                  <p className="text-sm text-muted-foreground py-4 text-center">
                    No prompts found. Add one to get started.
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Main Content - Prompt Details */}
          <div className="flex-1 overflow-y-auto p-6">
            {loading ? (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
              </div>
            ) : showAddPrompt ? (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-xl font-semibold">Add New Prompt</h3>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setShowAddPrompt(false);
                      setNewPrompt({
                        name: '',
                        description: '',
                        system: '',
                        userTemplate: '',
                        version: '1.0.0',
                        tags: []
                      });
                    }}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium mb-2 block">Name *</label>
                    <input
                      type="text"
                      value={newPrompt.name}
                      onChange={(e) => setNewPrompt(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="e.g., Detailed Checklist"
                      className="w-full px-3 py-2 border rounded-lg bg-background"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-2 block">Description</label>
                    <input
                      type="text"
                      value={newPrompt.description}
                      onChange={(e) => setNewPrompt(prev => ({ ...prev, description: e.target.value }))}
                      placeholder="Brief description of this prompt"
                      className="w-full px-3 py-2 border rounded-lg bg-background"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-2 block">System Prompt *</label>
                    <textarea
                      value={newPrompt.system}
                      onChange={(e) => setNewPrompt(prev => ({ ...prev, system: e.target.value }))}
                      placeholder="System prompt for AI..."
                      className="w-full h-32 px-3 py-2 border rounded-lg bg-background font-mono text-sm resize-none"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-2 block">User Prompt Template * (use {'{context}'} placeholder)</label>
                    <textarea
                      value={newPrompt.userTemplate}
                      onChange={(e) => setNewPrompt(prev => ({ ...prev, userTemplate: e.target.value }))}
                      placeholder="User prompt template with {context} placeholder..."
                      className="w-full h-48 px-3 py-2 border rounded-lg bg-background font-mono text-sm resize-none"
                    />
                  </div>
                  <Button
                    onClick={handleAddPrompt}
                    disabled={saving}
                    className="w-full"
                  >
                    {saving ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Adding...
                      </>
                    ) : (
                      <>
                        <Save className="w-4 h-4 mr-2" />
                        Add Prompt
                      </>
                    )}
                  </Button>
                </div>
              </div>
            ) : !selectedPrompt ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <BookOpen className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-50" />
                  <p className="text-muted-foreground">Select a prompt to view details</p>
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Prompt Header */}
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="text-xl font-semibold">
                        {isEditing ? (
                          <input
                            type="text"
                            value={currentPrompt.name}
                            onChange={(e) => handlePromptChange('name', e.target.value)}
                            className="px-2 py-1 border rounded bg-background font-semibold w-full max-w-md"
                          />
                        ) : (
                          currentPrompt.name
                        )}
                      </h3>
                      {currentPrompt.isActive && (
                        <span className="px-2 py-1 bg-yellow-500/20 text-yellow-700 dark:text-yellow-400 text-xs font-medium rounded">
                          Active
                        </span>
                      )}
                    </div>
                    {isEditing ? (
                      <input
                        type="text"
                        value={currentPrompt.description || ''}
                        onChange={(e) => handlePromptChange('description', e.target.value)}
                        placeholder="Description"
                        className="text-sm text-muted-foreground px-2 py-1 border rounded bg-background w-full mt-2"
                      />
                    ) : (
                      <p className="text-sm text-muted-foreground">{currentPrompt.description || 'No description'}</p>
                    )}
                    {currentPrompt.tags && currentPrompt.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {currentPrompt.tags.map(tag => (
                          <span key={tag} className="text-xs px-2 py-1 bg-muted rounded">
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    {isEditing ? (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setEditingPrompt(null);
                            loadPromptsForUseCase(selectedUseCase);
                          }}
                          disabled={saving}
                        >
                          Cancel
                        </Button>
                        <Button
                          size="sm"
                          onClick={handleSavePrompt}
                          disabled={saving}
                          className="flex items-center gap-2"
                        >
                          {saving ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin" />
                              Saving...
                            </>
                          ) : (
                            <>
                              <Save className="w-4 h-4" />
                              Save
                            </>
                          )}
                        </Button>
                      </>
                    ) : (
                      <>
                        {!currentPrompt.isActive && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleActivatePrompt(currentPrompt.id)}
                            disabled={saving}
                            className="flex items-center gap-2"
                          >
                            <Star className="w-4 h-4" />
                            Activate
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleEditPrompt(selectedPrompt)}
                          className="flex items-center gap-2"
                        >
                          <Edit2 className="w-4 h-4" />
                          Edit
                        </Button>
                      </>
                    )}
                  </div>
                </div>

                {/* System Prompt */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium">System Prompt</label>
                    {!isEditing && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleCopy(currentPrompt.system)}
                        className="h-7 text-xs"
                      >
                        {copied ? (
                          <>
                            <Check className="w-3 h-3 mr-1" />
                            Copied!
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3 mr-1" />
                            Copy
                          </>
                        )}
                      </Button>
                    )}
                  </div>
                  <div className="bg-muted rounded-lg p-4 border">
                    {isEditing ? (
                      <textarea
                        value={currentPrompt.system}
                        onChange={(e) => handlePromptChange('system', e.target.value)}
                        className="w-full h-32 bg-background border rounded p-2 text-sm font-mono resize-none"
                      />
                    ) : (
                      <pre className="text-sm whitespace-pre-wrap font-mono text-foreground">
                        {currentPrompt.system}
                      </pre>
                    )}
                  </div>
                </div>

                {/* User Prompt */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium">User Prompt Template</label>
                    {!isEditing && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleCopy(currentPrompt.userTemplate)}
                        className="h-7 text-xs"
                      >
                        {copied ? (
                          <>
                            <Check className="w-3 h-3 mr-1" />
                            Copied!
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3 mr-1" />
                            Copy
                          </>
                        )}
                      </Button>
                    )}
                  </div>
                  <div className="bg-muted rounded-lg p-4 border">
                    {isEditing ? (
                      <textarea
                        value={currentPrompt.userTemplate}
                        onChange={(e) => handlePromptChange('userTemplate', e.target.value)}
                        className="w-full h-64 bg-background border rounded p-2 text-sm font-mono resize-none"
                      />
                    ) : (
                      <pre className="text-sm whitespace-pre-wrap font-mono text-foreground">
                        {currentPrompt.userTemplate}
                      </pre>
                    )}
                  </div>
                </div>

                {/* Info Note */}
                <div className="p-4 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg flex gap-3">
                  <AlertCircle className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                  <div className="text-sm text-blue-800 dark:text-blue-300">
                    <p className="font-medium mb-1">Note:</p>
                    <p>
                      Use <code className="bg-blue-100 dark:bg-blue-900/50 px-1 rounded">{'{context}'}</code> placeholder in the user prompt template. 
                      It will be replaced with actual document context during generation.
                      The <span className="font-medium">active</span> prompt is automatically used when generating documents.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PromptBook;
