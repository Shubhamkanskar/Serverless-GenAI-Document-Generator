/**
 * Generate Controller
 * Business logic for AI content generation
 * Separates controller logic from handler
 */

import chromaService from '../services/chromaService.js';
import pineconeService from '../services/pineconeService.js';
import geminiService from '../services/geminiService.js';
import bedrockService from '../services/bedrockService.js';
import embeddingService from '../services/embeddingService.js';
import { generateChecksheetPrompt, generateWorkInstructionsPrompt } from '../config/prompts.js';
import { getPrompt } from '../services/promptLibraryService.js';
import { logger } from '../utils/logger.js';

/**
 * Split context into multiple smaller chunks to avoid token limit
 * Uses aggressive chunking: many small chunks = very small responses
 * @param {string} context - Full context string
 * @param {Array<Object>} chunkPositionMap - Array of { startChar, endChar, chunk } mappings
 * @param {number} targetChunkSize - Target size per chunk in characters (default: 300)
 * @returns {Array<Object>} Array of context chunks with source metadata
 */
const splitContextIntoChunks = (context, chunkPositionMap = [], targetChunkSize = 300) => {
  const totalLength = context.length;
  const numChunks = Math.max(15, Math.ceil(totalLength / targetChunkSize)); // Minimum 15 chunks
  
  const chunkSize = Math.ceil(totalLength / numChunks);
  
  const chunks = [];
  for (let i = 0; i < numChunks; i++) {
    const start = i * chunkSize;
    const end = Math.min(start + chunkSize, totalLength);
    const chunkText = context.substring(start, end);
    if (chunkText.trim().length > 0) {
      // Find which source chunk(s) this text comes from using position map
      const sourceInfo = findSourceForTextRange(start, end, chunkPositionMap);
      chunks.push({
        text: chunkText,
        startChar: start,
        endChar: end,
        source: sourceInfo
      });
    }
  }
  
  logger.info(`Split context into ${chunks.length} chunks (target: ${targetChunkSize} chars per chunk)`, {
    totalLength,
    avgChunkSize: Math.round(totalLength / chunks.length),
    minChunkSize: Math.min(...chunks.map(c => c.text.length)),
    maxChunkSize: Math.max(...chunks.map(c => c.text.length)),
    sourceChunksMapped: chunkPositionMap.length
  });
  
  return chunks;
};

/**
 * Find source metadata for a text range in the context using chunk position map
 * @param {number} startChar - Start character position in merged context
 * @param {number} endChar - End character position in merged context
 * @param {Array<Object>} chunkPositionMap - Array of { startChar, endChar, chunk } mappings
 * @returns {Object} Source information
 */
const findSourceForTextRange = (startChar, endChar, chunkPositionMap) => {
  if (!chunkPositionMap || chunkPositionMap.length === 0) {
    return { fileName: 'Unknown', pageNumber: null };
  }

  // Find which original chunk(s) this range overlaps with
  // Use the chunk that contains the start position
  for (const mappedChunk of chunkPositionMap) {
    if (startChar >= mappedChunk.startChar && startChar < mappedChunk.endChar) {
      // This chunk contains the start of our range
      const chunk = mappedChunk.chunk;
      const fileName = chunk.metadata?.fileName || chunk.metadata?.originalFileName || 'Unknown Document';
      // Prefer displayPageNumber (internal page number) over pageNumber (PDF index)
      const pageNumber = chunk.metadata?.displayPageNumber || chunk.metadata?.pageNumber || null;
      const pageRange = chunk.metadata?.pageRange || null;
      const internalPageNumber = chunk.metadata?.internalPageNumber || null;

      // Diagnostic: Warn if page number is missing
      if (!pageNumber) {
        logger.warn('Missing page number in chunk metadata (diagnostic)', {
          chunkId: chunk.id,
          fileName,
          hasMetadata: !!chunk.metadata,
          metadataKeys: chunk.metadata ? Object.keys(chunk.metadata) : [],
          chunkStart: mappedChunk.startChar,
          chunkEnd: mappedChunk.endChar
        });
      }

      logger.debug(`Mapped text range ${startChar}-${endChar} to chunk`, {
        fileName,
        pageNumber,
        internalPageNumber,
        pageRange,
        chunkStart: mappedChunk.startChar,
        chunkEnd: mappedChunk.endChar
      });
      
      return {
        fileName,
        pageNumber,
        internalPageNumber,
        pageRange: pageRange || (pageNumber ? `${pageNumber}` : null)
      };
    }
  }
  
  // Fallback to first chunk if not found
  const firstMapped = chunkPositionMap[0];
  const firstChunk = firstMapped?.chunk;
  if (firstChunk) {
    // Prefer displayPageNumber (internal page number) over pageNumber (PDF index)
    const pageNumber = firstChunk.metadata?.displayPageNumber || firstChunk.metadata?.pageNumber || null;
    return {
      fileName: firstChunk.metadata?.fileName || firstChunk.metadata?.originalFileName || 'Unknown Document',
      pageNumber,
      pageRange: firstChunk.metadata?.pageRange || (pageNumber ? `${pageNumber}` : null)
    };
  }
  
  return { fileName: 'Unknown', pageNumber: null };
};

