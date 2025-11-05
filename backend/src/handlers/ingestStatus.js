/**
 * Ingest Status Handler
 * Checks the processing status of a document ingestion by querying ChromaDB
 * Endpoint: GET /api/ingest-status/{fileId}
 * 
 * Best Practices:
 * - Lightweight status check by querying vector database
 * - No additional storage needed (uses existing ChromaDB)
 * - Fast response time (< 1 second)
 */

import chromaService from '../services/chromaService.js';
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

    // Check if document exists in ChromaDB (means processing completed)
    const useLangchain = process.env.USE_LANGCHAIN === 'true';
    let status = 'processing';
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
      } else {
        // Check via ChromaDB - query by metadata filter
        const collection = await chromaService.connect();
        
        // Use get() with where clause to check if document exists
        // This is faster than query() as it doesn't need embeddings
        const results = await collection.get({
          where: { fileId },
          limit: 1 // Only need to check existence, limit to 1 for performance
        });

        if (results.ids && results.ids.length > 0) {
          // Document exists, get full count
          const allResults = await collection.get({
            where: { fileId }
          });
          
          chunksCount = allResults.ids?.length || 0;
          
          // Extract metadata from first chunk (all chunks have same file metadata)
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
      logger.warn('Error checking ChromaDB status', { fileId, error: dbError.message });
      // If we can't check, assume still processing (not an error state)
      // This prevents false negatives during processing
      status = 'processing';
      error = 'Unable to check status. Processing may still be in progress.';
    }

    const responseData = {
      fileId,
      status,
      chunksProcessed: chunksCount,
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

