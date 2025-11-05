/**
 * Lambda handler for prompt library management
 * Handles library operations: get library, get prompts, add, update, delete, activate
 */

import { logger } from '../utils/logger.js';
import { createSuccessResponse, createErrorResponse } from '../utils/errorHandler.js';
import { validateMethod, handleOptions, parseRequestBody } from '../utils/routeHandler.js';
import {
  getAllPromptLibraries,
  getPromptLibraryForUseCase,
  getPromptsForUseCase,
  getPrompt,
  addPrompt,
  updatePrompt,
  setActivePrompt,
  deletePrompt,
  resetPromptLibrary
} from '../services/promptLibraryService.js';

/**
 * GET /api/prompts/library - Get all prompt libraries
 */
export const getAllLibrariesHandler = async (event) => {
  try {
    logger.info('Getting all prompt libraries');
    
    const libraries = await getAllPromptLibraries();
    
    return createSuccessResponse({
      libraries,
      count: Object.keys(libraries).length
    });
  } catch (error) {
    logger.error('Error getting prompt libraries', error);
    return createErrorResponse(500, 'Failed to get prompt libraries', error);
  }
};

/**
 * GET /api/prompts/library/:useCase - Get library for specific use case
 */
export const getLibraryForUseCaseHandler = async (event) => {
  try {
    const useCase = event.pathParameters?.useCase;
    
    if (!useCase) {
      return createErrorResponse(400, 'Use case is required');
    }

    logger.info(`Getting prompt library for use case: ${useCase}`);
    
    const library = await getPromptLibraryForUseCase(useCase);
    
    if (!library) {
      return createErrorResponse(404, `Library not found for use case: ${useCase}`);
    }

    return createSuccessResponse({ library });
  } catch (error) {
    logger.error('Error getting prompt library', error);
    return createErrorResponse(500, 'Failed to get prompt library', error);
  }
};

/**
 * GET /api/prompts/library/:useCase/prompts - Get all prompts for use case
 */
export const getPromptsForUseCaseHandler = async (event) => {
  try {
    const useCase = event.pathParameters?.useCase;
    
    if (!useCase) {
      return createErrorResponse(400, 'Use case is required');
    }

    logger.info(`Getting prompts for use case: ${useCase}`);
    
    const prompts = await getPromptsForUseCase(useCase);
    
    return createSuccessResponse({
      useCase,
      prompts,
      count: prompts.length
    });
  } catch (error) {
    logger.error('Error getting prompts', error);
    return createErrorResponse(500, 'Failed to get prompts', error);
  }
};

/**
 * GET /api/prompts/library/:useCase/:promptId - Get specific prompt
 */
export const getPromptHandler = async (event) => {
  try {
    const useCase = event.pathParameters?.useCase;
    const promptId = event.pathParameters?.promptId;
    
    if (!useCase) {
      return createErrorResponse(400, 'Use case is required');
    }

    logger.info(`Getting prompt: ${useCase}/${promptId || 'active'}`);
    
    const prompt = await getPrompt(useCase, promptId);
    
    if (!prompt) {
      return createErrorResponse(404, `Prompt not found: ${useCase}/${promptId || 'active'}`);
    }

    return createSuccessResponse({ prompt });
  } catch (error) {
    logger.error('Error getting prompt', error);
    return createErrorResponse(500, 'Failed to get prompt', error);
  }
};

/**
 * POST /api/prompts/library/:useCase - Add new prompt to library
 */
