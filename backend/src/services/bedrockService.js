/**
 * Bedrock Service
 * Handles interactions with Claude models via Amazon Bedrock
 */

import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { logger } from '../utils/logger.js';
import { BEDROCK_MODELS } from '../utils/constants.js';

class BedrockService {
  constructor() {
    const region = process.env.AWS_REGION || process.env.REGION || 'us-east-1';
    
    this.client = new BedrockRuntimeClient({
      region
    });
    
    // Use Claude 3.5 Sonnet (latest) or fallback to 3 Sonnet
    this.modelId = process.env.BEDROCK_MODEL_ID || BEDROCK_MODELS.CLAUDE_3_5_SONNET;
    this.defaultMaxTokens = 4096;
    this.defaultTemperature = 0.3;
    this.maxRetries = 3;
    
    logger.info('BedrockService initialized', {
      region,
      modelId: this.modelId
    });
  }

  /**
   * Validate model ID
   * @param {string} modelId - Model ID to validate
   * @returns {boolean} True if valid
   */
  validateModelId(modelId) {
    if (!modelId || typeof modelId !== 'string') {
      throw new Error('Model ID must be a non-empty string');
    }
    
    // Check if it's a Claude model
    if (!modelId.startsWith('anthropic.claude-')) {
      throw new Error(`Invalid model ID: ${modelId}. Must be a Claude model.`);
    }
    
    return true;
  }

  /**
   * Invoke Claude model
   * @param {string} systemPrompt - System prompt/instructions
   * @param {string} userPrompt - User prompt/content
   * @param {Object} options - Additional options (temperature, maxTokens, modelId)
   * @returns {Promise<string>} AI response text
   */
  async invokeClaude(systemPrompt, userPrompt, options = {}) {
    try {
      const {
        temperature = this.defaultTemperature,
        maxTokens = this.defaultMaxTokens,
        modelId = this.modelId
      } = options;

      // Validate inputs
      if (!systemPrompt || typeof systemPrompt !== 'string' || systemPrompt.trim().length === 0) {
        throw new Error('System prompt must be a non-empty string');
      }
      if (!userPrompt || typeof userPrompt !== 'string' || userPrompt.trim().length === 0) {
        throw new Error('User prompt must be a non-empty string');
      }

      this.validateModelId(modelId);

      // Prepare request body
      const requestBody = {
        anthropic_version: 'bedrock-2023-05-31',
        max_tokens: maxTokens,
        temperature: Math.max(0, Math.min(1, temperature)), // Clamp between 0 and 1
        system: systemPrompt.trim(),
        messages: [
          {
            role: 'user',
            content: userPrompt.trim()
          }
        ]
      };

      const input = {
        modelId: modelId,
        contentType: 'application/json',
        accept: 'application/json',
        body: JSON.stringify(requestBody)
      };

      logger.debug('Invoking Claude model', {
        modelId,
        systemPromptLength: systemPrompt.length,
        userPromptLength: userPrompt.length,
        temperature,
        maxTokens
      });

      const command = new InvokeModelCommand(input);
      const response = await this.client.send(command);

      // Parse response
      const responseBody = JSON.parse(new TextDecoder().decode(response.body));

      if (!responseBody.content || !Array.isArray(responseBody.content) || responseBody.content.length === 0) {
        throw new Error('Invalid response format from Claude model');
      }

      const responseText = responseBody.content[0].text;

      logger.info('Claude model invoked successfully', {
        modelId,
        responseLength: responseText.length,
        usage: responseBody.usage
      });

      return responseText;
    } catch (error) {
      logger.error('Bedrock invocation failed', {
        error: error.message,
        modelId: options.modelId || this.modelId,
        statusCode: error.$metadata?.httpStatusCode
      });

      // Handle specific AWS errors
      if (error.name === 'ValidationException' || error.$metadata?.httpStatusCode === 400) {
        throw new Error(`Invalid request to Bedrock: ${error.message}`);
      }
      if (error.name === 'AccessDeniedException' || error.$metadata?.httpStatusCode === 403) {
        throw new Error('Access denied to Bedrock. Check IAM permissions and model access.');
      }
      if (error.name === 'ThrottlingException' || error.$metadata?.httpStatusCode === 429) {
        throw new Error('Rate limit exceeded. Please try again later.');
      }
      if (error.name === 'ModelNotReadyException' || error.$metadata?.httpStatusCode === 409) {
        throw new Error('Model is not ready. Please try again in a moment.');
      }
      if (error.name === 'ServiceQuotaExceededException') {
        throw new Error('Service quota exceeded. Please check your Bedrock quotas.');
      }

      throw new Error(`Failed to invoke Claude: ${error.message}`);
    }
  }

