/**
 * Prompt Library Service
 * Manages prompt libraries with multiple prompts per use case
 * Each use case can have multiple prompt variations, with one marked as active/default
 */

import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { logger } from '../utils/logger.js';
import { PROMPTS as DEFAULT_PROMPTS } from '../config/prompts.js';

const s3Client = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });
const PROMPTS_BUCKET = process.env.PROMPTS_BUCKET || process.env.S3_DOCUMENTS_BUCKET || 'genai-documents-shubham';
const PROMPTS_KEY = 'prompts/prompt-library.json';

/**
 * Get default prompt library structure
 * Each use case has a library with one default prompt
 */
const getDefaultLibrary = () => {
  return {
    checksheet: {
      useCase: 'checksheet',
      activePromptId: 'default',
      prompts: [
        {
          id: 'default',
          name: 'Standard Inspection Checksheet',
          description: 'Extract inspection points from maintenance manuals with standard format',
          system: DEFAULT_PROMPTS.checksheet.system,
          userTemplate: DEFAULT_PROMPTS.checksheet.user.toString().replace(/^\(context\) => /, ''),
          version: '1.0.0',
          tags: ['default', 'standard'],
          isActive: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      ]
    },
    workInstructions: {
      useCase: 'workInstructions',
      activePromptId: 'default',
      prompts: [
        {
          id: 'default',
          name: 'Standard Work Instructions',
          description: 'Create detailed step-by-step work instructions from maintenance manuals',
          system: DEFAULT_PROMPTS.workInstructions.system,
          userTemplate: DEFAULT_PROMPTS.workInstructions.user.toString().replace(/^\(context\) => /, ''),
          version: '1.0.0',
          tags: ['default', 'standard'],
          isActive: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      ]
    }
  };
};

/**
 * Load prompt library from S3 or return defaults
 */
export const loadPromptLibrary = async () => {
  try {
    const command = new GetObjectCommand({
      Bucket: PROMPTS_BUCKET,
      Key: PROMPTS_KEY
    });

    const response = await s3Client.send(command);
    const body = await response.Body.transformToString();
    const library = JSON.parse(body);

    logger.info('Loaded prompt library from S3');
    return library;
  } catch (error) {
    if (error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404) {
      logger.info('No prompt library found, using defaults');
      return getDefaultLibrary();
    }
    logger.error('Error loading prompt library from S3, using defaults', error);
    return getDefaultLibrary();
  }
};

/**
 * Save prompt library to S3
 */
export const savePromptLibrary = async (library) => {
  try {
    const command = new PutObjectCommand({
      Bucket: PROMPTS_BUCKET,
      Key: PROMPTS_KEY,
      Body: JSON.stringify(library, null, 2),
      ContentType: 'application/json'
    });

    await s3Client.send(command);
    logger.info('Saved prompt library to S3');
    return true;
  } catch (error) {
    logger.error('Error saving prompt library to S3', error);
    throw new Error('Failed to save prompt library');
  }
};

/**
 * Get prompt library for a specific use case
 */
export const getPromptLibraryForUseCase = async (useCase) => {
  const library = await loadPromptLibrary();
  return library[useCase] || null;
};

/**
 * Get all prompt libraries
 */
export const getAllPromptLibraries = async () => {
  return await loadPromptLibrary();
};

/**
 * Get a specific prompt by use case and promptId
 * If promptId is not provided, returns the active prompt
 */
export const getPrompt = async (useCase, promptId = null) => {
  const library = await loadPromptLibrary();
  const useCaseLibrary = library[useCase];
  
  if (!useCaseLibrary) {
    return null;
  }

  // If no promptId specified, use active prompt
  const targetPromptId = promptId || useCaseLibrary.activePromptId || 'default';
  
  const prompt = useCaseLibrary.prompts.find(p => p.id === targetPromptId);
  
  if (!prompt) {
    // Fallback to first prompt if active/default not found
    logger.warn(`Prompt ${targetPromptId} not found for use case ${useCase}, using first prompt`);
    return useCaseLibrary.prompts[0] || null;
  }

  return prompt;
};

/**
 * Get all prompts for a use case
 */
export const getPromptsForUseCase = async (useCase) => {
  const library = await loadPromptLibrary();
  const useCaseLibrary = library[useCase];
  
  if (!useCaseLibrary) {
    return [];
  }

  return useCaseLibrary.prompts;
};

/**
 * Add a new prompt to a use case library
 */
export const addPrompt = async (useCase, promptData) => {
  const library = await loadPromptLibrary();
  
  if (!library[useCase]) {
    // Create new use case library
    library[useCase] = {
      useCase,
      activePromptId: 'default',
      prompts: []
    };
  }

  const useCaseLibrary = library[useCase];
  
  // Generate unique ID if not provided
  const promptId = promptData.id || `prompt-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  // Check if prompt ID already exists
  if (useCaseLibrary.prompts.find(p => p.id === promptId)) {
    throw new Error(`Prompt with ID '${promptId}' already exists for use case '${useCase}'`);
  }

  const newPrompt = {
    id: promptId,
    name: promptData.name,
    description: promptData.description || '',
    system: promptData.system,
    userTemplate: promptData.userTemplate,
    version: promptData.version || '1.0.0',
    tags: promptData.tags || [],
    isActive: promptData.isActive || false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  // If this is set as active, update active flag
  if (newPrompt.isActive) {
    // Set all other prompts as inactive
    useCaseLibrary.prompts.forEach(p => p.isActive = false);
    useCaseLibrary.activePromptId = promptId;
  }

  useCaseLibrary.prompts.push(newPrompt);
  
  await savePromptLibrary(library);
  logger.info(`Added new prompt ${promptId} to use case ${useCase}`);
  
  return newPrompt;
};

/**
 * Update an existing prompt
 */
export const updatePrompt = async (useCase, promptId, promptData) => {
  const library = await loadPromptLibrary();
  const useCaseLibrary = library[useCase];
  
  if (!useCaseLibrary) {
    throw new Error(`Use case '${useCase}' not found`);
  }

  const promptIndex = useCaseLibrary.prompts.findIndex(p => p.id === promptId);
  
  if (promptIndex === -1) {
    throw new Error(`Prompt '${promptId}' not found for use case '${useCase}'`);
  }

  const existingPrompt = useCaseLibrary.prompts[promptIndex];
  
  // Update prompt data
  const updatedPrompt = {
    ...existingPrompt,
    ...promptData,
    id: promptId, // Ensure ID doesn't change
    updatedAt: new Date().toISOString()
  };

  // If setting as active, update active flags
  if (promptData.isActive !== undefined && promptData.isActive) {
    useCaseLibrary.prompts.forEach(p => p.isActive = false);
    updatedPrompt.isActive = true;
    useCaseLibrary.activePromptId = promptId;
  }

  useCaseLibrary.prompts[promptIndex] = updatedPrompt;
  
  await savePromptLibrary(library);
  logger.info(`Updated prompt ${promptId} for use case ${useCase}`);
  
  return updatedPrompt;
};

/**
 * Set a prompt as active for a use case
 */
export const setActivePrompt = async (useCase, promptId) => {
  const library = await loadPromptLibrary();
  const useCaseLibrary = library[useCase];
  
  if (!useCaseLibrary) {
    throw new Error(`Use case '${useCase}' not found`);
  }

  const prompt = useCaseLibrary.prompts.find(p => p.id === promptId);
  
  if (!prompt) {
    throw new Error(`Prompt '${promptId}' not found for use case '${useCase}'`);
  }

  // Set all prompts as inactive
  useCaseLibrary.prompts.forEach(p => p.isActive = false);
  
  // Set selected prompt as active
  prompt.isActive = true;
  useCaseLibrary.activePromptId = promptId;
  
  await savePromptLibrary(library);
  logger.info(`Set prompt ${promptId} as active for use case ${useCase}`);
  
  return prompt;
};

/**
 * Delete a prompt from a use case library
 */
export const deletePrompt = async (useCase, promptId) => {
  const library = await loadPromptLibrary();
  const useCaseLibrary = library[useCase];
  
  if (!useCaseLibrary) {
    throw new Error(`Use case '${useCase}' not found`);
  }

  const promptIndex = useCaseLibrary.prompts.findIndex(p => p.id === promptId);
  
  if (promptIndex === -1) {
    throw new Error(`Prompt '${promptId}' not found for use case '${useCase}'`);
  }

  // Don't allow deleting if it's the only prompt
  if (useCaseLibrary.prompts.length === 1) {
    throw new Error(`Cannot delete the last prompt for use case '${useCase}'. At least one prompt is required.`);
  }

  const wasActive = useCaseLibrary.prompts[promptIndex].isActive;
  
  // Remove prompt
  useCaseLibrary.prompts.splice(promptIndex, 1);
  
  // If deleted prompt was active, set first prompt as active
  if (wasActive && useCaseLibrary.prompts.length > 0) {
    useCaseLibrary.prompts[0].isActive = true;
    useCaseLibrary.activePromptId = useCaseLibrary.prompts[0].id;
  }
  
  await savePromptLibrary(library);
  logger.info(`Deleted prompt ${promptId} from use case ${useCase}`);
  
  return true;
};

/**
 * Reset prompt library to defaults
 */
export const resetPromptLibrary = async () => {
  const defaultLibrary = getDefaultLibrary();
  await savePromptLibrary(defaultLibrary);
  logger.info('Reset prompt library to defaults');
  return defaultLibrary;
};