/**
 * Generate checksheet content using chunked generation (multiple requests)
 * @param {Array<string>} contextChunks - Array of context chunks
 * @param {Object} promptConfig - Prompt configuration
 * @param {string} llmProvider - LLM provider
 * @param {Function} onProgress - Optional progress callback
 * @returns {Promise<Array>} Merged checksheet items array
 */
const generateChecksheetChunked = async (contextChunks, promptConfig, llmProvider, onProgress) => {
  const allItems = [];
  const totalChunks = contextChunks.length;
  
  // Use close to maximum tokens (8000) to allow full responses while keeping prompts strict
  // Strict prompts ensure responses stay small naturally
  const maxTokensPerChunk = 8000;
  
  // Limit items per chunk to prevent excessive response size
  const maxItemsPerChunk = 8; // Generate max 8 items per chunk to keep responses small

  for (let i = 0; i < contextChunks.length; i++) {
    const chunkObj = contextChunks[i];
    const chunk = typeof chunkObj === 'string' ? chunkObj : chunkObj.text;
    const sourceInfo = chunkObj.source || { fileName: 'Unknown', pageNumber: null };
    
    logger.info(`Generating checksheet chunk ${i + 1}/${totalChunks} (chunk size: ${chunk.length} chars, max ${maxItemsPerChunk} items)...`);
    
    if (onProgress) {
      onProgress({
        step: `generating_checksheet_chunk_${i + 1}`,
        progress: Math.round((i / totalChunks) * 30 + 10), // 10-40% range
        message: `Generating checksheet section ${i + 1} of ${totalChunks}...`
      });
    }

    try {
      // Create prompt with explicit item limit and strict size constraints
      const chunkPrompt = promptConfig.user
        .replace('{context}', chunk)
        .replace('Extract the most important', `CRITICAL: Generate EXACTLY ${maxItemsPerChunk} items maximum. Extract the ${maxItemsPerChunk} most important`)
        .replace('Keep the response concise', 'Keep response VERY concise - each item should be 1-2 sentences max. Limit notes to 10 words or less.');
      
      const chunkPromptConfig = {
        system: promptConfig.system + `\n\nCRITICAL CONSTRAINTS:\n- Maximum ${maxItemsPerChunk} items in response\n- Keep each item VERY brief (itemName: 3 words max, inspectionPoint: 1 sentence max, notes: max 5 words)\n- Return ONLY the JSON array, no explanations\n- Example: [{"itemName": "Short Name", "inspectionPoint": "One sentence.", "frequency": "Monthly", "expectedStatus": "OK", "notes": "Brief"}]`,
        user: chunkPrompt
      };

      // Generate this chunk with aggressive token limit
      let chunkData;
      if (llmProvider === 'bedrock') {
        chunkData = await bedrockService.invokeAndParseJSON(
          chunkPromptConfig.system,
          chunkPromptConfig.user,
          {
            temperature: 0.3,
            maxTokens: maxTokensPerChunk
          }
        );
      } else {
        // Explicitly pass maxTokens to ensure it's used
        chunkData = await geminiService.invokeAndParseJSON(
          chunkPromptConfig.system,
          chunkPromptConfig.user,
          {
            temperature: 0.3,
            maxTokens: maxTokensPerChunk // Use 4000 instead of 8192
          }
        );
      }

      // Extract items from chunk response
      const chunkItems = Array.isArray(chunkData) ? chunkData : (chunkData.items || chunkData.data || []);
      
      // Limit items if somehow more were generated
      const limitedItems = Array.isArray(chunkItems) ? chunkItems.slice(0, maxItemsPerChunk) : [];
      
      // Add source reference to each item
      const itemsWithSources = limitedItems.map(item => ({
        ...item,
        source: sourceInfo.pageNumber 
          ? `${sourceInfo.fileName}, Page ${sourceInfo.pageRange || sourceInfo.pageNumber}`
          : sourceInfo.fileName,
        sourceFile: sourceInfo.fileName,
        sourcePage: sourceInfo.pageNumber || null
      }));
      
      if (itemsWithSources.length > 0) {
        allItems.push(...itemsWithSources);
        logger.info(`Chunk ${i + 1}/${totalChunks} generated ${itemsWithSources.length} items successfully with source: ${sourceInfo.fileName}${sourceInfo.pageNumber ? `, Page ${sourceInfo.pageNumber}` : ''}`);
      } else {
        logger.warn(`Chunk ${i + 1}/${totalChunks} returned no items`);
      }
    } catch (error) {
      logger.error(`Chunk ${i + 1}/${totalChunks} failed`, {
        error: error.message,
        chunkSize: chunk.length,
        stack: error.stack
      });
      // Re-throw with context about which chunk failed
      throw new Error(`Failed to generate checksheet chunk ${i + 1} of ${totalChunks}: ${error.message}`);
    }
  }

  logger.info(`Chunked generation complete: ${allItems.length} total items from ${totalChunks} chunks`);
  
  // Return items with metadata
  return {
    items: allItems,
    metadata: {
      totalChunks,
      totalItems: allItems.length
    }
  };
};

