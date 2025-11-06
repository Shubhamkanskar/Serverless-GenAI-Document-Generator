/**
 * Ingest Handler
 * Processes uploaded documents, extracts text, generates embeddings, and stores in vector database (Pinecone/ChromaDB)
 * Endpoint: POST /api/ingest
 * 
 * This handler uses async processing to avoid API Gateway 29-second timeout:
 * - When called via API Gateway, it invokes itself asynchronously and returns immediately
 * - The async invocation performs the actual processing
 */

import pdfService from '../services/pdfService.js';
import embeddingService from '../services/embeddingService.js';
import chromaService from '../services/chromaService.js';
import pineconeService from '../services/pineconeService.js';
import ingestionStatusService from '../services/ingestionStatusService.js';
import { createSuccessResponse, createErrorResponse, handleAwsError } from '../utils/errorHandler.js';
import { validateIngestRequest } from '../utils/validators.js';
import { logger } from '../utils/logger.js';
import { wrapHandler } from '../utils/handlerWrapper.js';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';

/**
 * Checks if the event is from API Gateway (synchronous HTTP request)
 * @param {Object} event - Lambda event
 * @returns {boolean} True if from API Gateway
 */
const isApiGatewayEvent = (event) => {
  return event && (event.httpMethod || event.requestContext);
};

/**
 * Processes the document ingestion (actual work)
 * @param {string} fileId - File ID
 * @param {string} s3Key - S3 key
 * @returns {Promise<Object>} Processing result
 */
