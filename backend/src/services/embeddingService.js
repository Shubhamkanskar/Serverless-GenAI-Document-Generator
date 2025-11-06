/**
 * Embedding Service
 * Generates embeddings for text chunks using Google Gemini's gemini-embedding-001 model
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { logger } from '../utils/logger.js';
import { geminiRateLimiter } from '../utils/rateLimiter.js';

class EmbeddingService {
  constructor() {
    const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;

    if (!apiKey) {
      logger.warn('GOOGLE_API_KEY or GEMINI_API_KEY not found in environment variables');
    }

    this.client = new GoogleGenerativeAI(apiKey);

    // Gemini embedding model
    this.modelName = 'gemini-embedding-001';
    // Get the embedding model instance
    this.embeddingModel = this.client.getGenerativeModel({ model: this.modelName });

    // Default to 1024 dimensions for ChromaDB
    // Can be set to 768, 1024, 1536, or 3072 (Gemini supports truncation via MRL)
    this.dimension = parseInt(process.env.GEMINI_EMBEDDING_DIMENSION) || 1024;
    this.maxRetries = 3;
    this.defaultBatchSize = 100; // Optimized for throughput - batching handles large documents efficiently

    // Task type for RAG: RETRIEVAL_DOCUMENT for documents, RETRIEVAL_QUERY for queries
    this.taskType = 'RETRIEVAL_DOCUMENT'; // Default for document embeddings

    logger.info('EmbeddingService initialized', {
      model: this.modelName,
      dimension: this.dimension,
      maxRetries: this.maxRetries,
      taskType: this.taskType
    });
  }

  /**
   * Validate API key
   * @returns {boolean} True if API key is available
   */
  validateApiKey() {
    if (!process.env.GOOGLE_API_KEY && !process.env.GEMINI_API_KEY) {
      throw new Error('GOOGLE_API_KEY or GEMINI_API_KEY environment variable is not set');
    }
    return true;
  }

  /**
   * Generate embedding for a single text
   * @param {string} text - Text to generate embedding for
   * @param {string} taskType - Task type (optional, defaults to RETRIEVAL_DOCUMENT)
   * @returns {Promise<Array<number>>} Embedding vector
   */
  async generateEmbedding(text, taskType = null) {
    try {
      this.validateApiKey();

      if (!text || typeof text !== 'string') {
        throw new Error('Text must be a non-empty string');
      }

      const trimmedText = text.trim();
      if (trimmedText.length === 0) {
        throw new Error('Text cannot be empty');
      }

      const task = taskType || this.taskType;

      // Use embedContent method from GenerativeModel
      // The API accepts: string | Array<string | Part> | EmbedContentRequest
      // Note: outputDimensionality may not be in current SDK - embeddings default to 3072
      const result = await this.embeddingModel.embedContent({
        content: { parts: [{ text: trimmedText }] },
        taskType: task
      });

      // Response structure: { embedding: { values: number[] } }
      if (!result.embedding || !result.embedding.values) {
        throw new Error('No embedding generated from Gemini API');
      }

      let embedding = Array.from(result.embedding.values);

      // Gemini embeddings default to 3072 dimensions
      // Truncate to requested dimension if needed (MRL technique allows this)
      if (embedding.length > this.dimension) {
        embedding = embedding.slice(0, this.dimension);
        logger.debug('Embedding truncated to requested dimension', {
          original: result.embedding.values.length,
          truncated: embedding.length
        });
      }

      // Validate embedding dimension
      if (!embedding || embedding.length !== this.dimension) {
        throw new Error(`Invalid embedding dimension. Expected ${this.dimension}, got ${embedding?.length || 0}`);
      }

      logger.debug('Embedding generated', {
        textLength: trimmedText.length,
        dimension: embedding.length,
        taskType: task
      });

      return embedding;
    } catch (error) {
      logger.error('Embedding generation failed', {
        error: error.message,
        textLength: text?.length || 0
      });

      // Handle specific Google API errors
      if (error.status === 429) {
        throw new Error('Rate limit exceeded. Please try again later.');
      }
      if (error.status === 401 || error.status === 403) {
        throw new Error('Invalid or missing Google API key. Please check your GOOGLE_API_KEY.');
      }
      if (error.status === 400) {
        throw new Error(`Invalid request to Gemini API: ${error.message}`);
      }
      if (error.status === 503) {
        throw new Error('Gemini service is temporarily unavailable. Please try again later.');
      }

      throw new Error(`Failed to generate embedding: ${error.message}`);
    }
  }

  /**
   * Generate embedding with retry logic and exponential backoff
   * @param {string} text - Text to generate embedding for
   * @param {number} maxRetries - Maximum number of retry attempts (default: 3)
   * @param {string} taskType - Task type (optional, defaults to RETRIEVAL_DOCUMENT)
   * @returns {Promise<Array<number>>} Embedding vector
   */
  async generateEmbeddingWithRetry(text, maxRetries = null, taskType = null) {
    const retries = maxRetries || this.maxRetries;
    let lastError;

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        return await this.generateEmbedding(text, taskType);
      } catch (error) {
        lastError = error;

        // Check if error is retryable (rate limit or network error)
        const isRetryable = error.status === 429 ||
          error.status >= 500 ||
          error.message.includes('rate limit') ||
          error.message.includes('timeout') ||
          error.message.includes('temporarily unavailable');

        if (isRetryable && attempt < retries) {
          // Exponential backoff: 2^attempt seconds
          const delay = Math.pow(2, attempt) * 1000;
          logger.warn(`Embedding generation failed, retrying in ${delay}ms (attempt ${attempt}/${retries})`, {
            error: error.message
          });

          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }

        // Not retryable or max retries reached
        throw error;
      }
    }

    // Should not reach here, but just in case
    throw lastError || new Error('Failed to generate embedding after retries');
  }

  /**
   * Generate embeddings for multiple texts in batch
   * @param {Array<string>} texts - Array of texts to generate embeddings for
   * @param {number} batchSize - Number of texts to process per batch (default: 100)
   * @param {string} taskType - Task type (optional, defaults to RETRIEVAL_DOCUMENT)
   * @returns {Promise<Array<Array<number>>>} Array of embedding vectors
   */
  async generateEmbeddingsBatch(texts, batchSize = null, taskType = null) {
    try {
      this.validateApiKey();

      if (!Array.isArray(texts) || texts.length === 0) {
        throw new Error('Texts must be a non-empty array');
      }

      // Validate all texts
      const validTexts = texts.filter((text, index) => {
        if (!text || typeof text !== 'string' || text.trim().length === 0) {
          logger.warn(`Skipping empty text at index ${index}`);
          return false;
        }
        return true;
      });

      if (validTexts.length === 0) {
        throw new Error('No valid texts to process');
      }

      // Adaptive batch size: larger for very large documents to improve throughput
      let batch = batchSize || this.defaultBatchSize;
      if (validTexts.length > 200) {
        // For large documents, use larger batches and higher concurrency for better throughput
        batch = Math.max(batch, 100); // Increase batch size for large docs
        logger.info('Large document detected, using optimized batch size', {
          totalTexts: validTexts.length,
          adjustedBatchSize: batch
        });
      }
      
      const allEmbeddings = [];
      const task = taskType || this.taskType;

      logger.info('Starting batch embedding generation', {
        totalTexts: validTexts.length,
        batchSize: batch,
        totalBatches: Math.ceil(validTexts.length / batch),
        taskType: task
      });

      // Process in batches
      for (let i = 0; i < validTexts.length; i += batch) {
        const batchTexts = validTexts.slice(i, i + batch);
        const batchIndex = Math.floor(i / batch) + 1;
        
        // Process chunks in parallel with adaptive concurrency
        // Higher concurrency for large documents to improve throughput
        const concurrencyLimit = validTexts.length > 200 ? 20 : 10; // Increase concurrency for large docs
        const batchEmbeddings = [];

        for (let j = 0; j < batchTexts.length; j += concurrencyLimit) {
          const concurrentTexts = batchTexts.slice(j, j + concurrencyLimit);
          
          const concurrentPromises = concurrentTexts.map(async (text, idx) => {
            return await geminiRateLimiter.execute(async () => {
              let embedding = null;
              let itemRetries = 0;
              const maxItemRetries = 3;

              while (itemRetries <= maxItemRetries && !embedding) {
                try {
                  const result = await this.embeddingModel.embedContent({
                    content: { parts: [{ text: text.trim() }] },
                    taskType: task
                  });

                  if (!result.embedding || !result.embedding.values) {
                    throw new Error(`Failed to generate embedding`);
                  }

                  let embeddingArray = Array.from(result.embedding.values);
                  if (embeddingArray.length > this.dimension) {
                    embeddingArray = embeddingArray.slice(0, this.dimension);
                  }
                  if (embeddingArray.length !== this.dimension) {
                    throw new Error(`Invalid embedding dimension`);
                  }

                  embedding = embeddingArray;
                } catch (error) {
                  itemRetries++;
                  const isRetryable = error.status === 429 || 
                    (error.status >= 500 && error.status < 600);
                  
                  if (isRetryable && itemRetries <= maxItemRetries) {
                    await new Promise(resolve => setTimeout(resolve, Math.pow(2, itemRetries) * 500));
                    continue;
                  }
                  throw error;
                }
              }
              
              return embedding;
            });
          });

          const results = await Promise.all(concurrentPromises);
          batchEmbeddings.push(...results);
        }

        allEmbeddings.push(...batchEmbeddings);

        // Log progress
        if (batchIndex % 10 === 0 || i + batch >= validTexts.length) {
          logger.info('Batch embedding progress', {
            batchIndex,
            processed: Math.min(i + batchTexts.length, validTexts.length),
            total: validTexts.length,
            percentage: Math.round(((i + batchTexts.length) / validTexts.length) * 100)
          });
        }

        // No delay between batches for large documents - maximize throughput
        // Only add minimal delay if we detect rate limiting
      }

      logger.info('Batch embedding generation completed', {
        totalTexts: validTexts.length,
        totalEmbeddings: allEmbeddings.length
      });

      return allEmbeddings;
    } catch (error) {
      logger.error('Batch embedding generation failed', error);

      if (error.status === 429) {
        throw new Error('Rate limit exceeded. Please try again later.');
      }
      if (error.status === 401 || error.status === 403) {
        throw new Error('Invalid or missing Google API key. Please check your GOOGLE_API_KEY.');
      }

      throw new Error(`Failed to generate batch embeddings: ${error.message}`);
    }
  }

  /**
   * Generate embeddings for multiple texts with retry logic
   * @param {Array<string>} texts - Array of texts to generate embeddings for
   * @param {number} batchSize - Number of texts to process per batch
   * @param {number} maxRetries - Maximum number of retry attempts per batch
   * @param {string} taskType - Task type (optional, defaults to RETRIEVAL_DOCUMENT)
   * @returns {Promise<Array<Array<number>>>} Array of embedding vectors
   */
  async generateEmbeddingsBatchWithRetry(texts, batchSize = null, maxRetries = null, taskType = null) {
    const retries = maxRetries || this.maxRetries;
    let lastError;

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        return await this.generateEmbeddingsBatch(texts, batchSize, taskType);
      } catch (error) {
        lastError = error;

        // Check if error is retryable (network errors, rate limits, server errors)
        const isNetworkError = error.message.includes('fetch failed') ||
          error.message.includes('ETIMEDOUT') ||
          error.message.includes('ECONNRESET') ||
          error.message.includes('ENOTFOUND') ||
          error.message.includes('network') ||
          error.message.includes('timeout');

        const isRetryable = error.status === 429 ||
          (error.status >= 500 && error.status < 600) ||
          error.message.includes('rate limit') ||
          error.message.includes('temporarily unavailable') ||
          isNetworkError;

        if (isRetryable && attempt < retries) {
          const delay = Math.pow(2, attempt) * 1000; // Exponential backoff: 2s, 4s, 8s
          logger.warn(`Batch embedding generation failed, retrying in ${delay}ms (attempt ${attempt}/${retries})`, {
            error: error.message,
            isNetworkError
          });

          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }

        throw error;
      }
    }

    throw lastError || new Error('Failed to generate batch embeddings after retries');
  }

  /**
   * Generate embeddings for text chunks with metadata
   * @param {Array<Object>} chunks - Array of text chunks with metadata
   * @param {number} batchSize - Batch size for processing
   * @returns {Promise<Array<Object>>} Array of chunks with embeddings
   */
  async generateEmbeddingsForChunks(chunks, batchSize = null) {
    try {
      if (!Array.isArray(chunks) || chunks.length === 0) {
        throw new Error('Chunks must be a non-empty array');
      }

      // Extract texts from chunks
      const texts = chunks.map(chunk => {
        if (typeof chunk === 'string') {
          return chunk;
        }
        if (chunk.text) {
          return chunk.text;
        }
        throw new Error('Chunk must have a text property or be a string');
      });

      // Generate embeddings (use RETRIEVAL_DOCUMENT for document chunks)
      const embeddings = await this.generateEmbeddingsBatchWithRetry(texts, batchSize, null, 'RETRIEVAL_DOCUMENT');

      // Combine chunks with embeddings
      const chunksWithEmbeddings = chunks.map((chunk, index) => {
        const chunkData = typeof chunk === 'string' ? { text: chunk } : chunk;
        return {
          ...chunkData,
          embedding: embeddings[index],
          embeddingDimension: this.dimension,
          embeddedAt: new Date().toISOString()
        };
      });

      logger.info('Embeddings generated for chunks', {
        totalChunks: chunksWithEmbeddings.length
      });

      return chunksWithEmbeddings;
    } catch (error) {
      logger.error('Failed to generate embeddings for chunks', error);
      throw new Error(`Failed to generate embeddings for chunks: ${error.message}`);
    }
  }
}

// Export singleton instance
export default new EmbeddingService();