/**
 * Generate work instructions content using chunked generation (multiple requests)
 * @param {Array<string>} contextChunks - Array of context chunks
 * @param {Object} promptConfig - Prompt configuration
 * @param {string} llmProvider - LLM provider
 * @param {Function} onProgress - Optional progress callback
 * @returns {Promise<Object>} Merged work instructions object
 */
const generateWorkInstructionsChunked = async (contextChunks, promptConfig, llmProvider, onProgress) => {
  const mergedResult = {
    title: null,
    overview: null,
    prerequisites: { tools: [], materials: [], safety: [] },
    steps: [],
    safetyWarnings: [],
    completionChecklist: []
  };

  const totalChunks = contextChunks.length;
  
  // Use close to maximum tokens (8000) to allow full responses while keeping prompts strict
  // Strict prompts ensure responses stay small naturally
  const maxTokensPerChunk = 8000;
  
  // Limit sections per chunk to prevent excessive response size
  const maxStepsPerChunk = 2; // Generate max 2 steps per chunk to keep responses small

  // Process all chunks uniformly
  // First chunk: Try to get overview/prerequisites
  // Middle chunks: Generate steps
  // Last chunk: Try to get safety/completion
  // But if any chunk fails, we'll still have partial data

  for (let i = 0; i < contextChunks.length; i++) {
    const chunkObj = contextChunks[i];
    const chunk = typeof chunkObj === 'string' ? chunkObj : chunkObj.text;
    const sourceInfo = chunkObj.source || { fileName: 'Unknown', pageNumber: null };
    const chunkIndex = i + 1;
    const isFirstChunk = i === 0;
    const isLastChunk = i === contextChunks.length - 1;
    
    logger.info(`Generating work instructions chunk ${chunkIndex}/${totalChunks} (chunk size: ${chunk.length} chars)...`);
    
    if (onProgress) {
      onProgress({
        step: `generating_work_instructions_chunk_${chunkIndex}`,
        progress: Math.round((i / totalChunks) * 50 + 10), // 10-60% range
        message: `Generating work instructions section ${chunkIndex} of ${totalChunks}...`
      });
    }

    try {
      // Determine what to request from this chunk
      let chunkPrompt, chunkSystemPrompt;
      
      if (isFirstChunk && !mergedResult.title) {
        // First chunk: Try to get ONLY title and overview (keep it minimal)
        chunkPrompt = promptConfig.user
          .replace('{context}', chunk)
          .replace('Create concise step-by-step work instructions.', 'Create ONLY the title and overview sections. Keep each section VERY brief.')
          .replace('Include:', 'Include ONLY:')
          .replace('1. Overview section', '1. Title (REQUIRED - single line, max 10 words)')
          .replace('2. Prerequisites', '2. Overview (REQUIRED - exactly 2 sentences, no more)')
          .replace('3. Step-by-step procedure', 'DO NOT include steps')
          .replace('4. Safety warnings', 'DO NOT include safety warnings')
          .replace('5. Completion checklist', 'DO NOT include prerequisites, safety warnings, or completion checklist');
        
        chunkSystemPrompt = promptConfig.system + `\n\nCRITICAL CONSTRAINTS:\n- Maximum 1 title (5 words max)\n- Maximum 1 overview (exactly 1 sentence, no more)\n- Keep response EXTREMELY brief\n- Return ONLY the JSON object with title and overview fields, no explanations, no other fields\n- Example: {"title": "Short Title", "overview": "One sentence only."}`;
      } else if ((i === 1 || (i === 0 && mergedResult.title)) && (!mergedResult.prerequisites.tools || mergedResult.prerequisites.tools.length === 0)) {
        // Second chunk or first chunk after title: Get prerequisites only
        chunkPrompt = promptConfig.user
          .replace('{context}', chunk)
          .replace('Create concise step-by-step work instructions.', 'Create ONLY the prerequisites section. Keep lists very short.')
          .replace('Include:', 'Include ONLY:')
          .replace('1. Overview section', 'DO NOT include title or overview')
          .replace('2. Prerequisites', '2. Prerequisites (REQUIRED - tools: 3 items max, materials: 3 items max, safety: 3 items max)')
          .replace('3. Step-by-step procedure', 'DO NOT include steps')
          .replace('4. Safety warnings', 'DO NOT include safety warnings')
          .replace('5. Completion checklist', 'DO NOT include completion checklist');
        
        chunkSystemPrompt = promptConfig.system + `\n\nCRITICAL CONSTRAINTS:\n- Maximum 2 tools (each 2 words max)\n- Maximum 2 materials (each 2 words max)\n- Maximum 2 safety items (each 5 words max)\n- Keep EXTREMELY brief\n- Return ONLY the JSON object with prerequisites field, no explanations\n- Example: {"prerequisites": {"tools": ["Tool1", "Tool2"], "materials": ["Mat1", "Mat2"], "safety": ["Safety1", "Safety2"]}}`;
      } else if (isLastChunk && mergedResult.steps.length === 0) {
        // Last chunk but no steps yet: Generate steps
        chunkPrompt = promptConfig.user
          .replace('{context}', chunk)
          .replace('Create concise step-by-step work instructions.', `Create ONLY ${maxStepsPerChunk} steps maximum for the procedure.`)
          .replace('Include:', 'Include ONLY:')
          .replace('1. Overview section', 'DO NOT include overview')
          .replace('2. Prerequisites', 'DO NOT include prerequisites')
          .replace('3. Step-by-step procedure', `3. Step-by-step procedure (REQUIRED - ${maxStepsPerChunk} steps max)`)
          .replace('4. Safety warnings', 'DO NOT include safety warnings')
          .replace('5. Completion checklist', 'DO NOT include completion checklist');
        
        chunkSystemPrompt = promptConfig.system + `\n\nCRITICAL CONSTRAINTS:\n- Maximum ${maxStepsPerChunk} steps in response\n- Each step should be EXTREMELY brief (title: 3 words max, description: 1 sentence max, notes: optional, 3 words max)\n- Keep steps EXTREMELY concise\n- Return ONLY the JSON object with steps array, no explanations\n- Example: {"steps": [{"stepNumber": 1, "title": "Short Title", "description": "One sentence.", "notes": "Brief"}]}`;
      } else if (isLastChunk) {
        // Last chunk: Try to get safety warnings and completion checklist
        chunkPrompt = promptConfig.user
          .replace('{context}', chunk)
          .replace('Create concise step-by-step work instructions.', 'Create ONLY the safety warnings and completion checklist sections. Keep each brief.')
          .replace('Include:', 'Include ONLY:')
          .replace('1. Overview section', 'DO NOT include overview')
          .replace('2. Prerequisites', 'DO NOT include prerequisites')
          .replace('3. Step-by-step procedure', 'DO NOT include steps')
          .replace('4. Safety warnings', '4. Safety warnings (REQUIRED - 3-5 items max)')
          .replace('5. Completion checklist', '5. Completion checklist (REQUIRED - 3-5 items max)');
        
        chunkSystemPrompt = promptConfig.system + `\n\nCRITICAL CONSTRAINTS:\n- Maximum 2 safety warnings (each 5 words max)\n- Maximum 2 completion checklist items (each 3 words max)\n- Keep response EXTREMELY brief\n- Return ONLY the JSON object, no explanations\n- Example: {"safetyWarnings": ["Warning1", "Warning2"], "completionChecklist": ["Item1", "Item2"]}`;
      } else {
        // Middle chunks: Generate steps
        chunkPrompt = promptConfig.user
          .replace('{context}', chunk)
          .replace('Create concise step-by-step work instructions.', `Create ONLY ${maxStepsPerChunk} steps maximum for part ${chunkIndex} of the procedure.`)
          .replace('Include:', 'Include ONLY:')
          .replace('1. Overview section', 'DO NOT include overview')
          .replace('2. Prerequisites', 'DO NOT include prerequisites')
          .replace('3. Step-by-step procedure', `3. Step-by-step procedure part ${chunkIndex} (REQUIRED - ${maxStepsPerChunk} steps max)`)
          .replace('4. Safety warnings', 'DO NOT include safety warnings')
          .replace('5. Completion checklist', 'DO NOT include completion checklist');
        
        chunkSystemPrompt = promptConfig.system + `\n\nCRITICAL CONSTRAINTS:\n- Maximum ${maxStepsPerChunk} steps in response\n- Each step should be EXTREMELY brief (title: 3 words max, description: 1 sentence max, notes: optional, 3 words max)\n- Number steps sequentially starting from ${mergedResult.steps.length + 1}\n- Keep steps EXTREMELY concise\n- Return ONLY the JSON object with steps array, no explanations\n- Example: {"steps": [{"stepNumber": 1, "title": "Short", "description": "One sentence.", "notes": "Brief"}]}`;
      }

      const chunkPromptConfig = {
        system: chunkSystemPrompt,
        user: chunkPrompt
      };

      // Generate this chunk with aggressive token limit
      let chunkData;
      if (llmProvider === 'bedrock') {
        chunkData = await bedrockService.invokeAndParseJSON(
          chunkPromptConfig.system,
          chunkPromptConfig.user,
          {
            temperature: 0.3,
            maxTokens: maxTokensPerChunk
          }
        );
      } else {
        // Explicitly pass maxTokens to ensure it's used
        chunkData = await geminiService.invokeAndParseJSON(
          chunkPromptConfig.system,
          chunkPromptConfig.user,
          {
            temperature: 0.3,
            maxTokens: maxTokensPerChunk // Use 4000 instead of 8192
          }
        );
      }

      // Merge chunk data into result
      if (chunkData) {
        // Merge title, overview, prerequisites (from first chunk)
        if (chunkData.title && !mergedResult.title) {
          mergedResult.title = chunkData.title;
        }
        if (chunkData.overview && !mergedResult.overview) {
          mergedResult.overview = chunkData.overview;
        }
        if (chunkData.prerequisites) {
          if (Array.isArray(chunkData.prerequisites)) {
            mergedResult.prerequisites = { tools: [], materials: [], safety: chunkData.prerequisites };
          } else {
            mergedResult.prerequisites = {
              tools: [...(mergedResult.prerequisites.tools || []), ...(chunkData.prerequisites.tools || [])],
              materials: [...(mergedResult.prerequisites.materials || []), ...(chunkData.prerequisites.materials || [])],
              safety: [...(mergedResult.prerequisites.safety || []), ...(chunkData.prerequisites.safety || [])]
            };
          }
        }

        // Merge steps (from middle/last chunks) with source references
        if (chunkData.steps && Array.isArray(chunkData.steps)) {
          // Build source reference string
          const sourceRef = sourceInfo.pageNumber 
            ? `${sourceInfo.fileName}, Page ${sourceInfo.pageRange || sourceInfo.pageNumber}`
            : sourceInfo.fileName;
          
          // Limit steps if somehow more were generated
          const limitedSteps = chunkData.steps.slice(0, maxStepsPerChunk);
          
          // Renumber steps to be sequential and add source references
          const startStepNumber = mergedResult.steps.length + 1;
          const renumberedSteps = limitedSteps.map((step, idx) => ({
            ...step,
            stepNumber: startStepNumber + idx,
            source: sourceRef,
            sourceFile: sourceInfo.fileName,
            sourcePage: sourceInfo.pageNumber || null
          }));
          mergedResult.steps.push(...renumberedSteps);
          logger.info(`Chunk ${chunkIndex}/${totalChunks} generated ${renumberedSteps.length} steps successfully with source: ${sourceInfo.fileName}${sourceInfo.pageNumber ? `, Page ${sourceInfo.pageNumber}` : ''}`);
        }

        // Merge safety warnings and completion checklist (from last chunk) with source references
        if (chunkData.safetyWarnings && Array.isArray(chunkData.safetyWarnings)) {
          // Build source reference string
          const sourceRef = sourceInfo.pageNumber 
            ? `${sourceInfo.fileName}, Page ${sourceInfo.pageRange || sourceInfo.pageNumber}`
            : sourceInfo.fileName;
          
          const warningsWithSource = chunkData.safetyWarnings.map(warning => {
            const warningText = typeof warning === 'string' ? warning : warning.text || warning;
            return {
              text: warningText,
              source: sourceRef,
              sourceFile: sourceInfo.fileName,
              sourcePage: sourceInfo.pageNumber || null
            };
          });
          mergedResult.safetyWarnings.push(...warningsWithSource);
        }
        if (chunkData.completionChecklist && Array.isArray(chunkData.completionChecklist)) {
          // Build source reference string
          const sourceRef = sourceInfo.pageNumber 
            ? `${sourceInfo.fileName}, Page ${sourceInfo.pageRange || sourceInfo.pageNumber}`
            : sourceInfo.fileName;
          
          const checklistWithSource = chunkData.completionChecklist.map(item => {
            const itemText = typeof item === 'string' ? item : item.text || item;
            return {
              text: itemText,
              source: sourceRef,
              sourceFile: sourceInfo.fileName,
              sourcePage: sourceInfo.pageNumber || null
            };
          });
          mergedResult.completionChecklist.push(...checklistWithSource);
        }
      }
    } catch (error) {
      logger.error(`Chunk ${chunkIndex}/${totalChunks} failed`, {
        error: error.message,
        chunkSize: chunk.length,
        stack: error.stack
      });
      // Re-throw with context about which chunk failed
      throw new Error(`Failed to generate work instructions chunk ${chunkIndex} of ${totalChunks}: ${error.message}`);
    }
  }

  // Ensure title if not set
  if (!mergedResult.title) {
    mergedResult.title = 'Work Instructions';
  }

  // Deduplicate prerequisites arrays (keep as strings)
  mergedResult.prerequisites.tools = [...new Set(mergedResult.prerequisites.tools)];
  mergedResult.prerequisites.materials = [...new Set(mergedResult.prerequisites.materials)];
  mergedResult.prerequisites.safety = [...new Set(mergedResult.prerequisites.safety)];
  
  // Deduplicate safety warnings and completion checklist (keep source info)
  // Deduplicate by text, but keep first occurrence with its source
  const seenWarnings = new Map();
  mergedResult.safetyWarnings = mergedResult.safetyWarnings.filter(warning => {
    const text = typeof warning === 'string' ? warning : warning.text || warning;
    if (!seenWarnings.has(text)) {
      seenWarnings.set(text, true);
      return true;
    }
    return false;
  });
  
  const seenChecklist = new Map();
  mergedResult.completionChecklist = mergedResult.completionChecklist.filter(item => {
    const text = typeof item === 'string' ? item : item.text || item;
    if (!seenChecklist.has(text)) {
      seenChecklist.set(text, true);
      return true;
    }
    return false;
  });

  logger.info(`Chunked work instructions generation complete: ${mergedResult.steps.length} steps from ${totalChunks} chunks`);
  return mergedResult;
};

