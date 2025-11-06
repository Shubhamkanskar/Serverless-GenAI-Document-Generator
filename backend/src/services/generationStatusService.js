/**
 * Generation Status Service
 * Manages document generation status tracking using DynamoDB
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { logger } from '../utils/logger.js';

class GenerationStatusService {
  constructor() {
    const region = process.env.AWS_REGION || process.env.REGION || 'us-east-1';
    const client = new DynamoDBClient({ region });
    this.docClient = DynamoDBDocumentClient.from(client);

    // Table name from environment or default
    this.tableName = process.env.GENERATION_STATUS_TABLE || 'genai-generation-status';

    logger.info('GenerationStatusService initialized', {
      region,
      tableName: this.tableName
    });
  }

  /**
   * Create initial generation status
   * @param {string} generationId - Generation identifier
   * @param {Object} params - Generation parameters
   * @returns {Promise<Object>} Status record
   */
  async createStatus(generationId, params = {}) {
    try {
      const now = new Date().toISOString();
      const statusRecord = {
        generationId,
        status: 'queued',
        progress: 0,
        currentStep: 'initializing',
        message: 'Generation queued',
        createdAt: now,
        updatedAt: now,
        ...params
      };

      await this.docClient.send(new PutCommand({
        TableName: this.tableName,
        Item: statusRecord
      }));

      logger.info('Created generation status', { generationId, status: 'queued' });
      return statusRecord;
    } catch (error) {
      logger.error('Failed to create generation status', error);
      throw new Error(`Failed to create generation status: ${error.message}`);
    }
  }

  /**
   * Get generation status with estimated time
   * @param {string} generationId - Generation identifier
   * @returns {Promise<Object|null>} Status record or null if not found
   */
  async getStatus(generationId) {
    try {
      const result = await this.docClient.send(new GetCommand({
        TableName: this.tableName,
        Key: { generationId }
      }));

      if (!result.Item) {
        logger.warn('Generation status not found', { generationId });
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
      logger.error('Failed to get generation status', error);
      throw new Error(`Failed to get generation status: ${error.message}`);
    }
  }

  /**
   * Update generation status
   * @param {string} generationId - Generation identifier
   * @param {Object} updates - Status updates
   * @returns {Promise<Object>} Updated status record
   */
  async updateStatus(generationId, updates) {
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
        Key: { generationId },
        UpdateExpression: `SET ${updateExpressions.join(', ')}`,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues,
        ReturnValues: 'ALL_NEW'
      }));

      logger.info('Updated generation status', {
        generationId,
        status: updates.status,
        currentStep: updates.currentStep
      });

      return result.Attributes;
    } catch (error) {
      logger.error('Failed to update generation status', error);
      throw new Error(`Failed to update generation status: ${error.message}`);
    }
  }

  /**
   * Mark generation as completed
   * @param {string} generationId - Generation identifier
   * @param {Object} result - Generation result (downloadUrl, fileId, etc.)
   * @returns {Promise<Object>} Updated status record
   */
  async markCompleted(generationId, result = {}) {
    const now = new Date().toISOString();
    return this.updateStatus(generationId, {
      status: 'completed',
      currentStep: 'completed',
      progress: 100,
      message: 'Document generated successfully',
      completedAt: now,
      ...result
    });
  }

  /**
   * Mark generation as failed
   * @param {string} generationId - Generation identifier
   * @param {string} errorMessage - Error message
   * @param {string} currentStep - Step where failure occurred
   * @returns {Promise<Object>} Updated status record
   */
  async markFailed(generationId, errorMessage, currentStep) {
    const now = new Date().toISOString();
    return this.updateStatus(generationId, {
      status: 'failed',
      currentStep,
      message: errorMessage,
      failedAt: now,
      error: errorMessage
    });
  }
}

// Export singleton instance
export default new GenerationStatusService();
