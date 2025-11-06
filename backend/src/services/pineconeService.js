import { Pinecone } from '@pinecone-database/pinecone';
import { logger } from '../utils/logger.js';

/**
 * Pinecone Service
 * Handles connection, vector operations, and error handling for Pinecone vector database
 */
class PineconeService {
  constructor() {
    this.apiKey = process.env.PINECONE_API_KEY;
    this.indexName = process.env.PINECONE_INDEX_NAME || 'genaidoc';
    this.environment = process.env.PINECONE_ENVIRONMENT || 'us-east-1-aws';
    this.client = null;
    this.index = null;
    this.isConnected = false;
  }

  /**
   * Validate API key before connection
   */
  validateApiKey() {
    if (!this.apiKey) {
      throw new Error('PINECONE_API_KEY environment variable is not set');
    }
    if (typeof this.apiKey !== 'string' || this.apiKey.length === 0) {
      throw new Error('PINECONE_API_KEY is invalid');
    }
  }

  /**
   * List all available indexes
   * @returns {Promise<Array>} List of index names
   */
  async listIndexes() {
    try {
      if (!this.client) {
        this.validateApiKey();
        this.client = new Pinecone({
          apiKey: this.apiKey,
        });
      }
      const indexes = await this.client.listIndexes();
      return indexes.indexes?.map(idx => idx.name) || [];
    } catch (error) {
      throw new Error(`Failed to list indexes: ${error.message}`);
    }
  }

  /**
   * Connect to Pinecone and initialize index
   * @returns {Promise<void>}
   */
  async connect() {
    try {
      // Validate API key
      this.validateApiKey();

      // Initialize Pinecone client
      this.client = new Pinecone({
        apiKey: this.apiKey,
      });

      // Get index reference
      this.index = this.client.index(this.indexName);
      
      // Test connection by describing index
      try {
        await this.index.describeIndexStats();
      } catch (indexError) {
        // If index not found, list available indexes to help debug
        if (indexError.message?.includes('404') || indexError.message?.includes('not found')) {
          const availableIndexes = await this.listIndexes();
          throw new Error(
            `Index "${this.indexName}" not found. Available indexes: ${availableIndexes.length > 0 ? availableIndexes.join(', ') : 'none'}. ` +
            `Please check your PINECONE_INDEX_NAME environment variable or create the index in Pinecone dashboard.`
          );
        }
        throw indexError;
      }
      
      this.isConnected = true;
      logger.info(`Connected to Pinecone index: ${this.indexName}`);
      
      return this.index;
    } catch (error) {
      this.isConnected = false;
      const errorMessage = `Failed to connect to Pinecone: ${error.message}`;
      logger.error('Failed to connect to Pinecone', error);
      throw new Error(errorMessage);
    }
  }

  /**
   * Validate index exists and has correct dimensions
   * @returns {Promise<Object>} Index stats
   */
  async validateIndex() {
    try {
      if (!this.isConnected) {
        await this.connect();
      }

      const stats = await this.index.describeIndexStats();
      logger.info(`Index validated: ${this.indexName}`, stats);
      return stats;
    } catch (error) {
      const errorMessage = `Index validation failed: ${error.message}`;
      logger.error('Index validation failed', error);
      throw new Error(errorMessage);
    }
  }

  /**
   * Validate vector dimensions before upsert
   * @param {Array} vectors - Array of vectors to validate
   * @param {number} expectedDimension - Expected vector dimension (default: 1024)
   */
  validateVectorDimensions(vectors, expectedDimension = 1024) {
    if (!Array.isArray(vectors) || vectors.length === 0) {
      throw new Error('Vectors must be a non-empty array');
    }

    for (const vector of vectors) {
      if (!vector.id) {
        throw new Error('Vector must have an id property');
      }
      if (!vector.values || !Array.isArray(vector.values)) {
        throw new Error('Vector must have a values array');
      }
      if (vector.values.length !== expectedDimension) {
        throw new Error(
          `Vector dimension mismatch: expected ${expectedDimension}, got ${vector.values.length}`
        );
      }
    }
  }