const processIngestion = async (fileId, s3Key) => {
  const startTime = Date.now();
  const documentsBucket = process.env.S3_DOCUMENTS_BUCKET || process.env.DOCUMENTS_BUCKET;

  try {
    // Update status to processing
    await ingestionStatusService.updateStatus(fileId, {
      status: 'processing',
      currentStep: 'extracting_text',
      progress: 10,
      message: 'Extracting text from PDF...'
    });

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

      // Update progress
      await ingestionStatusService.updateStatus(fileId, {
        currentStep: 'chunking_text',
        progress: 25,
        message: `Extracted ${extractedData.metadata.numPages} pages, splitting into chunks...`
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

      // Update progress with chunk count
      await ingestionStatusService.updateStatus(fileId, {
        currentStep: 'generating_embeddings',
        progress: 35,
        totalChunks: chunks.length,
        processedChunks: 0,
        message: `Created ${chunks.length} chunks, generating embeddings...`
      });
    } catch (pdfError) {
      logger.error('PDF extraction or chunking failed', pdfError);
      await ingestionStatusService.markFailed(fileId, `Failed to process PDF: ${pdfError.message}`, 'extracting_text');
      throw new Error(`Failed to process PDF: ${pdfError.message}`);
    }

    // Step 3: Generate embeddings
    logger.info('Step 3: Generating embeddings...');
    let chunksWithEmbeddings;
    try {
      chunksWithEmbeddings = await embeddingService.generateEmbeddingsForChunks(chunks);
      logger.info(`Generated ${chunksWithEmbeddings.length} embeddings`);

      // Update progress
      await ingestionStatusService.updateStatus(fileId, {
        currentStep: 'storing_vectors',
        progress: 70,
        processedChunks: chunks.length,
        message: `Generated ${chunksWithEmbeddings.length} embeddings, storing in vector database...`
      });
    } catch (embeddingError) {
      logger.error('Embedding generation failed', embeddingError);
      await ingestionStatusService.markFailed(fileId, `Failed to generate embeddings: ${embeddingError.message}`, 'generating_embeddings');
      throw new Error(`Failed to generate embeddings: ${embeddingError.message}`);
    }

    // Step 4: Store in vector database (Pinecone, ChromaDB, or via Langchain)
    const useLangchain = process.env.USE_LANGCHAIN === 'true';
    const vectorDb = process.env.VECTOR_DB || 'chromadb';
    
    try {
      if (useLangchain) {
        // Use Langchain for vector storage
        logger.info('Step 4: Storing vectors via Langchain...');
        const langchainService = (await import('../services/langchainService.js')).default;
        await langchainService.addDocuments(chunksWithEmbeddings, fileId);
        logger.info(`Stored ${chunksWithEmbeddings.length} vectors via Langchain`);
      } else if (vectorDb.toLowerCase() === 'pinecone') {
        // Use native Pinecone service
        logger.info('Step 4: Storing vectors in Pinecone...');
        const embeddings = chunksWithEmbeddings.map(chunk => chunk.embedding);
        await pineconeService.upsertChunksWithEmbeddings(
          chunksWithEmbeddings,
          embeddings,
          fileId
        );
        logger.info(`Stored ${chunksWithEmbeddings.length} vectors in Pinecone`);
      } else {
        // Use native ChromaDB service (default)
        logger.info('Step 4: Storing vectors in ChromaDB...');
        const embeddings = chunksWithEmbeddings.map(chunk => chunk.embedding);
        await chromaService.upsertChunksWithEmbeddings(
          chunksWithEmbeddings,
          embeddings,
          fileId
        );
        logger.info(`Stored ${chunksWithEmbeddings.length} vectors in ChromaDB`);
      }

      // Update progress
      await ingestionStatusService.updateStatus(fileId, {
        currentStep: 'finalizing',
        progress: 95,
        message: 'Finalizing ingestion...'
      });
    } catch (storageError) {
      logger.error('Vector storage failed', storageError);
      await ingestionStatusService.markFailed(fileId, `Failed to store vectors: ${storageError.message}`, 'storing_vectors');
      throw new Error(`Failed to store vectors: ${storageError.message}`);
    }

    const processingTime = ((Date.now() - startTime) / 1000).toFixed(2);

    const result = {
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

    // Mark as completed
    await ingestionStatusService.markCompleted(fileId, {
      chunksProcessed: chunks.length,
      processingTime: `${processingTime}s`
    });

    return result;
  } catch (error) {
    // Make sure we mark as failed if not already done
    try {
      const status = await ingestionStatusService.getStatus(fileId);
      if (status && status.status !== 'failed') {
        await ingestionStatusService.markFailed(fileId, error.message, status.currentStep || 'unknown');
      }
    } catch (statusError) {
      logger.error('Failed to update status on error', statusError);
    }
    throw error;
  }
};

/**
 * Lambda handler for document ingestion
 * @param {Object} event - API Gateway event or Lambda invocation event
 * @param {Object} context - Lambda context
 * @returns {Promise<Object>} Response object
 */
const ingestHandler = async (event, context) => {
  logger.info('Ingest handler invoked', {
    method: event.httpMethod,
    path: event.path,
    isApiGateway: isApiGatewayEvent(event)
  });

  try {
    // Handle async invocation (when processing in background)
    if (!isApiGatewayEvent(event)) {
      // This is an async invocation - do the actual processing
      // Lambda may pass the event directly or wrapped, handle both cases
      let eventData = event;
      
      // If event is a string (unparsed JSON), parse it
      if (typeof event === 'string') {
        try {
          eventData = JSON.parse(event);
        } catch (parseError) {
          logger.error('Failed to parse async event as JSON', { event, error: parseError });
          throw new Error('Invalid async event format');
        }
      }
      
      // Handle cases where event might be wrapped in a body or Records array
      const fileId = eventData.fileId || eventData?.body?.fileId || (eventData?.Records?.[0]?.body && JSON.parse(eventData.Records[0].body)?.fileId);
      const s3Key = eventData.s3Key || eventData?.body?.s3Key || (eventData?.Records?.[0]?.body && JSON.parse(eventData.Records[0].body)?.s3Key);
      
      if (!fileId || !s3Key) {
        logger.error('Invalid async invocation event', { event, eventData });
        throw new Error('Missing fileId or s3Key in async event');
      }

      logger.info(`Async processing started for file: ${fileId}`, { s3Key });
      
      try {
        const result = await processIngestion(fileId, s3Key);
        logger.info('Document ingestion completed successfully', {
          fileId,
          chunksProcessed: result.chunksProcessed,
          processingTime: result.processingTime
        });
        return result;
      } catch (processingError) {
        logger.error('Async processing failed', { fileId, s3Key, error: processingError });
        throw processingError;
      }
    }

    // Handle API Gateway request - invoke asynchronously and return immediately
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

    logger.info(`Queuing ingestion for file: ${fileId}`, { s3Key });

    // Create initial status record
    try {
      await ingestionStatusService.createStatus(fileId, s3Key, {
        fileName: s3Key.split('/').pop()
      });
    } catch (statusError) {
      logger.error('Failed to create initial status', statusError);
      // Continue anyway - status tracking is not critical
    }

    // Invoke Lambda asynchronously to process the ingestion
    try {
      const lambdaClient = new LambdaClient({ region: process.env.AWS_REGION || 'us-east-1' });
      
      // Get function name from context or environment variable
      // AWS_LAMBDA_FUNCTION_NAME is set by Lambda runtime
      const functionName = context?.functionName || 
                          context?.invokedFunctionArn?.split(':').slice(-1)[0] ||
                          process.env.AWS_LAMBDA_FUNCTION_NAME ||
                          `${process.env.SERVERLESS_SERVICE || 'genai-doc-generator'}-${process.env.SERVERLESS_STAGE || 'dev'}-ingest`;
      
      logger.info(`Invoking async processing for function: ${functionName}`);
      
      const invokeCommand = new InvokeCommand({
        FunctionName: functionName,
        InvocationType: 'Event', // Async invocation
        Payload: JSON.stringify({ fileId, s3Key })
      });

      await lambdaClient.send(invokeCommand);
      
      logger.info('Async ingestion queued successfully', { fileId, s3Key });

      // Return immediately with processing status
      return createSuccessResponse({
        fileId,
        s3Key,
        status: 'processing',
        message: 'Document ingestion queued. Processing will continue in the background.',
        chunksProcessed: 0
      }, 202); // 202 Accepted for async operations

    } catch (invokeError) {
      logger.error('Failed to invoke async processing', invokeError);
      // Fallback: try synchronous processing if async invocation fails
      logger.warn('Falling back to synchronous processing', { fileId, s3Key });
      
      try {
        const result = await processIngestion(fileId, s3Key);
        logger.info('Synchronous processing completed', {
          fileId,
          chunksProcessed: result.chunksProcessed,
          processingTime: result.processingTime
        });
        return createSuccessResponse(result, 200);
      } catch (processingError) {
        logger.error('Synchronous processing also failed', processingError);
        return createErrorResponse(500, `Failed to process document: ${processingError.message}`, processingError);
      }
    }

  } catch (error) {
    logger.error('Ingest handler error', error);
    // If this is an async invocation, we can't return an HTTP response
    if (!isApiGatewayEvent(event)) {
      // Try to extract fileId/s3Key for logging
      let fileId, s3Key;
      try {
        const eventData = typeof event === 'string' ? JSON.parse(event) : event;
        fileId = eventData?.fileId || eventData?.body?.fileId;
        s3Key = eventData?.s3Key || eventData?.body?.s3Key;
      } catch (parseError) {
        // Ignore parse errors in error handler
      }
      logger.error('Async processing failed', { fileId, s3Key, error });
      throw error; // Re-throw for Lambda error handling
    }
    return createErrorResponse(500, 'Document ingestion failed', error);
  }
};

// Export wrapped handler to ensure all errors are caught and CORS headers are always included
export const handler = wrapHandler(ingestHandler);
