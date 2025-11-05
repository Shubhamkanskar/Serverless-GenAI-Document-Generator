/**
 * ChromaDB Configuration
 * Creates and configures ChromaDB client with Google Gemini embeddings
 */

import { CloudClient } from 'chromadb';
import { GoogleGeminiEmbeddingFunction } from '@chroma-core/google-gemini';
import { logger } from '../utils/logger.js';

// ChromaDB configuration
const chromaConfig = {
  apiKey: process.env.CHROMA_API_KEY,
  tenant: process.env.CHROMA_TENANT,
  database: process.env.CHROMA_DATABASE || 'genaidoc'
};

// Create ChromaDB client
let chromaClient = null;
let geminiEmbedder = null;
let collection = null;

/**
 * Initialize ChromaDB Cloud client
 */
function initializeClient() {
  if (!chromaClient) {
    if (!chromaConfig.apiKey) {
      throw new Error('CHROMA_API_KEY environment variable is not set');
    }

    // Use CloudClient for Chroma Cloud (handles authentication automatically)
    // CloudClient automatically uses CHROMA_API_KEY from environment or can take it as parameter
    chromaClient = new CloudClient({
      apiKey: chromaConfig.apiKey,
      tenant: chromaConfig.tenant,
      database: chromaConfig.database
    });

    logger.info('ChromaDB Cloud client initialized', {
      tenant: chromaConfig.tenant,
      database: chromaConfig.database
    });
  }

  return chromaClient;
}

/**
 * Initialize Gemini embedding function
 */
function initializeEmbedder() {
  if (!geminiEmbedder) {
    const googleApiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
    
    if (!googleApiKey) {
      throw new Error('GOOGLE_API_KEY or GEMINI_API_KEY environment variable is not set');
    }

    // GoogleGeminiEmbeddingFunction expects apiKey or will look for GEMINI_API_KEY env var
    // We pass apiKeyEnvVar to tell it to also check GOOGLE_API_KEY
    geminiEmbedder = new GoogleGeminiEmbeddingFunction({
      apiKey: googleApiKey,
      apiKeyEnvVar: 'GOOGLE_API_KEY' // Tell it to use GOOGLE_API_KEY env var name
    });

    logger.info('Google Gemini embedding function initialized');
  }

  return geminiEmbedder;
}

/**
 * Get or create ChromaDB collection with Gemini embeddings
 * @param {string} collectionName - Name of the collection
 * @returns {Promise<Collection>} ChromaDB collection
 */
async function getOrCreateCollection(collectionName = 'genaidoc') {
  try {
    const client = initializeClient();
    const embedder = initializeEmbedder();

    // Get or create collection with Gemini embedding function
    collection = await client.getOrCreateCollection({
      name: collectionName,
      embeddingFunction: embedder,
      metadata: {
        embeddingModel: 'gemini-embedding-001',
        description: 'Collection with Google Gemini embeddings'
      }
    });

    logger.info('ChromaDB collection ready', {
      name: collectionName
    });

    return collection;
  } catch (error) {
    logger.error('Failed to get/create ChromaDB collection', error);
    throw new Error(`ChromaDB collection error: ${error.message}`);
  }
}

/**
 * Get the ChromaDB collection (cached)
 */
async function getCollection(collectionName = 'genaidoc') {
  if (!collection) {
    return await getOrCreateCollection(collectionName);
  }
  return collection;
}

export default getCollection;
export { getOrCreateCollection, initializeClient };

