/**
 * Prompt Storage Service
 * Manages prompt storage in S3 with fallback to default prompts
 */

import { S3Client, GetObjectCommand, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { logger } from '../utils/logger.js';
import { PROMPTS as DEFAULT_PROMPTS } from '../config/prompts.js';

const s3Client = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });
const PROMPTS_BUCKET = process.env.PROMPTS_BUCKET || process.env.S3_DOCUMENTS_BUCKET || 'genai-documents-shubham';
const PROMPTS_KEY = 'prompts/custom-prompts.json';

/**
 * Get default prompts structure
 */
const getDefaultPrompts = () => {
  return {
    checksheet: {
      name: 'Inspection Checksheet',
      description: 'Extract inspection points from maintenance manuals',
      system: DEFAULT_PROMPTS.checksheet.system,
      userTemplate: DEFAULT_PROMPTS.checksheet.user.toString()
    },
    workInstructions: {
      name: 'Work Instructions',
      description: 'Create detailed step-by-step work instructions',
      system: DEFAULT_PROMPTS.workInstructions.system,
      userTemplate: DEFAULT_PROMPTS.workInstructions.user.toString()
    }
  };
};

/**
 * Load prompts from S3 or return defaults
 */
export const loadPrompts = async () => {
  try {
    const command = new GetObjectCommand({
      Bucket: PROMPTS_BUCKET,
      Key: PROMPTS_KEY
    });

    const response = await s3Client.send(command);
    const body = await response.Body.transformToString();
    const customPrompts = JSON.parse(body);

    logger.info('Loaded custom prompts from S3');
    return customPrompts;
  } catch (error) {
    if (error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404) {
      logger.info('No custom prompts found, using defaults');
      return getDefaultPrompts();
    }
    logger.error('Error loading prompts from S3, using defaults', error);
    return getDefaultPrompts();
  }
};

/**
 * Save prompts to S3
 */
export const savePrompts = async (prompts) => {
  try {
    const command = new PutObjectCommand({
      Bucket: PROMPTS_BUCKET,
      Key: PROMPTS_KEY,
      Body: JSON.stringify(prompts, null, 2),
      ContentType: 'application/json'
    });

    await s3Client.send(command);
    logger.info('Saved custom prompts to S3');
    return true;
  } catch (error) {
    logger.error('Error saving prompts to S3', error);
    throw new Error('Failed to save prompts');
  }
};

/**
 * Reset prompts to defaults (delete custom prompts from S3)
 */
export const resetPrompts = async () => {
  try {
    const command = new DeleteObjectCommand({
      Bucket: PROMPTS_BUCKET,
      Key: PROMPTS_KEY
    });

    await s3Client.send(command);
    logger.info('Reset prompts to defaults (deleted custom prompts)');
    return true;
  } catch (error) {
    if (error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404) {
      logger.info('No custom prompts to delete, already at defaults');
      return true;
    }
    logger.error('Error resetting prompts', error);
    throw new Error('Failed to reset prompts');
  }
};

/**
 * Get a specific prompt by use case
 */
export const getPrompt = async (useCase) => {
  const prompts = await loadPrompts();
  return prompts[useCase] || null;
};

/**
 * Update a specific prompt
 */
export const updatePrompt = async (useCase, promptData) => {
  const prompts = await loadPrompts();
  
  // Validate use case exists or allow new ones
  if (!prompts[useCase] && !promptData.name) {
    throw new Error('New prompts must include a name');
  }

  prompts[useCase] = {
    name: promptData.name || prompts[useCase]?.name || useCase,
    description: promptData.description || prompts[useCase]?.description || '',
    system: promptData.system,
    userTemplate: promptData.userTemplate
  };

  await savePrompts(prompts);
  return prompts[useCase];
};

/**
 * Add a new prompt
 */
export const addPrompt = async (useCase, promptData) => {
  const prompts = await loadPrompts();
  
  if (prompts[useCase]) {
    throw new Error(`Prompt with use case '${useCase}' already exists. Use update instead.`);
  }

  if (!promptData.name || !promptData.system || !promptData.userTemplate) {
    throw new Error('New prompts must include name, system, and userTemplate');
  }

  prompts[useCase] = {
    name: promptData.name,
    description: promptData.description || '',
    system: promptData.system,
    userTemplate: promptData.userTemplate
  };

  await savePrompts(prompts);
  return prompts[useCase];
};