  /**
   * Upsert chunks with embeddings to Pinecone
   * @param {Array<Object>} chunks - Array of text chunks with metadata
   * @param {Array<Array<number>>} embeddings - Array of embedding vectors
   * @param {string} fileId - File identifier for vector IDs
   * @param {string} namespace - Optional namespace (default: '')
   * @param {number} maxRetries - Maximum retry attempts (default: 3)
   * @returns {Promise<Object>} Upsert result
   */
  async upsertChunksWithEmbeddings(chunks, embeddings, fileId, namespace = '', maxRetries = 3) {
    try {
      if (!Array.isArray(chunks) || chunks.length === 0) {
        throw new Error('Chunks must be a non-empty array');
      }
      if (!Array.isArray(embeddings) || embeddings.length === 0) {
        throw new Error('Embeddings must be a non-empty array');
      }
      if (chunks.length !== embeddings.length) {
        throw new Error(`Chunks and embeddings count mismatch: ${chunks.length} chunks vs ${embeddings.length} embeddings`);
      }

      // Format vectors for Pinecone
      const vectors = chunks.map((chunk, index) => {
        const chunkText = typeof chunk === 'string' ? chunk : chunk.text;
        const chunkMetadata = typeof chunk === 'string' ? {} : chunk;
        
        // Filter metadata to only include Pinecone-compatible types (string, number, boolean, list of strings)
        // Exclude large fields that exceed Pinecone's 40KB metadata limit
        const filteredMetadata = {};
        const excludedFields = new Set([
          'embedding',      // Already in values
          'text',           // We'll add a truncated version separately
          'pageTexts',      // Large array - only needed during chunking, not storage
          'chunkSize',      // Redundant
          'startChar',      // Can be calculated
          'endChar'         // Can be calculated
        ]);

        // Critical fields for source attribution - preserve these explicitly
        const criticalFields = ['pageNumber', 'pageRange', 'internalPageNumber', 'displayPageNumber', 'fileName', 'fileId', 'numPages'];
        for (const field of criticalFields) {
          if (chunkMetadata[field] !== undefined && chunkMetadata[field] !== null) {
            filteredMetadata[field] = chunkMetadata[field];
          }
        }
        
        // Use displayPageNumber for page if available (preferred over pageNumber for user-facing references)
        if (chunkMetadata.displayPageNumber && !filteredMetadata.page) {
          filteredMetadata.page = chunkMetadata.displayPageNumber; // Add 'page' field for compatibility
        } else if (chunkMetadata.pageNumber && !filteredMetadata.page) {
          filteredMetadata.page = chunkMetadata.pageNumber; // Fallback to PDF page index
        }
        
        for (const [key, value] of Object.entries(chunkMetadata)) {
          // Skip excluded fields
          if (excludedFields.has(key)) {
            continue;
          }
          
          // Only include scalar values or small arrays
          if (value === null || value === undefined) {
            continue;
          }
          
          // String values - limit size to prevent metadata bloat
          if (typeof value === 'string') {
            // Limit string fields to 500 chars max (except for small identifiers)
            if (key === 'fileName' || key === 'originalFileName' || key === 's3Key' || key === 'fileId') {
              filteredMetadata[key] = value; // Allow full file names/IDs
            } else if (value.length <= 500) {
              filteredMetadata[key] = value;
            } else {
              // Truncate long strings
              filteredMetadata[key] = value.substring(0, 500);
              logger.debug(`Truncated metadata field ${key} from ${value.length} to 500 chars`);
            }
          } else if (typeof value === 'number' || typeof value === 'boolean') {
            filteredMetadata[key] = value;
          } else if (Array.isArray(value)) {
            // Only include small arrays of strings (max 10 items, each max 200 chars)
            if (value.length <= 10 && value.every(item => typeof item === 'string' && item.length <= 200)) {
              filteredMetadata[key] = value;
            } else {
              logger.debug(`Skipping large array metadata field ${key} (${value.length} items)`);
            }
          } else if (typeof value === 'object') {
            // Skip objects - they're too large for metadata
            logger.debug(`Skipping object metadata field ${key}`);
          }
        }
        
        // Calculate metadata size estimate (rough)
        const metadataSize = JSON.stringify({
          fileId,
          chunkIndex: index,
          text: chunkText.substring(0, 300), // Reduced from 1000 to 300
          ...filteredMetadata
        }).length;
        
        if (metadataSize > 35000) { // Leave buffer below 40KB limit
          logger.warn(`Metadata size ${metadataSize} bytes is large, further reducing text preview`);
          // Further reduce text if metadata is still too large
          const textPreview = chunkText.substring(0, Math.max(100, 300 - (metadataSize - 35000) / 10));
          return {
            id: `${fileId}-chunk-${index}`,
            values: embeddings[index],
            metadata: {
              fileId,
              chunkIndex: index,
              text: textPreview,
              ...filteredMetadata
            }
          };
        }
        
        return {
          id: `${fileId}-chunk-${index}`,
          values: embeddings[index],
          metadata: {
            fileId,
            chunkIndex: index,
            text: chunkText.substring(0, 300), // Reduced from 1000 to 300 chars
            ...filteredMetadata
          }
        };
      });

      // Diagnostic: Log sample vectors with metadata to verify page numbers are included
      if (vectors.length > 0) {
        const sampleVectors = [vectors[0], vectors[Math.floor(vectors.length / 2)], vectors[vectors.length - 1]].filter(Boolean);
        logger.info('Sample vectors before storage (diagnostic)', {
          samples: sampleVectors.map(v => ({
            id: v.id,
            hasPageNumber: 'pageNumber' in v.metadata,
            pageNumber: v.metadata.pageNumber,
            pageRange: v.metadata.pageRange,
            fileName: v.metadata.fileName,
            chunkIndex: v.metadata.chunkIndex,
            metadataKeys: Object.keys(v.metadata)
          }))
        });
      }

      return await this.upsertVectors(vectors, namespace, maxRetries);
    } catch (error) {
      const errorMessage = `Upsert chunks with embeddings failed: ${error.message}`;
      logger.error('Upsert chunks with embeddings failed', error);
      throw new Error(errorMessage);
    }
  }

