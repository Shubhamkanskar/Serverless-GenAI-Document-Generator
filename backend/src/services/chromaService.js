/**
 * ChromaDB Service
 * Handles vector operations using ChromaDB with Gemini embeddings
 */

import getCollection from '../config/chroma.js';
import embeddingService from './embeddingService.js';
import { logger } from '../utils/logger.js';

class ChromaService {
  constructor() {
    this.collectionName = process.env.CHROMA_DATABASE || 'genaidoc';
    this.isConnected = false;
    this.collection = null;
  }

  /**
   * Connect to ChromaDB collection
   */
  async connect() {
    try {
      if (!this.isConnected || !this.collection) {
        this.collection = await getCollection(this.collectionName);
        this.isConnected = true;
        logger.info('Connected to ChromaDB collection', {
          collectionName: this.collectionName
        });
      }
      return this.collection;
    } catch (error) {
      logger.error('Failed to connect to ChromaDB', error);
      throw new Error(`Failed to connect to ChromaDB: ${error.message}`);
    }
  }

  /**
   * Upsert chunks with embeddings to ChromaDB
   * @param {Array} chunks - Array of text chunks
   * @param {Array} embeddings - Array of embedding vectors
   * @param {string} fileId - File identifier
   * @param {string} namespace - Optional namespace (ChromaDB uses collections instead)
   * @returns {Promise<Object>} Upsert result
   */
  async upsertChunksWithEmbeddings(chunks, embeddings, fileId, namespace = '') {
    try {
      if (!chunks || chunks.length === 0) {
        throw new Error('Chunks must be a non-empty array');
      }
      if (!Array.isArray(embeddings) || embeddings.length === 0) {
        throw new Error('Embeddings must be a non-empty array');
      }
      if (chunks.length !== embeddings.length) {
        throw new Error(`Chunks and embeddings count mismatch: ${chunks.length} chunks vs ${embeddings.length} embeddings`);
      }

      const collection = await this.connect();

      // Format data for ChromaDB
      const ids = [];
      const documents = [];
      const metadatas = [];

      chunks.forEach((chunk, index) => {
        const chunkText = typeof chunk === 'string' ? chunk : chunk.text;
        const chunkMetadata = typeof chunk === 'string' ? {} : chunk;

        // Generate unique ID
        const chunkId = `${fileId}-chunk-${index}`;
        ids.push(chunkId);

        // Add document text
        documents.push(chunkText);

        // Filter metadata (ChromaDB supports string, number, boolean, null)
        const filteredMetadata = {
          fileId,
          chunkIndex: index,
          text: chunkText.substring(0, 1000) // Limit text in metadata
        };

        // Add compatible metadata fields
        for (const [key, value] of Object.entries(chunkMetadata)) {
          if (key === 'embedding' || key === 'text') {
            continue; // Skip embedding and text (already in documents)
          }

          if (value === null || value === undefined) {
            continue;
          }

          if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
            filteredMetadata[key] = value;
          } else if (typeof value === 'object') {
            // Convert objects to strings
            try {
              filteredMetadata[key] = JSON.stringify(value);
            } catch (e) {
              logger.warn(`Skipping metadata field ${key}: cannot convert to string`);
            }
          }
        }

        metadatas.push(filteredMetadata);
      });

      // Upsert to ChromaDB
      // ChromaDB will automatically generate embeddings using the Gemini embedding function
      // But we can also provide pre-generated embeddings for better control
      await collection.upsert({
        ids,
        documents,
        metadatas,
        embeddings: embeddings // Provide pre-generated embeddings (optional, ChromaDB will generate if not provided)
      });

      logger.info(`Upserted ${chunks.length} vectors to ChromaDB`, {
        fileId,
        collectionName: this.collectionName
      });

      return {
        upsertedCount: chunks.length,
        collectionName: this.collectionName
      };
    } catch (error) {
      logger.error('ChromaDB upsert failed', error);
      throw new Error(`Failed to upsert to ChromaDB: ${error.message}`);
    }
  }

  /**
   * Query ChromaDB for similar documents
   * @param {Array<number>} queryVector - Query embedding vector
   * @param {Array<string>} documentIds - Optional: filter by document IDs
   * @param {number} topK - Number of results to return (default: 10)
   * @param {Object} metadataFilter - Optional metadata filter
   * @returns {Promise<Array>} Query results
   */
  async queryByVector(queryVector, documentIds = null, topK = 10, metadataFilter = null) {
    try {
      const collection = await this.connect();

      // Build where clause for metadata filter
      let where = null;
      if (documentIds && documentIds.length > 0) {
        where = {
          fileId: { $in: documentIds }
        };
      }
      if (metadataFilter) {
        where = { ...where, ...metadataFilter };
      }

      const queryOptions = {
        queryEmbeddings: [queryVector],
        nResults: topK,
        where: where || undefined
      };

      const results = await collection.query(queryOptions);

      logger.info('ChromaDB query completed', {
        topK,
        resultsCount: results.documents?.[0]?.length || 0
      });

      // Format results
      const formattedResults = [];
      if (results.documents && results.documents[0]) {
        for (let i = 0; i < results.documents[0].length; i++) {
          formattedResults.push({
            id: results.ids[0][i],
            text: results.documents[0][i],
            metadata: results.metadatas[0][i] || {},
            distance: results.distances?.[0]?.[i] || null
          });
        }
      }

      return formattedResults;
    } catch (error) {
      logger.error('ChromaDB query failed', error);
      throw new Error(`Failed to query ChromaDB: ${error.message}`);
    }
  }

  /**
   * Query by document IDs (uses metadata filter)
   * @param {Array<string>} documentIds - Document IDs to filter by
   * @param {string} queryText - Optional query text for semantic search
   * @param {number} topK - Number of results (default: 10)
   * @returns {Promise<Array>} Query results
   */
  async queryByDocumentIds(documentIds, queryText = null, topK = 10) {
    try {
      const collection = await this.connect();

      let queryVector = null;
      
      // If query text provided, generate embedding
      if (queryText) {
        const embedding = await embeddingService.generateEmbedding(queryText, 'RETRIEVAL_QUERY');
        queryVector = embedding;
      }

      // Build metadata filter
      const where = {
        fileId: { $in: documentIds }
      };

      logger.info('Querying ChromaDB', {
        documentIds,
        hasQueryVector: !!queryVector,
        topK,
        whereFilter: where
      });

      let results;
      if (queryVector) {
        // Semantic search with query vector
        results = await collection.query({
          queryEmbeddings: [queryVector],
          nResults: topK,
          where
        });
      } else {
        // Metadata-only filter (get all documents matching IDs)
        // Note: ChromaDB requires a query vector, so we'll use a zero vector
        const zeroVector = new Array(embeddingService.dimension).fill(0);
        results = await collection.query({
          queryEmbeddings: [zeroVector],
          nResults: topK,
          where
        });
      }

      logger.info('ChromaDB query results', {
        resultsCount: results.documents?.[0]?.length || 0,
        hasDocuments: !!results.documents?.[0],
        hasIds: !!results.ids?.[0]
      });

      const formattedResults = this.formatQueryResults(results);
      
      logger.info('Formatted query results', {
        formattedCount: formattedResults.length
      });

      return formattedResults;
    } catch (error) {
      logger.error('ChromaDB query by document IDs failed', error);
      throw new Error(`Failed to query ChromaDB by document IDs: ${error.message}`);
    }
  }

  /**
   * Format ChromaDB query results
   */
  formatQueryResults(results) {
    const formattedResults = [];
    if (results.documents && results.documents[0]) {
      for (let i = 0; i < results.documents[0].length; i++) {
        formattedResults.push({
          id: results.ids[0][i],
          text: results.documents[0][i],
          metadata: results.metadatas[0][i] || {},
          distance: results.distances?.[0]?.[i] || null,
          score: results.distances?.[0]?.[i] ? 1 - results.distances[0][i] : null
        });
      }
    }
    return formattedResults;
  }

  /**
   * Delete vectors by file ID
   * @param {string} fileId - File identifier
   * @returns {Promise<Object>} Delete result
   */
  async deleteByFileId(fileId) {
    try {
      const collection = await this.connect();

      // Delete using metadata filter
      await collection.delete({
        where: {
          fileId: { $eq: fileId }
        }
      });

      logger.info(`Deleted vectors for file ${fileId} from ChromaDB`);
      return { deleted: true, fileId };
    } catch (error) {
      logger.error('ChromaDB delete failed', error);
      throw new Error(`Failed to delete from ChromaDB: ${error.message}`);
    }
  }

  /**
   * Get collection stats
   * @returns {Promise<Object>} Collection statistics
   */
  async getStats() {
    try {
      const collection = await this.connect();
      const count = await collection.count();
      
      return {
        count,
        collectionName: this.collectionName
      };
    } catch (error) {
      logger.error('Failed to get ChromaDB stats', error);
      throw new Error(`Failed to get ChromaDB stats: ${error.message}`);
    }
  }
}

// Export singleton instance
export default new ChromaService();

