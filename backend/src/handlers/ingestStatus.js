/**
 * Ingest Status Handler
 * Checks the processing status of a document ingestion using DynamoDB
 * Endpoint: GET /api/ingest-status/{fileId}
 *
 * Best Practices:
 * - Fast status check using DynamoDB (< 100ms response time)
 * - Real-time progress tracking with percentage and current step
 * - Fallback to vector database (Pinecone/ChromaDB) if DynamoDB status not found
 */

import ingestionStatusService from '../services/ingestionStatusService.js';
import chromaService from '../services/chromaService.js';
import pineconeService from '../services/pineconeService.js';
import { createSuccessResponse, createErrorResponse } from '../utils/errorHandler.js';
import { logger } from '../utils/logger.js';
import { wrapHandler } from '../utils/handlerWrapper.js';

/**
 * Lambda handler for checking ingestion status
 * @param {Object} event - API Gateway event
 * @param {Object} context - Lambda context
 * @returns {Promise<Object>} Response object
 */
const ingestStatusHandler = async (event, context) => {
  logger.info('Ingest status handler invoked', {
    method: event.httpMethod,
    path: event.path
  });

  try {
    // Check HTTP method
    if (event.httpMethod !== 'GET') {
      return createErrorResponse(405, 'Method not allowed. Use GET.');
    }

    // Extract fileId from path parameters or path
    const fileId = event.pathParameters?.fileId || 
                   event.path?.split('/').pop() ||
                   event.queryStringParameters?.fileId;
    
    if (!fileId) {
      return createErrorResponse(400, 'Missing fileId. Provide fileId in path or query parameter.');
    }

    logger.info(`Checking ingestion status for file: ${fileId}`);

    // First, check DynamoDB for real-time status
    let statusRecord = null;
    try {
      statusRecord = await ingestionStatusService.getStatus(fileId);
    } catch (statusError) {
      logger.warn('Failed to get status from DynamoDB', { fileId, error: statusError.message });
    }

    // If status found in DynamoDB, return it
    if (statusRecord) {
      const responseData = {
        fileId: statusRecord.fileId,
        status: statusRecord.status,
        progress: statusRecord.progress || 0,
        currentStep: statusRecord.currentStep,
        message: statusRecord.message,
        totalChunks: statusRecord.totalChunks || 0,
        processedChunks: statusRecord.processedChunks || 0,
        createdAt: statusRecord.createdAt,
        updatedAt: statusRecord.updatedAt,
        ...(statusRecord.elapsedTime !== undefined && { elapsedTime: statusRecord.elapsedTime }),
        ...(statusRecord.estimatedTimeRemaining !== undefined && { estimatedTimeRemaining: statusRecord.estimatedTimeRemaining }),
        ...(statusRecord.estimatedTotalTime !== undefined && { estimatedTotalTime: statusRecord.estimatedTotalTime }),
        ...(statusRecord.completedAt && { completedAt: statusRecord.completedAt }),
        ...(statusRecord.failedAt && { failedAt: statusRecord.failedAt }),
        ...(statusRecord.error && { error: statusRecord.error })
      };

      logger.info('Ingest status from DynamoDB', {
        fileId,
        status: statusRecord.status,
        progress: statusRecord.progress
      });

      return createSuccessResponse(responseData, 200);
    }

    // Fallback: Check vector database (for backward compatibility)
    const useLangchain = process.env.USE_LANGCHAIN === 'true';
    const vectorDb = process.env.VECTOR_DB || 'chromadb';
    
    logger.info(`Status not in DynamoDB, checking ${useLangchain ? 'Langchain' : vectorDb}...`, { fileId });

    let status = 'not_found';
    let chunksCount = 0;
    let metadata = null;
    let error = null;

    try {
      if (useLangchain) {
        // Check via Langchain
        const langchainService = (await import('../services/langchainService.js')).default;
        const results = await langchainService.queryByMetadata({ fileId }, 1);

        if (results && results.length > 0) {
          status = 'completed';
          chunksCount = results[0].metadata?.chunksProcessed || results.length;
          metadata = {
            chunksProcessed: chunksCount,
            processingTime: results[0].metadata?.processingTime,
            averageChunkSize: results[0].metadata?.averageChunkSize,
            totalTextLength: results[0].metadata?.totalTextLength
          };
        }
      } else if (vectorDb.toLowerCase() === 'pinecone') {
        // Check via Pinecone - query by metadata filter
        try {
          // Query with a dummy vector and filter by fileId
          const dummyVector = new Array(1024).fill(0);
          const results = await pineconeService.queryVectors(
            dummyVector,
            1,
            { fileId: { $eq: fileId } }
          );

          if (results.matches && results.matches.length > 0) {
            // Document exists, query for all chunks to get count
            const allResults = await pineconeService.queryVectors(
              dummyVector,
              1000, // Large limit to get all chunks
              { fileId: { $eq: fileId } }
            );

            chunksCount = allResults.matches?.length || 0;

            // Extract metadata from first chunk
            if (allResults.matches && allResults.matches.length > 0) {
              const firstMatch = allResults.matches[0];
              metadata = {
                chunksProcessed: chunksCount,
                processingTime: firstMatch.metadata?.processingTime,
                averageChunkSize: firstMatch.metadata?.averageChunkSize,
                totalTextLength: firstMatch.metadata?.totalTextLength,
                fileName: firstMatch.metadata?.fileName,
                numPages: firstMatch.metadata?.numPages
              };
            }

            status = 'completed';
          }
        } catch (pineconeError) {
          logger.warn('Error checking Pinecone status', { fileId, error: pineconeError.message });
          throw pineconeError;
        }
      } else {
        // Check via ChromaDB - query by metadata filter
        const collection = await chromaService.connect();

        // Use get() with where clause to check if document exists
        const results = await collection.get({
          where: { fileId },
          limit: 1
        });

        if (results.ids && results.ids.length > 0) {
          // Document exists, get full count
          const allResults = await collection.get({
            where: { fileId }
          });

          chunksCount = allResults.ids?.length || 0;

          // Extract metadata from first chunk
          if (allResults.metadatas && allResults.metadatas.length > 0) {
            const firstMetadata = allResults.metadatas[0];
            metadata = {
              chunksProcessed: chunksCount,
              processingTime: firstMetadata.processingTime,
              averageChunkSize: firstMetadata.averageChunkSize,
              totalTextLength: firstMetadata.totalTextLength,
              fileName: firstMetadata.fileName,
              numPages: firstMetadata.numPages
            };
          }

          status = 'completed';
        }
      }
    } catch (dbError) {
      logger.warn(`Error checking ${vectorDb} status`, { fileId, error: dbError.message });
      status = 'unknown';
      error = 'Unable to check status from database.';
    }

    const responseData = {
      fileId,
      status,
      progress: status === 'completed' ? 100 : 0,
      currentStep: status === 'completed' ? 'completed' : 'unknown',
      chunksProcessed: chunksCount,
      message: status === 'completed' ? 'Document ingested successfully' : 'Status not available',
      ...(metadata && { metadata }),
      ...(error && { warning: error })
    };

    logger.info('Ingest status check completed', {
      fileId,
      status,
      chunksCount
    });

    return createSuccessResponse(responseData, 200);

  } catch (error) {
    logger.error('Ingest status handler error', error);
    return createErrorResponse(500, 'Failed to check ingestion status', error);
  }
};

// Export wrapped handler to ensure all errors are caught and CORS headers are always included
export const handler = wrapHandler(ingestStatusHandler);