export const addPromptHandler = async (event) => {
  try {
    const useCase = event.pathParameters?.useCase;
    const requestBody = parseRequestBody(event);
    
    if (!useCase) {
      return createErrorResponse(400, 'Use case is required');
    }

    if (!requestBody) {
      return createErrorResponse(400, 'Request body is required');
    }

    const { name, description, system, userTemplate, version, tags, isActive } = requestBody;

    if (!name || !system || !userTemplate) {
      return createErrorResponse(400, 'name, system, and userTemplate are required');
    }

    logger.info(`Adding new prompt to use case: ${useCase}`);
    
    const newPrompt = await addPrompt(useCase, {
      id: requestBody.id, // Optional
      name,
      description: description || '',
      system,
      userTemplate,
      version: version || '1.0.0',
      tags: tags || [],
      isActive: isActive || false
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
 * PUT /api/prompts/library/:useCase/:promptId - Update existing prompt
 */
export const updatePromptHandler = async (event) => {
  try {
    const useCase = event.pathParameters?.useCase;
    const promptId = event.pathParameters?.promptId;
    const requestBody = parseRequestBody(event);
    
    if (!useCase || !promptId) {
      return createErrorResponse(400, 'Use case and prompt ID are required');
    }

    if (!requestBody) {
      return createErrorResponse(400, 'Request body is required');
    }

    const { name, description, system, userTemplate, version, tags, isActive } = requestBody;

    logger.info(`Updating prompt: ${useCase}/${promptId}`);
    
    const updatedPrompt = await updatePrompt(useCase, promptId, {
      name,
      description,
      system,
      userTemplate,
      version,
      tags,
      isActive
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
 * POST /api/prompts/library/:useCase/:promptId/activate - Set prompt as active
 */
export const activatePromptHandler = async (event) => {
  try {
    const useCase = event.pathParameters?.useCase;
    const promptId = event.pathParameters?.promptId;
    
    if (!useCase || !promptId) {
      return createErrorResponse(400, 'Use case and prompt ID are required');
    }

    logger.info(`Activating prompt: ${useCase}/${promptId}`);
    
    const activatedPrompt = await setActivePrompt(useCase, promptId);

    return createSuccessResponse({
      prompt: activatedPrompt,
      message: 'Prompt activated successfully'
    });
  } catch (error) {
    logger.error('Error activating prompt', error);
    return createErrorResponse(500, error.message || 'Failed to activate prompt', error);
  }
};

/**
 * DELETE /api/prompts/library/:useCase/:promptId - Delete prompt
 */
export const deletePromptHandler = async (event) => {
  try {
    const useCase = event.pathParameters?.useCase;
    const promptId = event.pathParameters?.promptId;
    
    if (!useCase || !promptId) {
      return createErrorResponse(400, 'Use case and prompt ID are required');
    }

    logger.info(`Deleting prompt: ${useCase}/${promptId}`);
    
    await deletePrompt(useCase, promptId);

    return createSuccessResponse({
      message: 'Prompt deleted successfully'
    });
  } catch (error) {
    logger.error('Error deleting prompt', error);
    return createErrorResponse(500, error.message || 'Failed to delete prompt', error);
  }
};

/**
 * POST /api/prompts/library/reset - Reset library to defaults
 */
export const resetLibraryHandler = async (event) => {
  try {
    logger.info('Resetting prompt library to defaults');
    
    const defaultLibrary = await resetPromptLibrary();
    
    return createSuccessResponse({
      libraries: defaultLibrary,
      message: 'Prompt library reset to defaults successfully'
    });
  } catch (error) {
    logger.error('Error resetting prompt library', error);
    return createErrorResponse(500, 'Failed to reset prompt library', error);
  }
};

/**
 * Main handler - routes to appropriate function based on method and path
 */
export const handler = async (event) => {
  const method = event.httpMethod || event.requestContext?.http?.method;
  const path = event.path || event.requestContext?.http?.path || event.rawPath;
  const useCase = event.pathParameters?.useCase;
  const promptId = event.pathParameters?.promptId;
  
  logger.info('Prompt library handler invoked', {
    method,
    path,
    useCase,
    promptId,
    pathParameters: event.pathParameters,
    hasBody: !!event.body
  });

  try {
    // Handle OPTIONS preflight
    const optionsResponse = handleOptions(event);
    if (optionsResponse) {
      return optionsResponse;
    }

    // Use variables already extracted above

    // Route based on method and path
    // IMPORTANT: Check exact paths first, then parameterized paths
    
    // Reset endpoint (must check first - exact path)
    if (method === 'POST' && (path === '/api/prompts/library/reset' || path?.includes('/library/reset'))) {
      return await resetLibraryHandler(event);
    }
    
    // GET all libraries (exact path - must come before parameterized routes)
    if (method === 'GET' && path === '/api/prompts/library') {
      return await getAllLibrariesHandler(event);
    }
    
    // GET prompts for use case (specific path with /prompts)
    if (method === 'GET' && useCase && path?.includes(`/library/${useCase}/prompts`)) {
      return await getPromptsForUseCaseHandler(event);
    }
    
    // POST activate endpoint (specific path with /activate)
    if (method === 'POST' && useCase && promptId && path?.includes('/activate')) {
      return await activatePromptHandler(event);
    }
    
    // GET specific prompt (has both useCase and promptId)
    if (method === 'GET' && useCase && promptId) {
      return await getPromptHandler(event);
    }
    
    // PUT update prompt (has both useCase and promptId)
    if (method === 'PUT' && useCase && promptId) {
      return await updatePromptHandler(event);
    }
    
    // DELETE prompt (has both useCase and promptId)
    if (method === 'DELETE' && useCase && promptId) {
      return await deletePromptHandler(event);
    }
    
    // POST add new prompt (has useCase but no promptId)
    if (method === 'POST' && useCase && !promptId && path?.includes(`/library/${useCase}`)) {
      return await addPromptHandler(event);
    }
    
    // GET library for use case (has useCase but no promptId, and not /prompts)
    if (method === 'GET' && useCase && !promptId && !path?.includes('/prompts')) {
      return await getLibraryForUseCaseHandler(event);
    }

    return createErrorResponse(405, `Method ${method} not allowed for this path: ${path}`);
  } catch (error) {
    logger.error('Prompt library handler error', error);
    return createErrorResponse(500, 'Internal server error', error);
  }
};

