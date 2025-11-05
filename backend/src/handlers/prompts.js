/**
 * Lambda handler for prompt management
 * Handles GET, PUT, POST, and RESET operations for prompts
 */

import { logger } from '../utils/logger.js';
import { createSuccessResponse, createErrorResponse } from '../utils/errorHandler.js';
import { 
  loadPrompts, 
  getPrompt, 
  updatePrompt, 
  addPrompt, 
  resetPrompts 
} from '../services/promptStorageService.js';

/**
 * GET /api/prompts - Get all prompts
 */
export const getAllPrompts = async (event) => {
  try {
    logger.info('Getting all prompts');
    
    const prompts = await loadPrompts();
    
    return createSuccessResponse({
      prompts,
      count: Object.keys(prompts).length
    });
  } catch (error) {
    logger.error('Error getting prompts', error);
    return createErrorResponse(500, 'Failed to get prompts', error);
  }
};

/**
 * GET /api/prompts/:useCase - Get specific prompt
 */
export const getPromptHandler = async (event) => {
  try {
    const useCase = event.pathParameters?.useCase;
    
    if (!useCase) {
      return createErrorResponse(400, 'Use case is required');
    }

    logger.info(`Getting prompt for use case: ${useCase}`);
    
    const prompt = await getPrompt(useCase);
    
    if (!prompt) {
      return createErrorResponse(404, `Prompt not found for use case: ${useCase}`);
    }

    return createSuccessResponse({ prompt });
  } catch (error) {
    logger.error('Error getting prompt', error);
    return createErrorResponse(500, 'Failed to get prompt', error);
  }
};

/**
 * PUT /api/prompts/:useCase - Update existing prompt
 */
export const updatePromptHandler = async (event) => {
  try {
    const useCase = event.pathParameters?.useCase;
    
    if (!useCase) {
      return createErrorResponse(400, 'Use case is required');
    }

    const body = JSON.parse(event.body || '{}');
    const { system, userTemplate, name, description } = body;

    if (!system || !userTemplate) {
      return createErrorResponse(400, 'system and userTemplate are required');
    }

    logger.info(`Updating prompt for use case: ${useCase}`);
    
    const updatedPrompt = await updatePrompt(useCase, {
      system,
      userTemplate,
      name,
      description
    });

    return createSuccessResponse({
      prompt: updatedPrompt,
      message: 'Prompt updated successfully'
    });
  } catch (error) {
    logger.error('Error updating prompt', error);
    return createErrorResponse(500, error.message || 'Failed to update prompt', error);
  }
};

/**
 * POST /api/prompts - Add new prompt
 */
export const addPromptHandler = async (event) => {
  try {
    const body = JSON.parse(event.body || '{}');
    const { useCase, system, userTemplate, name, description } = body;

    if (!useCase || !system || !userTemplate || !name) {
      return createErrorResponse(400, 'useCase, name, system, and userTemplate are required');
    }

    logger.info(`Adding new prompt for use case: ${useCase}`);
    
    const newPrompt = await addPrompt(useCase, {
      system,
      userTemplate,
      name,
      description
    });

    return createSuccessResponse({
      prompt: newPrompt,
      message: 'Prompt added successfully'
    }, 201);
  } catch (error) {
    logger.error('Error adding prompt', error);
    return createErrorResponse(500, error.message || 'Failed to add prompt', error);
  }
};

/**
 * POST /api/prompts/reset - Reset prompts to defaults
 */
export const resetPromptsHandler = async (event) => {
  try {
    logger.info('Resetting prompts to defaults');
    
    await resetPrompts();
    
    const defaultPrompts = await loadPrompts();
    
    return createSuccessResponse({
      prompts: defaultPrompts,
      message: 'Prompts reset to defaults successfully'
    });
  } catch (error) {
    logger.error('Error resetting prompts', error);
    return createErrorResponse(500, 'Failed to reset prompts', error);
  }
};

/**
 * Main handler - routes to appropriate function based on method and path
 */
export const handler = async (event) => {
  const method = event.httpMethod || event.requestContext?.http?.method;
  const path = event.path || event.requestContext?.http?.path || event.rawPath;
  const useCase = event.pathParameters?.useCase;

  logger.info('Prompt handler invoked', { method, path, useCase, event: JSON.stringify(event).substring(0, 200) });

  try {
    // Route based on method and path
    // Check for reset endpoint first
    if (method === 'POST' && (path === '/api/prompts/reset' || path?.includes('/reset'))) {
      return await resetPromptsHandler(event);
    }
    
    // GET all prompts
    if (method === 'GET' && (!useCase || path === '/api/prompts')) {
      return await getAllPrompts(event);
    }
    
    // GET specific prompt
    if (method === 'GET' && useCase) {
      return await getPromptHandler(event);
    }
    
    // PUT update prompt
    if (method === 'PUT' && useCase) {
      return await updatePromptHandler(event);
    }
    
    // POST add new prompt
    if (method === 'POST' && !useCase) {
      return await addPromptHandler(event);
    }

    return createErrorResponse(405, `Method ${method} not allowed for this path: ${path}`);
  } catch (error) {
    logger.error('Prompt handler error', error);
    return createErrorResponse(500, 'Internal server error', error);
  }
};

