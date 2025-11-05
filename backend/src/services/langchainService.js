/**
 * Langchain Service
 * Wraps vector database operations using Langchain for better abstraction
 * Supports both ChromaDB and Pinecone through Langchain
 */

import { GoogleGenerativeAIEmbeddings } from '@langchain/google-genai';
import { Document } from '@langchain/core/documents';
import { logger } from '../utils/logger.js';

class LangchainService {
  constructor() {
    this.vectorStore = null;
    this.embeddings = null;
    this.vectorDbType = process.env.VECTOR_DB || 'chromadb';
    this.isInitialized = false;
  }

  /**
   * Initialize embeddings model
   */
  async initializeEmbeddings() {
    if (this.embeddings) {
      return this.embeddings;
    }

    const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GOOGLE_API_KEY or GEMINI_API_KEY environment variable is not set');
    }

    this.embeddings = new GoogleGenerativeAIEmbeddings({
      modelName: 'gemini-embedding-001',
      apiKey
    });

    logger.info('Langchain embeddings initialized');
    return this.embeddings;
  }

  /**
   * Initialize vector store (ChromaDB or Pinecone)
   */
  async initializeVectorStore() {
    if (this.vectorStore && this.isInitialized) {
      return this.vectorStore;
    }

    await this.initializeEmbeddings();

    if (this.vectorDbType === 'pinecone') {
      // Initialize Pinecone vector store - dynamic import to avoid build errors
      const { Pinecone: PineconeVectorStore } = await import('@langchain/pinecone');
      const { Pinecone: PineconeClient } = await import('@pinecone-database/pinecone');
      
      const apiKey = process.env.PINECONE_API_KEY;
      const indexName = process.env.PINECONE_INDEX_NAME || 'genaidoc';
      
      if (!apiKey) {
        throw new Error('PINECONE_API_KEY environment variable is not set');
      }

      const client = new PineconeClient({ apiKey });
      const index = client.index(indexName);

      this.vectorStore = await PineconeVectorStore.fromExistingIndex(
        this.embeddings,
        {
          pineconeIndex: index
        }
      );

      logger.info('Langchain Pinecone vector store initialized');
    } else {
      // Initialize ChromaDB vector store (default)
      const apiKey = process.env.CHROMA_API_KEY;
      const tenant = process.env.CHROMA_TENANT;
      const database = process.env.CHROMA_DATABASE || 'genaidoc';
      const collectionName = process.env.CHROMA_DATABASE || 'genaidoc';

      if (!apiKey) {
        throw new Error('CHROMA_API_KEY environment variable is not set');
      }

      // First, ensure the collection exists with proper embedding function using native service
      // This ensures the collection is created correctly before Langchain tries to use it
      const { getOrCreateCollection } = await import('../config/chroma.js');
      await getOrCreateCollection(collectionName);

      // Use Langchain's Chroma wrapper - dynamic import to avoid build errors
      const { Chroma } = await import('@langchain/community/vectorstores/chroma');
      
      // For ChromaDB Cloud, we need to configure ChromaClient with proper auth
      // Langchain's Chroma.fromExistingCollection can work with ChromaDB Cloud
      // The collection already exists with the proper embedding function from getOrCreateCollection above
      const { ChromaClient } = await import('chromadb');

      // Create ChromaClient configured for ChromaDB Cloud
      // Use the new ChromaClient API format (host/port/ssl/headers instead of deprecated path/auth)
      const chromaClient = new ChromaClient({
        host: 'api.trychroma.com',
        port: 443,
        ssl: true,
        headers: {
          'X-Chroma-Token': apiKey
        }
      });

      // Use Langchain's Chroma wrapper with the client instance
      // The collection already exists from getOrCreateCollection above
      // Langchain will use the collection with the embeddings we provide
      this.vectorStore = await Chroma.fromExistingCollection(
        this.embeddings,
        {
          collectionName,
          client: chromaClient  // Pass the configured ChromaClient
        }
      );

      logger.info('Langchain ChromaDB vector store initialized');
    }

    this.isInitialized = true;
    return this.vectorStore;
  }

  /**
   * Add documents to vector store
   * @param {Array<Object>} chunks - Array of text chunks with metadata
   * @param {string} fileId - File identifier
   * @returns {Promise<Array<string>} Array of document IDs
   */
  async addDocuments(chunks, fileId) {
    try {
      const vectorStore = await this.initializeVectorStore();

      // Convert chunks to Langchain Document format
      const documents = chunks.map((chunk, index) => {
        const chunkText = typeof chunk === 'string' ? chunk : chunk.text;
        const chunkMetadata = typeof chunk === 'string' ? {} : chunk;

        return new Document({
          pageContent: chunkText,
          metadata: {
            fileId,
            chunkIndex: index,
            ...chunkMetadata
          }
        });
      });

      // Add documents to vector store
      const documentIds = await vectorStore.addDocuments(documents);

      logger.info(`Added ${documents.length} documents to vector store via Langchain`, {
        fileId,
        documentIds: documentIds.length
      });

      return documentIds;
    } catch (error) {
      logger.error('Langchain addDocuments failed', error);
      throw new Error(`Failed to add documents via Langchain: ${error.message}`);
    }
  }

  /**
   * Search for similar documents
   * @param {string} query - Search query text
   * @param {Array<string>} documentIds - Optional: filter by document IDs
   * @param {number} topK - Number of results to return (default: 10)
   * @returns {Promise<Array<Object>>} Search results with metadata
   */
  async similaritySearch(query, documentIds = null, topK = 10) {
    try {
      const vectorStore = await this.initializeVectorStore();

      // Build filter for document IDs if provided
      let filter = null;
      if (documentIds && documentIds.length > 0) {
        if (this.vectorDbType === 'pinecone') {
          filter = {
            fileId: { $in: documentIds }
          };
        } else {
          // ChromaDB uses where clause
          filter = {
            fileId: { $in: documentIds }
          };
        }
      }

      // Perform similarity search
      const results = await vectorStore.similaritySearchWithScore(query, topK, filter);

      // Format results
      const formattedResults = results.map(([doc, score]) => ({
        id: doc.metadata.id || `${doc.metadata.fileId}-chunk-${doc.metadata.chunkIndex}`,
        text: doc.pageContent,
        metadata: doc.metadata,
        score: score || null
      }));

      logger.info(`Langchain similarity search completed`, {
        queryLength: query.length,
        resultsCount: formattedResults.length,
        hasFilter: !!filter
      });

      return formattedResults;
    } catch (error) {
      logger.error('Langchain similaritySearch failed', error);
      throw new Error(`Failed to search via Langchain: ${error.message}`);
    }
  }

  /**
   * Delete documents by file ID
   * @param {string} fileId - File identifier
   * @returns {Promise<boolean>} Success status
   */
  async deleteByFileId(fileId) {
    try {
      const vectorStore = await this.initializeVectorStore();

      // Note: Langchain doesn't have a direct delete method
      // We'll need to use the underlying vector store's delete method
      // This is a placeholder - actual implementation depends on vector store
      
      logger.warn('Langchain deleteByFileId not fully implemented - use native vector store service');
      
      // For now, return success (actual deletion should be handled by native services)
      return true;
    } catch (error) {
      logger.error('Langchain deleteByFileId failed', error);
      throw new Error(`Failed to delete via Langchain: ${error.message}`);
    }
  }
}

// Export singleton instance
export default new LangchainService();