  /**
   * Invoke Claude with retry logic and exponential backoff
   * @param {string} systemPrompt - System prompt/instructions
   * @param {string} userPrompt - User prompt/content
   * @param {Object} options - Additional options (temperature, maxTokens, modelId, maxRetries)
   * @returns {Promise<string>} AI response text
   */
  async invokeWithRetry(systemPrompt, userPrompt, options = {}) {
    const {
      maxRetries = this.maxRetries,
      ...invokeOptions
    } = options;

    let lastError;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await this.invokeClaude(systemPrompt, userPrompt, invokeOptions);
      } catch (error) {
        lastError = error;

        // Check if error is retryable
        const isRetryable = 
          error.name === 'ThrottlingException' ||
          error.$metadata?.httpStatusCode === 429 ||
          error.$metadata?.httpStatusCode >= 500 ||
          error.message.includes('rate limit') ||
          error.message.includes('timeout') ||
          error.message.includes('network');

        if (isRetryable && attempt < maxRetries) {
          // Exponential backoff: 2^attempt seconds
          const delay = Math.pow(2, attempt) * 1000;
          logger.warn(`Bedrock invocation failed, retrying in ${delay}ms (attempt ${attempt}/${maxRetries})`, {
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
    throw lastError || new Error('Failed to invoke Claude after retries');
  }

  /**
   * Invoke Claude and parse JSON response
   * @param {string} systemPrompt - System prompt/instructions
   * @param {string} userPrompt - User prompt/content
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} Parsed JSON response
   */
  async invokeAndParseJSON(systemPrompt, userPrompt, options = {}) {
    try {
      const responseText = await this.invokeWithRetry(systemPrompt, userPrompt, options);

      // Try to extract JSON from response (handle markdown code blocks)
      let jsonText = responseText.trim();

      // Remove markdown code blocks if present
      const jsonMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        jsonText = jsonMatch[1].trim();
      }

      // Parse JSON
      const parsed = JSON.parse(jsonText);

      logger.debug('Parsed JSON response from Claude', {
        keys: Object.keys(parsed)
      });

      return parsed;
    } catch (error) {
      logger.error('Failed to parse JSON response from Claude', error);
      throw new Error(`Failed to parse JSON response: ${error.message}`);
    }
  }

  /**
   * Invoke Claude with streaming response (for future use)
   * @param {string} systemPrompt - System prompt/instructions
   * @param {string} userPrompt - User prompt/content
   * @param {Object} options - Additional options
   * @returns {Promise<ReadableStream>} Streaming response
   */
  async invokeStream(systemPrompt, userPrompt, options = {}) {
    try {
      const {
        temperature = this.defaultTemperature,
        maxTokens = this.defaultMaxTokens,
        modelId = this.modelId
      } = options;

      if (!systemPrompt || typeof systemPrompt !== 'string' || systemPrompt.trim().length === 0) {
        throw new Error('System prompt must be a non-empty string');
      }
      if (!userPrompt || typeof userPrompt !== 'string' || userPrompt.trim().length === 0) {
        throw new Error('User prompt must be a non-empty string');
      }

      this.validateModelId(modelId);

      const requestBody = {
        anthropic_version: 'bedrock-2023-05-31',
        max_tokens: maxTokens,
        temperature: Math.max(0, Math.min(1, temperature)),
        system: systemPrompt.trim(),
        messages: [
          {
            role: 'user',
            content: userPrompt.trim()
          }
        ]
      };

      // Note: For streaming, use InvokeModelWithResponseStreamCommand
      // This is a placeholder for future implementation
      throw new Error('Streaming not yet implemented. Use invokeClaude or invokeWithRetry instead.');
    } catch (error) {
      logger.error('Bedrock streaming invocation failed', error);
      throw error;
    }
  }
}

// Export singleton instance
export default new BedrockService();