  /**
   * Upsert vectors to Pinecone index with retry logic and batching
   * @param {Array} vectors - Array of vectors to upsert
   * @param {string} namespace - Optional namespace (default: '')
   * @param {number} maxRetries - Maximum retry attempts (default: 3)
   * @returns {Promise<Object>} Upsert result
   */
  async upsertVectors(vectors, namespace = '', maxRetries = 3) {
    try {
      if (!this.isConnected) {
        await this.connect();
      }

      // Validate vector dimensions
      this.validateVectorDimensions(vectors);

      // Pinecone recommends batching upserts (max 100 vectors per request)
      // For large documents, batch to improve performance and avoid timeouts
      const batchSize = 100;
      const totalVectors = vectors.length;
      
      if (totalVectors <= batchSize) {
        // Small batch - upsert all at once
        let lastError;
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
          try {
            const namespaceIndex = namespace ? this.index.namespace(namespace) : this.index;
            const result = await namespaceIndex.upsert(vectors);
            logger.info(`Upserted ${totalVectors} vectors successfully`);
            return result;
          } catch (error) {
            lastError = error;
            if (attempt < maxRetries) {
              const delay = Math.pow(2, attempt) * 1000; // Exponential backoff
              logger.warn(`Upsert attempt ${attempt} failed, retrying in ${delay}ms...`, error);
              await new Promise(resolve => setTimeout(resolve, delay));
            }
          }
        }
        throw new Error(`Failed to upsert vectors after ${maxRetries} attempts: ${lastError.message}`);
      } else {
        // Large batch - process in chunks with parallel execution
        logger.info(`Upserting ${totalVectors} vectors in batches of ${batchSize}...`);
        const namespaceIndex = namespace ? this.index.namespace(namespace) : this.index;
        const batches = [];
        
        for (let i = 0; i < totalVectors; i += batchSize) {
          const batch = vectors.slice(i, i + batchSize);
          batches.push(batch);
        }
        
        // Process batches in parallel (up to 5 concurrent batches)
        const concurrencyLimit = 5;
        let processed = 0;
        
        for (let i = 0; i < batches.length; i += concurrencyLimit) {
          const concurrentBatches = batches.slice(i, i + concurrencyLimit);
          
          const batchPromises = concurrentBatches.map(async (batch, batchIndex) => {
            let lastError;
            for (let attempt = 1; attempt <= maxRetries; attempt++) {
              try {
                await namespaceIndex.upsert(batch);
                processed += batch.length;
                if ((i + batchIndex) % 10 === 0 || processed === totalVectors) {
                  logger.info(`Upsert progress: ${processed}/${totalVectors} vectors (${Math.round(processed/totalVectors*100)}%)`);
                }
                return;
              } catch (error) {
                lastError = error;
                if (attempt < maxRetries) {
                  const delay = Math.pow(2, attempt) * 500; // Shorter delay for batch retries
                  logger.warn(`Batch ${i + batchIndex + 1} upsert attempt ${attempt} failed, retrying in ${delay}ms...`, error);
                  await new Promise(resolve => setTimeout(resolve, delay));
                }
              }
            }
            throw new Error(`Failed to upsert batch ${i + batchIndex + 1} after ${maxRetries} attempts: ${lastError.message}`);
          });
          
          await Promise.all(batchPromises);
        }
        
        logger.info(`Successfully upserted all ${totalVectors} vectors in ${batches.length} batches`);
        return { upsertedCount: totalVectors };
      }
    } catch (error) {
      const errorMessage = `Upsert vectors failed: ${error.message}`;
      logger.error('Upsert vectors failed', error);
      throw new Error(errorMessage);
    }
  }

  /**
   * Query vectors by document IDs with metadata filter
   * @param {Array<string>} documentIds - Array of file IDs to query
   * @param {Array<number>} queryEmbedding - Query embedding vector (optional, uses default if not provided)
   * @param {number} topK - Number of results to return (default: 10)
   * @param {string} namespace - Optional namespace (default: '')
   * @returns {Promise<Array<Object>>} Array of matching chunks with metadata
   */
  async queryByDocumentIds(documentIds, queryEmbedding = null, topK = 10, namespace = '') {
    try {
      if (!this.isConnected) {
        await this.connect();
      }

      if (!Array.isArray(documentIds) || documentIds.length === 0) {
        throw new Error('documentIds must be a non-empty array');
      }

      // If no query embedding provided, use a default one (all zeros for broad search)
      // Or better: use embeddingService to generate one from a query text
      let queryVector = queryEmbedding;
      
      if (!queryVector) {
        // For document-specific queries, we can use a generic query or let the filter do the work
        // Using a zero vector will rely on metadata filter for relevance
        // In practice, you might want to generate an embedding from a query string
        logger.warn('No query embedding provided, using metadata filter only');
        // Create a dummy vector of correct dimension (1024)
        queryVector = new Array(1024).fill(0);
      }

      if (!Array.isArray(queryVector) || queryVector.length !== 1024) {
        throw new Error('Query vector must be an array of 1024 dimensions');
      }

      // Build metadata filter for file IDs
      // Pinecone filter syntax: { fileId: { $in: [array] } }
      const filter = {
        fileId: { $in: documentIds }
      };

      const queryOptions = {
        vector: queryVector,
        topK,
        includeMetadata: true,
        filter
      };

      const namespaceIndex = namespace ? this.index.namespace(namespace) : this.index;
      const results = await namespaceIndex.query(queryOptions);

      // Extract matches with metadata
      const chunks = (results.matches || []).map(match => ({
        id: match.id,
        score: match.score,
        metadata: match.metadata || {}
      }));

      logger.info('Query by document IDs completed', {
        documentIds: documentIds.length,
        topK,
        resultsCount: chunks.length
      });

      return chunks;
    } catch (error) {
      const errorMessage = `Query by document IDs failed: ${error.message}`;
      logger.error('Query by document IDs failed', error);
      throw new Error(errorMessage);
    }
  }

  /**
   * Query vectors from Pinecone index
   * @param {Array} queryVector - Query vector (embedding)
   * @param {number} topK - Number of results to return (default: 5)
   * @param {Object} filter - Optional metadata filter
   * @param {string} namespace - Optional namespace (default: '')
   * @returns {Promise<Object>} Query results
   */
  async queryVectors(queryVector, topK = 5, filter = null, namespace = '') {
    try {
      if (!this.isConnected) {
        await this.connect();
      }

      if (!Array.isArray(queryVector) || queryVector.length === 0) {
        throw new Error('Query vector must be a non-empty array');
      }

      if (queryVector.length !== 1024) {
        throw new Error(`Query vector dimension must be 1024, got ${queryVector.length}`);
      }

      const queryOptions = {
        vector: queryVector,
        topK,
        includeMetadata: true,
      };

      if (filter) {
        queryOptions.filter = filter;
      }

      const namespaceIndex = namespace ? this.index.namespace(namespace) : this.index;
      const results = await namespaceIndex.query(queryOptions);
      
      logger.info(`Query returned ${results.matches?.length || 0} results`);
      return results;
    } catch (error) {
      const errorMessage = `Query vectors failed: ${error.message}`;
      logger.error('Query vectors failed', error);
      throw new Error(errorMessage);
    }
  }

  /**
   * Delete vectors by IDs
   * @param {Array<string>} ids - Array of vector IDs to delete
   * @param {string} namespace - Optional namespace (default: '')
   * @returns {Promise<Object>} Delete result
   */
  async deleteVectors(ids, namespace = '') {
    try {
      if (!this.isConnected) {
        await this.connect();
      }

      if (!Array.isArray(ids) || ids.length === 0) {
        throw new Error('IDs must be a non-empty array');
      }

      const namespaceIndex = namespace ? this.index.namespace(namespace) : this.index;
      const result = await namespaceIndex.deleteMany(ids);
      
      logger.info(`Deleted ${ids.length} vectors`);
      return result;
    } catch (error) {
      const errorMessage = `Delete vectors failed: ${error.message}`;
      logger.error('Delete vectors failed', error);
      throw new Error(errorMessage);
    }
  }

  /**
   * Delete vectors by metadata filter
   * @param {Object} filter - Metadata filter
   * @param {string} namespace - Optional namespace (default: '')
   * @returns {Promise<Object>} Delete result
   */
  async deleteVectorsByFilter(filter, namespace = '') {
    try {
      if (!this.isConnected) {
        await this.connect();
      }

      if (!filter || typeof filter !== 'object') {
        throw new Error('Filter must be a valid object');
      }

      const namespaceIndex = namespace ? this.index.namespace(namespace) : this.index;
      const result = await namespaceIndex.deleteMany(filter);
      
      logger.info('Deleted vectors by filter');
      return result;
    } catch (error) {
      const errorMessage = `Delete vectors by filter failed: ${error.message}`;
      logger.error('Delete vectors by filter failed', error);
      throw new Error(errorMessage);
    }
  }

  /**
   * Get index statistics
   * @returns {Promise<Object>} Index stats
   */
  async getStats() {
    try {
      if (!this.isConnected) {
        await this.connect();
      }

      const stats = await this.index.describeIndexStats();
      return stats;
    } catch (error) {
      const errorMessage = `Get stats failed: ${error.message}`;
      logger.error('Get stats failed', error);
      throw new Error(errorMessage);
    }
  }
}

// Export singleton instance
export default new PineconeService();

