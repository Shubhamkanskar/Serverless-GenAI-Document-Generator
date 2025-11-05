/**
 * Generate Controller
 * Business logic for AI content generation
 * Separates controller logic from handler
 */

import chromaService from '../services/chromaService.js';
import geminiService from '../services/geminiService.js';
import bedrockService from '../services/bedrockService.js';
import embeddingService from '../services/embeddingService.js';
import { generateChecksheetPrompt, generateWorkInstructionsPrompt } from '../config/prompts.js';
import { logger } from '../utils/logger.js';

/**
 * Generate AI content from documents
 * @param {Object} params - Generation parameters
 * @param {string} params.useCase - Use case type ('checksheet' or 'workInstructions')
 * @param {Array<string>} params.documentIds - Array of document UUIDs
 * @param {string} [params.queryText] - Optional query text for better relevance
 * @param {string} [params.llmProvider] - LLM provider ('bedrock' or 'gemini'), defaults to 'gemini'
 * @returns {Promise<Object>} Generated content and metadata
 */
export const handleGenerate = async ({ useCase, documentIds, queryText, llmProvider = 'gemini' }) => {
  // Force Gemini as Bedrock is not accessible
  // If bedrock is requested, fallback to Gemini
  if (llmProvider === 'bedrock') {
    logger.warn('Bedrock requested but not accessible, falling back to Gemini', { originalProvider: llmProvider });
    llmProvider = 'gemini';
  }
  const startTime = Date.now();

  // Step 1: Generate query embedding (optional)
  // Use RETRIEVAL_QUERY task type for queries (optimized for search)
  let queryEmbedding = null;
  if (queryText && typeof queryText === 'string' && queryText.trim().length > 0) {
    try {
      logger.info('Generating query embedding...');
      queryEmbedding = await embeddingService.generateEmbedding(queryText.trim(), 'RETRIEVAL_QUERY');
      logger.info('Query embedding generated');
    } catch (embeddingError) {
      logger.warn('Failed to generate query embedding, using metadata filter only', embeddingError);
      // Continue without query embedding - will use metadata filter
    }
  }

  // Step 2: Query vector database for relevant chunks
  const useLangchain = process.env.USE_LANGCHAIN === 'true';
  logger.info(`Querying ${useLangchain ? 'via Langchain' : 'ChromaDB'} for relevant chunks...`);
  const topK = 10; // Number of results to return
  
  let relevantChunks;
  if (useLangchain) {
    // Use Langchain for similarity search
    const langchainService = (await import('../services/langchainService.js')).default;
    const query = queryText || 'document content'; // Langchain needs a query string
    const results = await langchainService.similaritySearch(query, documentIds, topK);
    relevantChunks = results.map(result => ({
      id: result.id,
      text: result.text,
      metadata: result.metadata,
      score: result.score
    }));
  } else {
    // Use native ChromaDB service (existing implementation)
    const chromaQueryText = queryText || null;
    relevantChunks = await chromaService.queryByDocumentIds(
      documentIds,
      chromaQueryText,
      topK
    );
  }

  if (!relevantChunks || relevantChunks.length === 0) {
    throw new Error(`No relevant chunks found for document IDs: ${documentIds.join(', ')}. Make sure documents have been ingested.`);
  }

  logger.info(`Retrieved ${relevantChunks.length} relevant chunks`);

  // Step 3: Build context from chunks
  logger.info('Building context from chunks...');
  const context = relevantChunks
    .map(chunk => {
      // Langchain returns text directly, native service has it in metadata
      const text = chunk.text || chunk.metadata?.text || '';
      return text.trim();
    })
    .filter(text => text.length > 0)
    .join('\n\n');

  if (context.length === 0) {
    throw new Error('No valid text content found in retrieved chunks');
  }

  logger.info(`Context built: ${context.length} characters from ${relevantChunks.length} chunks`);

  // Step 4: Get prompt template based on use case from prompt library
  // Support for promptId parameter to select specific prompt from library
  const promptId = null; // Can be passed from request in future
  logger.info(`Getting prompt template for use case: ${useCase}${promptId ? `, promptId: ${promptId}` : ' (using active prompt)'}`);
  let promptConfig;
  
  try {
    // Try to load from prompt library service (supports multiple prompts per use case)
    const { getPrompt } = await import('../services/promptLibraryService.js');
    const selectedPrompt = await getPrompt(useCase, promptId);
    
    if (selectedPrompt) {
      // Replace {context} placeholder with actual context
      const userPrompt = selectedPrompt.userTemplate.replace('{context}', context);
      promptConfig = {
        system: selectedPrompt.system,
        user: userPrompt
      };
      logger.info('Using prompt from library', { 
        useCase, 
        promptId: selectedPrompt.id, 
        promptName: selectedPrompt.name 
      });
    } else {
      // Fallback to default prompts
      if (useCase === 'checksheet') {
        promptConfig = generateChecksheetPrompt(context);
      } else if (useCase === 'workInstructions') {
        promptConfig = generateWorkInstructionsPrompt(context);
      } else {
        throw new Error(`Invalid use case: ${useCase}`);
      }
      logger.info('Using default prompt for use case', { useCase });
    }
  } catch (error) {
    logger.warn('Error loading prompt from library, using defaults', error);
    // Fallback to default prompts
    if (useCase === 'checksheet') {
      promptConfig = generateChecksheetPrompt(context);
    } else if (useCase === 'workInstructions') {
      promptConfig = generateWorkInstructionsPrompt(context);
    } else {
      throw new Error(`Invalid use case: ${useCase}`);
    }
  }

  // Step 5: Invoke AI model and parse JSON response
  logger.info(`Invoking ${llmProvider}...`);
  let parsedData;
  
  if (llmProvider === 'bedrock') {
    // Use Bedrock/Claude
    parsedData = await bedrockService.invokeAndParseJSON(
      promptConfig.system,
      promptConfig.user,
      {
        temperature: 0.3, // Lower temperature for structured output
        maxTokens: 4096
      }
    );
  } else {
    // Default to Gemini
    parsedData = await geminiService.invokeAndParseJSON(
      promptConfig.system,
      promptConfig.user,
      {
        temperature: 0.3, // Lower temperature for structured output
        maxTokens: 4096
      }
    );
  }

  logger.info('AI response received and parsed successfully', {
    llmProvider,
    dataKeys: Object.keys(parsedData)
  });

  const processingTime = ((Date.now() - startTime) / 1000).toFixed(2);

  return {
    useCase,
    documentIds,
    llmProvider,
    data: parsedData,
    chunksUsed: relevantChunks.length,
    contextLength: context.length,
    status: 'success',
    message: `${useCase} generated successfully using ${llmProvider}`,
    processingTime: `${processingTime}s`
  };
};

