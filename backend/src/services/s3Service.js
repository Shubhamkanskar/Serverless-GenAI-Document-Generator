/**
 * S3 Service
 * Handles all S3 operations including file uploads and presigned URL generation
 */

import { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { logger } from '../utils/logger.js';

class S3Service {
  constructor() {
    const region = process.env.AWS_REGION || process.env.REGION || 'us-east-1';
    this.client = new S3Client({ region });
    this.documentsBucket = process.env.S3_DOCUMENTS_BUCKET || process.env.DOCUMENTS_BUCKET;
    this.outputsBucket = process.env.S3_OUTPUTS_BUCKET || process.env.OUTPUTS_BUCKET;
    this.frontendBucket = process.env.S3_FRONTEND_BUCKET || process.env.FRONTEND_BUCKET;

    logger.info('S3Service initialized', {
      region,
      documentsBucket: this.documentsBucket,
      outputsBucket: this.outputsBucket
    });
  }

  /**
   * Upload a document to S3 documents bucket
   * @param {Buffer} fileBuffer - File content as buffer
   * @param {string} fileName - Original file name
   * @param {string} contentType - MIME type of the file
   * @param {string} fileId - Unique file identifier (UUID)
   * @returns {Promise<Object>} Upload result with S3 key and metadata
   */
  async uploadDocument(fileBuffer, fileName, contentType, fileId) {
    try {
      if (!this.documentsBucket) {
        throw new Error('S3_DOCUMENTS_BUCKET or DOCUMENTS_BUCKET environment variable is not set. Please configure it in your environment variables.');
      }

      // Sanitize file name
      const sanitizedName = this.sanitizeFileName(fileName);
      const s3Key = `documents/${fileId}/${sanitizedName}`;

      const command = new PutObjectCommand({
        Bucket: this.documentsBucket,
        Key: s3Key,
        Body: fileBuffer,
        ContentType: contentType,
        Metadata: {
          originalFileName: fileName,
          fileId: fileId,
          uploadedAt: new Date().toISOString()
        }
      });

      await this.client.send(command);

      logger.info('Document uploaded to S3', {
        bucket: this.documentsBucket,
        key: s3Key,
        fileId,
        size: fileBuffer.length
      });

      return {
        s3Key,
        bucket: this.documentsBucket,
        fileName: sanitizedName,
        originalFileName: fileName
      };
    } catch (error) {
      logger.error('S3 upload failed', error);
      throw new Error(`Failed to upload document to S3: ${error.message}`);
    }
  }

  /**
   * Upload a generated document to S3 outputs bucket
   * @param {Buffer} fileBuffer - File content as buffer
   * @param {string} fileName - File name
   * @param {string} contentType - MIME type
   * @param {string} documentId - Document identifier
   * @returns {Promise<Object>} Upload result
   */
  async uploadOutput(fileBuffer, fileName, contentType, documentId) {
    try {
      if (!this.outputsBucket) {
        throw new Error('S3_OUTPUTS_BUCKET or OUTPUTS_BUCKET environment variable is not set. Please configure it in your environment variables.');
      }

      const sanitizedName = this.sanitizeFileName(fileName);
      const s3Key = `outputs/${documentId}/${sanitizedName}`;

      const command = new PutObjectCommand({
        Bucket: this.outputsBucket,
        Key: s3Key,
        Body: fileBuffer,
        ContentType: contentType,
        Metadata: {
          documentId: documentId,
          generatedAt: new Date().toISOString()
        }
      });

      await this.client.send(command);

      logger.info('Output uploaded to S3', {
        bucket: this.outputsBucket,
        key: s3Key,
        documentId
      });

      return {
        s3Key,
        bucket: this.outputsBucket,
        fileName: sanitizedName
      };
    } catch (error) {
      logger.error('S3 output upload failed', error);
      throw new Error(`Failed to upload output to S3: ${error.message}`);
    }
  }

  /**
   * Generate a presigned URL for downloading a file
   * @param {string} bucket - S3 bucket name
   * @param {string} key - S3 object key
   * @param {number} expiresIn - URL expiration time in seconds (default: 3600 = 1 hour)
   * @returns {Promise<string>} Presigned URL
   */
  async getPresignedUrl(bucket, key, expiresIn = 3600) {
    try {
      const command = new GetObjectCommand({
        Bucket: bucket,
        Key: key
      });

      const url = await getSignedUrl(this.client, command, { expiresIn });

      logger.info('Presigned URL generated', {
        bucket,
        key,
        expiresIn
      });

      return url;
    } catch (error) {
      logger.error('Failed to generate presigned URL', error);
      throw new Error(`Failed to generate presigned URL: ${error.message}`);
    }
  }

  /**
   * Check if an object exists in S3
   * @param {string} bucket - S3 bucket name
   * @param {string} key - S3 object key
   * @returns {Promise<boolean>} True if object exists
   */
  async objectExists(bucket, key) {
    try {
      const command = new HeadObjectCommand({
        Bucket: bucket,
        Key: key
      });

      await this.client.send(command);
      return true;
    } catch (error) {
      if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
        return false;
      }
      throw error;
    }
  }

  /**
   * Get object metadata from S3
   * @param {string} bucket - S3 bucket name
   * @param {string} key - S3 object key
   * @returns {Promise<Object>} Object metadata
   */
  async getObjectMetadata(bucket, key) {
    try {
      const command = new HeadObjectCommand({
        Bucket: bucket,
        Key: key
      });

      const response = await this.client.send(command);

      return {
        contentType: response.ContentType,
        contentLength: response.ContentLength,
        lastModified: response.LastModified,
        metadata: response.Metadata
      };
    } catch (error) {
      logger.error('Failed to get object metadata', error);
      throw new Error(`Failed to get object metadata: ${error.message}`);
    }
  }

  /**
   * Sanitize file name to remove unsafe characters
   * @param {string} fileName - Original file name
   * @returns {string} Sanitized file name
   */
  sanitizeFileName(fileName) {
    // Remove path traversal attempts and unsafe characters
    const sanitized = fileName
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .replace(/\.\./g, '_')
      .replace(/^_+|_+$/g, '');

    // Ensure it's not empty
    if (!sanitized) {
      return 'document';
    }

    return sanitized;
  }
}

// Export singleton instance
export default new S3Service();

