/**
 * Environment Configuration
 * Loads environment variables from .env file
 * This must be imported before any services that use environment variables
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { existsSync } from 'fs';

// Get the directory of the current file
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env file from backend directory (parent of src)
const envPath = resolve(__dirname, '../../.env');

// Try to load .env file
if (existsSync(envPath)) {
  const result = dotenv.config({ path: envPath });
  if (result.error) {
    console.warn('[ENV] Warning: Failed to load .env file:', result.error.message);
  } else {
    console.log('[ENV] Loaded .env file from:', envPath);
  }
} else {
  console.warn('[ENV] Warning: .env file not found at:', envPath);
  console.warn('[ENV] Attempting to load from current working directory...');
  // Try loading from current working directory as fallback
  const fallbackResult = dotenv.config();
  if (fallbackResult.error) {
    console.warn('[ENV] Warning: Failed to load .env from current directory:', fallbackResult.error.message);
  }
}

// Debug: Log loaded bucket names (for debugging, remove in production)
if (process.env.S3_DOCUMENTS_BUCKET || process.env.DOCUMENTS_BUCKET) {
  console.log('[ENV] Documents bucket:', process.env.S3_DOCUMENTS_BUCKET || process.env.DOCUMENTS_BUCKET);
}
if (process.env.S3_OUTPUTS_BUCKET || process.env.OUTPUTS_BUCKET) {
  console.log('[ENV] Outputs bucket:', process.env.S3_OUTPUTS_BUCKET || process.env.OUTPUTS_BUCKET);
}
if (process.env.CHROMA_API_KEY) {
  console.log('[ENV] ChromaDB configured');
}

export default process.env;

