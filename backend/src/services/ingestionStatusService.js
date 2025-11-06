/**
 * Ingestion Status Service
 * Manages ingestion status tracking using DynamoDB
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { logger } from '../utils/logger.js';

class IngestionStatusService {
  constructor() {
    const region = process.env.AWS_REGION || process.env.REGION || 'us-east-1';
    const client = new DynamoDBClient({ region });
    this.docClient = DynamoDBDocumentClient.from(client);

    // Table name from environment or default
    this.tableName = process.env.INGESTION_STATUS_TABLE || 'genai-ingestion-status';

    logger.info('IngestionStatusService initialized', {
      region,
      tableName: this.tableName
    });
  }

  /**
   * Create initial ingestion status
   * @param {string} fileId - File identifier
   * @param {string} s3Key - S3 key
   * @param {Object} metadata - Additional metadata
   * @returns {Promise<Object>} Status record
   */
  async createStatus(fileId, s3Key, metadata = {}) {
    try {
      const now = new Date().toISOString();
      const statusRecord = {
        fileId,
        s3Key,
        status: 'queued',
        progress: 0,
        totalChunks: 0,
        processedChunks: 0,
        currentStep: 'initializing',
        message: 'Ingestion queued',
        createdAt: now,
        updatedAt: now,
        ...metadata
      };

      await this.docClient.send(new PutCommand({
        TableName: this.tableName,
        Item: statusRecord
      }));

      logger.info('Created ingestion status', { fileId, status: 'queued' });
      return statusRecord;
    } catch (error) {
      logger.error('Failed to create ingestion status', error);
      throw new Error(`Failed to create ingestion status: ${error.message}`);
    }
  }

  /**
   * Get ingestion status with estimated time
   * @param {string} fileId - File identifier
   * @returns {Promise<Object|null>} Status record or null if not found
   */
  async getStatus(fileId) {
    try {
      const result = await this.docClient.send(new GetCommand({
        TableName: this.tableName,
        Key: { fileId }
      }));

      if (!result.Item) {
        logger.warn('Ingestion status not found', { fileId });
        return null;
      }

      const status = result.Item;

      // Calculate estimated time remaining if processing
      if (status.status === 'processing' && status.progress > 0) {
        const now = new Date();
        const startTime = new Date(status.createdAt);
        const elapsedMs = now - startTime;
        const elapsedSeconds = Math.floor(elapsedMs / 1000);

        // Calculate estimated total time and remaining time
        const estimatedTotalSeconds = Math.round((elapsedSeconds / status.progress) * 100);
        const estimatedRemainingSeconds = Math.max(0, estimatedTotalSeconds - elapsedSeconds);

        status.elapsedTime = elapsedSeconds;
        status.estimatedTimeRemaining = estimatedRemainingSeconds;
        status.estimatedTotalTime = estimatedTotalSeconds;
      }

      return status;
    } catch (error) {
      logger.error('Failed to get ingestion status', error);
      throw new Error(`Failed to get ingestion status: ${error.message}`);
    }
  }

  /**
   * Update ingestion status
   * @param {string} fileId - File identifier
   * @param {Object} updates - Status updates
   * @returns {Promise<Object>} Updated status record
   */
  async updateStatus(fileId, updates) {
    try {
      const now = new Date().toISOString();

      // Build update expression
      const updateExpressions = [];
      const expressionAttributeNames = {};
      const expressionAttributeValues = {};

      // Always update updatedAt
      updateExpressions.push('#updatedAt = :updatedAt');
      expressionAttributeNames['#updatedAt'] = 'updatedAt';
      expressionAttributeValues[':updatedAt'] = now;

      // Add other updates
      Object.entries(updates).forEach(([key, value]) => {
        updateExpressions.push(`#${key} = :${key}`);
        expressionAttributeNames[`#${key}`] = key;
        expressionAttributeValues[`:${key}`] = value;
      });

      const result = await this.docClient.send(new UpdateCommand({
        TableName: this.tableName,
        Key: { fileId },
        UpdateExpression: `SET ${updateExpressions.join(', ')}`,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues,
        ReturnValues: 'ALL_NEW'
      }));

      logger.info('Updated ingestion status', {
        fileId,
        status: updates.status,
        currentStep: updates.currentStep
      });

      return result.Attributes;
    } catch (error) {
      logger.error('Failed to update ingestion status', error);
      throw new Error(`Failed to update ingestion status: ${error.message}`);
    }
  }

  /**
   * Update progress during processing
   * @param {string} fileId - File identifier
   * @param {string} currentStep - Current processing step
   * @param {number} progress - Progress percentage (0-100)
   * @param {number} processedChunks - Number of chunks processed
   * @param {number} totalChunks - Total number of chunks
   * @param {string} message - Status message
   * @returns {Promise<Object>} Updated status record
   */
  async updateProgress(fileId, currentStep, progress, processedChunks, totalChunks, message) {
    return this.updateStatus(fileId, {
      status: 'processing',
      currentStep,
      progress: Math.round(progress),
      processedChunks,
      totalChunks,
      message
    });
  }

  /**
   * Mark ingestion as completed
   * @param {string} fileId - File identifier
   * @param {Object} result - Processing result
   * @returns {Promise<Object>} Updated status record
   */
  async markCompleted(fileId, result = {}) {
    const now = new Date().toISOString();
    return this.updateStatus(fileId, {
      status: 'completed',
      currentStep: 'completed',
      progress: 100,
      message: 'Ingestion completed successfully',
      completedAt: now,
      ...result
    });
  }

  /**
   * Mark ingestion as failed
   * @param {string} fileId - File identifier
   * @param {string} errorMessage - Error message
   * @param {string} currentStep - Step where failure occurred
   * @returns {Promise<Object>} Updated status record
   */
  async markFailed(fileId, errorMessage, currentStep) {
    const now = new Date().toISOString();
    return this.updateStatus(fileId, {
      status: 'failed',
      currentStep,
      message: errorMessage,
      failedAt: now,
      error: errorMessage
    });
  }
}

// Export singleton instance
export default new IngestionStatusService();