/**
 * Generate AI content from documents
 * @param {Object} params - Generation parameters
 * @param {string} params.useCase - Use case type ('checksheet' or 'workInstructions')
 * @param {Array<string>} params.documentIds - Array of document UUIDs
 * @param {string} [params.queryText] - Optional query text for better relevance
 * @param {string} [params.llmProvider] - LLM provider ('bedrock' or 'gemini'), defaults to 'gemini'
 * @param {string} [params.promptId] - Specific prompt ID to use, defaults to active prompt
 * @param {Function} [params.onProgress] - Optional progress callback function
 * @returns {Promise<Object>} Generated content and metadata
 */
export const handleGenerate = async ({ useCase, documentIds, queryText, llmProvider = 'gemini', promptId = null, onProgress = null }) => {
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
  const vectorDb = process.env.VECTOR_DB || 'chromadb';
  // Limit chunks to prevent context overflow - reduce context to allow more room for response
  // Lower context = more tokens available for response generation
  // Reduced context size to allow for smaller chunks and prevent token limit errors
  const maxContextChars = parseInt(process.env.MAX_CONTEXT_CHARS) || 4000;
  const topK = 10; // Number of results to return

  let relevantChunks;
  if (useLangchain) {
    // Use Langchain for similarity search
    logger.info('Querying via Langchain for relevant chunks...');
    const langchainService = (await import('../services/langchainService.js')).default;
    const query = queryText || 'document content'; // Langchain needs a query string
    const results = await langchainService.similaritySearch(query, documentIds, topK);
    relevantChunks = results.map(result => ({
      id: result.id,
      text: result.text,
      metadata: result.metadata,
      score: result.score
    }));
  } else if (vectorDb.toLowerCase() === 'pinecone') {
    // Use native Pinecone service
    logger.info('Querying Pinecone for relevant chunks...');
    relevantChunks = await pineconeService.queryByDocumentIds(
      documentIds,
      queryEmbedding,
      topK
    );
  } else {
    // Use native ChromaDB service (default)
    logger.info('Querying ChromaDB for relevant chunks...');
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

  // Diagnostic: Log sample chunks to verify page metadata is present
  if (relevantChunks.length > 0) {
    const sampleChunks = [relevantChunks[0], relevantChunks[Math.floor(relevantChunks.length / 2)], relevantChunks[relevantChunks.length - 1]].filter(Boolean);
    logger.info('Sample retrieved chunks with metadata (diagnostic)', {
      samples: sampleChunks.map(c => ({
        id: c.id,
        hasMetadata: !!c.metadata,
        fileName: c.metadata?.fileName,
        pageNumber: c.metadata?.pageNumber,
        pageRange: c.metadata?.pageRange,
        chunkIndex: c.metadata?.chunkIndex,
        metadataKeys: c.metadata ? Object.keys(c.metadata) : []
      }))
    });
  }

  // Step 3: Build context from chunks with size limit and track sources with position mapping
  logger.info('Building context from chunks with source tracking...');
  let context = '';
  let chunksUsed = 0;
  const sourceReferences = new Map(); // Track unique sources
  const chunkPositionMap = []; // Map: [{ startChar, endChar, chunk }]

  // Build context incrementally, stopping when we reach max size
  for (const chunk of relevantChunks) {
    const text = (chunk.text || chunk.metadata?.text || '').trim();
    if (text.length === 0) continue;

    const chunkStartChar = context.length;
    const chunkWithSeparator = context ? `\n\n${text}` : text;
    const potentialContext = context + chunkWithSeparator;

    // If adding this chunk would exceed limit, stop here
    if (potentialContext.length > maxContextChars) {
      logger.info(`Context size limit reached (${maxContextChars} chars), using ${chunksUsed} chunks`);
      break;
    }

    context = potentialContext;
    const chunkEndChar = context.length;
    
    // Map this chunk's position in the merged context
    chunkPositionMap.push({
      startChar: chunkStartChar,
      endChar: chunkEndChar,
      chunk: chunk // Store reference to original chunk with metadata
    });

    // Diagnostic: Log if this chunk is missing page number
    if (!chunk.metadata?.pageNumber) {
      logger.warn(`Chunk ${chunksUsed + 1} missing pageNumber in metadata`, {
        chunkId: chunk.id,
        hasMetadata: !!chunk.metadata,
        metadataKeys: chunk.metadata ? Object.keys(chunk.metadata) : [],
        fileName: chunk.metadata?.fileName
      });
    }

    chunksUsed++;
    
    // Track source references for citations
    const fileName = chunk.metadata?.fileName || chunk.metadata?.originalFileName || 'Unknown Document';
    // Prefer displayPageNumber (internal page number) over pageNumber (PDF index)
    const pageNumber = chunk.metadata?.displayPageNumber || chunk.metadata?.pageNumber || null;
    const pageRange = chunk.metadata?.pageRange || null;
    
    const sourceKey = `${fileName}`;
    if (!sourceReferences.has(sourceKey)) {
      sourceReferences.set(sourceKey, {
        fileName,
        pages: new Set()
      });
    }
    
    // Add page numbers to this source
    if (pageNumber) {
      sourceReferences.get(sourceKey).pages.add(pageNumber);
    }
    
    logger.debug(`Added chunk to context`, {
      fileName,
      pageNumber,
      chunkStartChar,
      chunkEndChar,
      textLength: text.length
    });
  }

  if (context.length === 0) {
    throw new Error('No valid text content found in retrieved chunks');
  }

  // Diagnostic: Summary of page number tracking
  const chunksWithPageNumbers = chunkPositionMap.filter(m => m.chunk.metadata?.pageNumber).length;
  logger.info('Context building complete - page tracking summary', {
    totalChunks: chunksUsed,
    chunksWithPageNumbers,
    chunksWithoutPageNumbers: chunksUsed - chunksWithPageNumbers,
    pageTrackingPercentage: Math.round((chunksWithPageNumbers / chunksUsed) * 100) + '%'
  });

  if (chunksWithPageNumbers === 0) {
    logger.error('⚠️ CRITICAL: No chunks have page numbers! Documents may need to be re-ingested with the updated code.');
  }

  // Build citation text
  const citations = Array.from(sourceReferences.entries()).map(([key, value]) => {
    const pages = Array.from(value.pages).sort((a, b) => a - b);
    if (pages.length > 0) {
      const pageText = pages.length > 3 
        ? `Pages ${pages.slice(0, 3).join(', ')}...` 
        : `Page${pages.length > 1 ? 's' : ''} ${pages.join(', ')}`;
      return `${value.fileName} (${pageText})`;
    }
    return value.fileName;
  });

  logger.info(`Context built: ${context.length} characters from ${chunksUsed} of ${relevantChunks.length} chunks from ${citations.length} source(s)`, {
    sources: citations
  });

  // Step 4: Get prompt template based on use case from prompt library
  // Use promptId parameter to select specific prompt from library
  logger.info(`Getting prompt template for use case: ${useCase}${promptId ? `, promptId: ${promptId}` : ' (using active prompt)'}`);
  let promptConfig;

  try {
    // Load from prompt library service (supports multiple prompts per use case)
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
  // Use chunked generation (7+ requests) to avoid token limit errors
  // More chunks = smaller responses per chunk = less likely to exceed token limit
  logger.info(`Invoking ${llmProvider} with chunked generation...`);
  let parsedData;

  // Split context into many small chunks (15+ chunks, ~300 chars each)
  // More chunks = smaller responses = less chance of exceeding token limit
  // Pass chunk position map to preserve lineage
  const contextSize = context.length;
  const targetChunkSize = 300; // Very small chunks (~300 chars each)
  const contextChunks = splitContextIntoChunks(context, chunkPositionMap, targetChunkSize);
  logger.info(`Using ${contextChunks.length} chunks for generation (context size: ${contextSize} chars, target: ~${targetChunkSize} chars per chunk, from ${chunksUsed} source chunks)`);

  // Use chunked generation for both checksheet and work instructions
  let generationMetadata = {};
  if (useCase === 'checksheet') {
    const result = await generateChecksheetChunked(contextChunks, promptConfig, llmProvider, onProgress);
    parsedData = result.items || result; // Handle both old and new format
    generationMetadata = result.metadata || {};
  } else if (useCase === 'workInstructions') {
    parsedData = await generateWorkInstructionsChunked(contextChunks, promptConfig, llmProvider, onProgress);
  } else {
    throw new Error(`Invalid use case: ${useCase}`);
  }

  // Log detailed response info
  logger.info('AI response received and parsed successfully', {
    llmProvider,
    dataType: Array.isArray(parsedData) ? 'array' : 'object',
    dataKeys: Array.isArray(parsedData) ? `array[${parsedData.length}]` : Object.keys(parsedData).join(', ')
  });

  // Validate content based on use case
  if (useCase === 'workInstructions') {
    logger.info('Validating work instructions content', {
      hasTitle: !!parsedData.title,
      hasOverview: !!parsedData.overview,
      hasPrerequisites: !!parsedData.prerequisites,
      hasSteps: !!(parsedData.steps && parsedData.steps.length > 0),
      hasSafetyWarnings: !!(parsedData.safetyWarnings && parsedData.safetyWarnings.length > 0),
      hasCompletionChecklist: !!(parsedData.completionChecklist && parsedData.completionChecklist.length > 0)
    });

    // Check if there's ANY content
    const hasContent =
      parsedData.title ||
      parsedData.overview ||
      (parsedData.prerequisites && (
        Array.isArray(parsedData.prerequisites) ? parsedData.prerequisites.length > 0 :
          (parsedData.prerequisites.tools?.length > 0 ||
            parsedData.prerequisites.materials?.length > 0 ||
            parsedData.prerequisites.safety?.length > 0)
      )) ||
      (parsedData.steps && parsedData.steps.length > 0) ||
      (parsedData.safetyWarnings && parsedData.safetyWarnings.length > 0) ||
      (parsedData.completionChecklist && parsedData.completionChecklist.length > 0);

    if (!hasContent) {
      logger.error('AI returned empty work instructions', {
        parsedDataSample: JSON.stringify(parsedData).substring(0, 500)
      });
      throw new Error('AI returned empty work instructions. The documents may not contain relevant procedural information. Try uploading documents with step-by-step procedures, or select a different prompt style.');
    }

    // Add a default title if missing but other content exists
    if (!parsedData.title && hasContent) {
      parsedData.title = 'Work Instructions';
      logger.info('Added default title to work instructions');
    }
  }

  if (useCase === 'checksheet') {
    const items = Array.isArray(parsedData) ? parsedData : (parsedData.items || parsedData.data || []);
    logger.info('Validating checksheet content', {
      itemCount: items.length
    });

    if (!items || items.length === 0) {
      logger.error('AI returned empty checksheet', {
        parsedDataSample: JSON.stringify(parsedData).substring(0, 500)
      });
      throw new Error('AI returned empty checksheet. The documents may not contain inspection or maintenance information. Try uploading maintenance manuals or inspection guides, or select a different prompt style.');
    }
  }

  const processingTime = ((Date.now() - startTime) / 1000).toFixed(2);

  logger.info('Content validation passed', { useCase, processingTime: `${processingTime}s` });

  return {
    useCase,
    documentIds,
    llmProvider,
    data: parsedData,
    chunksUsed: relevantChunks.length,
    contextLength: context.length,
    status: 'success',
    message: `${useCase} generated successfully using ${llmProvider}`,
    processingTime: `${processingTime}s`,
    metadata: {
      sources: citations,
      citationText: citations.length > 0 ? `\n\nSource References:\n${citations.map((c, i) => `${i + 1}. ${c}`).join('\n')}` : '',
      ...generationMetadata
    }
  };
};

