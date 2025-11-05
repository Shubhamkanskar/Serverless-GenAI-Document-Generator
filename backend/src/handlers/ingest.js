/**
 * Ingest Handler
 * Processes uploaded documents, extracts text, generates embeddings, and stores in ChromaDB
 * Endpoint: POST /api/ingest
 */

import pdfService from '../services/pdfService.js';
import embeddingService from '../services/embeddingService.js';
import chromaService from '../services/chromaService.js';
import { createSuccessResponse, createErrorResponse, handleAwsError } from '../utils/errorHandler.js';
import { validateIngestRequest } from '../utils/validators.js';
import { logger } from '../utils/logger.js';
import { wrapHandler } from '../utils/handlerWrapper.js';

/**
 * Lambda handler for document ingestion
 * @param {Object} event - API Gateway event
 * @param {Object} context - Lambda context
 * @returns {Promise<Object>} Response object
 */
const ingestHandler = async (event, context) => {
  logger.info('Ingest handler invoked', {
    method: event.httpMethod,
    path: event.path
  });

  try {
    // Check HTTP method
    if (event.httpMethod !== 'POST') {
      return createErrorResponse(405, 'Method not allowed. Use POST.');
    }

    // Parse request body
    let requestBody;
    try {
      requestBody = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
    } catch (parseError) {
      logger.error('Failed to parse request body', parseError);
      return createErrorResponse(400, 'Invalid JSON in request body');
    }

    const { fileId, s3Key } = requestBody;

    // Validate input
    try {
      validateIngestRequest({ fileId, s3Key });
    } catch (validationError) {
      logger.warn('Request validation failed', { error: validationError.message });
      return createErrorResponse(400, validationError.message);
    }

    logger.info(`Starting ingestion for file: ${fileId}`, { s3Key });

    const startTime = Date.now();
    const documentsBucket = process.env.S3_DOCUMENTS_BUCKET || process.env.DOCUMENTS_BUCKET;

    // Step 1: Extract text from PDF and chunk it
    logger.info('Step 1: Extracting text from PDF...');
    let chunks;
    try {
      const extractedData = await pdfService.extractTextFromS3(
        s3Key,
        documentsBucket,
        { fileId, fileName: s3Key.split('/').pop() }
      );

      logger.info(`Extracted text length: ${extractedData.text.length} characters`, {
        pages: extractedData.metadata.numPages
      });

      // Step 2: Split into chunks
      logger.info('Step 2: Splitting text into chunks...');
      chunks = pdfService.splitText(extractedData.text, {
        fileId,
        fileName: extractedData.metadata.fileName || s3Key.split('/').pop(),
        numPages: extractedData.metadata.numPages,
        s3Key,
        extractedAt: extractedData.metadata.extractedAt
      });

      logger.info(`Created ${chunks.length} chunks`);
    } catch (pdfError) {
      logger.error('PDF extraction or chunking failed', pdfError);
      return createErrorResponse(500, `Failed to process PDF: ${pdfError.message}`, pdfError);
    }

    // Step 3: Generate embeddings
    logger.info('Step 3: Generating embeddings...');
    let chunksWithEmbeddings;
    try {
      chunksWithEmbeddings = await embeddingService.generateEmbeddingsForChunks(chunks);
      logger.info(`Generated ${chunksWithEmbeddings.length} embeddings`);
    } catch (embeddingError) {
      logger.error('Embedding generation failed', embeddingError);
      return createErrorResponse(500, `Failed to generate embeddings: ${embeddingError.message}`, embeddingError);
    }

    // Step 4: Store in vector database (ChromaDB or via Langchain)
    const useLangchain = process.env.USE_LANGCHAIN === 'true';
    logger.info(`Step 4: Storing vectors ${useLangchain ? 'via Langchain' : 'in ChromaDB'}...`);

    try {
      if (useLangchain) {
        // Use Langchain for vector storage
        const langchainService = (await import('../services/langchainService.js')).default;
        await langchainService.addDocuments(chunksWithEmbeddings, fileId);
        logger.info(`Stored ${chunksWithEmbeddings.length} vectors via Langchain`);
      } else {
        // Use native ChromaDB service (existing implementation)
        const embeddings = chunksWithEmbeddings.map(chunk => chunk.embedding);
        await chromaService.upsertChunksWithEmbeddings(
          chunksWithEmbeddings,
          embeddings,
          fileId
        );
        logger.info(`Stored ${chunksWithEmbeddings.length} vectors in ChromaDB`);
      }
    } catch (storageError) {
      logger.error('Vector storage failed', storageError);
      return createErrorResponse(500, `Failed to store vectors: ${storageError.message}`, storageError);
    }

    const processingTime = ((Date.now() - startTime) / 1000).toFixed(2);

    // Prepare response
    const responseData = {
      fileId,
      s3Key,
      chunksProcessed: chunks.length,
      status: 'success',
      message: 'Document ingested successfully',
      processingTime: `${processingTime}s`,
      metadata: {
        averageChunkSize: Math.round(chunks.reduce((sum, c) => sum + c.text.length, 0) / chunks.length),
        totalTextLength: chunks.reduce((sum, c) => sum + c.text.length, 0)
      }
    };

    logger.info('Document ingestion completed successfully', {
      fileId,
      chunksProcessed: chunks.length,
      processingTime
    });

    return createSuccessResponse(responseData, 200);

  } catch (error) {
    logger.error('Ingest handler error', error);
    return createErrorResponse(500, 'Document ingestion failed', error);
  }
};

// Export wrapped handler to ensure all errors are caught and CORS headers are always included
export const handler = wrapHandler(ingestHandler);
