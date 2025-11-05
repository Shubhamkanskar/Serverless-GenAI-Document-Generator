/**
 * Gemini Service
 * Handles interactions with Google Gemini models for AI content generation
 * Replaces BedrockService for Claude
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { logger } from '../utils/logger.js';

class GeminiService {
  constructor() {
    const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
    
    if (!apiKey) {
      logger.warn('GOOGLE_API_KEY or GEMINI_API_KEY not found in environment variables');
    }

    this.client = new GoogleGenerativeAI(apiKey);
    
    // Use Gemini 2.0 Flash (faster, cheaper, latest model)
    // Can be overridden via GEMINI_MODEL environment variable
    this.modelName = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
    this.defaultMaxTokens = 4096;
    this.defaultTemperature = 0.3;
    this.maxRetries = 3;
    
    // Initialize model
    this.model = this.client.getGenerativeModel({
      model: this.modelName,
      generationConfig: {
        maxOutputTokens: this.defaultMaxTokens,
        temperature: this.defaultTemperature
      }
    });
    
    logger.info('GeminiService initialized', {
      model: this.modelName,
      maxTokens: this.defaultMaxTokens,
      temperature: this.defaultTemperature
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
   * Invoke Gemini model
   * @param {string} systemPrompt - System prompt/instructions
   * @param {string} userPrompt - User prompt/content
   * @param {Object} options - Additional options (temperature, maxTokens, modelName)
   * @returns {Promise<string>} AI response text
   */
  async invokeGemini(systemPrompt, userPrompt, options = {}) {
    try {
      this.validateApiKey();

      const {
        temperature = this.defaultTemperature,
        maxTokens = this.defaultMaxTokens,
        modelName = this.modelName
      } = options;

      // Validate inputs
      if (!systemPrompt || typeof systemPrompt !== 'string' || systemPrompt.trim().length === 0) {
        throw new Error('System prompt must be a non-empty string');
      }
      if (!userPrompt || typeof userPrompt !== 'string' || userPrompt.trim().length === 0) {
        throw new Error('User prompt must be a non-empty string');
      }

      // Get model with custom config if needed
      let model = this.model;
      if (temperature !== this.defaultTemperature || maxTokens !== this.defaultMaxTokens || modelName !== this.modelName) {
        model = this.client.getGenerativeModel({
          model: modelName,
          generationConfig: {
            maxOutputTokens: maxTokens,
            temperature: Math.max(0, Math.min(2, temperature)) // Gemini supports 0-2
          },
          systemInstruction: systemPrompt.trim()
        });
      } else {
        // Update model with system instruction if not already set
        model = this.client.getGenerativeModel({
          model: this.modelName,
          generationConfig: {
            maxOutputTokens: this.defaultMaxTokens,
            temperature: this.defaultTemperature
          },
          systemInstruction: systemPrompt.trim()
        });
      }

      logger.debug('Invoking Gemini model', {
        modelName,
        systemPromptLength: systemPrompt.length,
        userPromptLength: userPrompt.length,
        temperature,
        maxTokens
      });

      // Combine system and user prompts for Gemini
      // Gemini handles system instruction separately, but we can also include it in the prompt
      const prompt = `${systemPrompt}\n\n${userPrompt}`;

      const result = await model.generateContent(prompt);
      const response = await result.response;
      const responseText = response.text();

      logger.info('Gemini model invoked successfully', {
        modelName,
        responseLength: responseText.length,
        usageMetadata: response.usageMetadata
      });

      return responseText;
    } catch (error) {
      logger.error('Gemini invocation failed', {
        error: error.message,
        modelName: options.modelName || this.modelName,
        statusCode: error.status
      });

      // Handle specific Google API errors
      if (error.status === 400) {
        throw new Error(`Invalid request to Gemini API: ${error.message}`);
      }
      if (error.status === 401 || error.status === 403) {
        throw new Error('Invalid or missing Google API key. Please check your GOOGLE_API_KEY.');
      }
      if (error.status === 429) {
        throw new Error('Rate limit exceeded. Please try again later.');
      }
      if (error.status === 503) {
        throw new Error('Gemini service is temporarily unavailable. Please try again later.');
      }

      throw new Error(`Failed to invoke Gemini: ${error.message}`);
    }
  }

  /**
   * Invoke Gemini with retry logic and exponential backoff
   * @param {string} systemPrompt - System prompt/instructions
   * @param {string} userPrompt - User prompt/content
   * @param {Object} options - Additional options (temperature, maxTokens, modelName, maxRetries)
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
        return await this.invokeGemini(systemPrompt, userPrompt, invokeOptions);
      } catch (error) {
        lastError = error;

        // Check if error is retryable
        const isRetryable = 
          error.status === 429 ||
          error.status >= 500 ||
          error.message.includes('rate limit') ||
          error.message.includes('timeout') ||
          error.message.includes('network') ||
          error.message.includes('temporarily unavailable');

        if (isRetryable && attempt < maxRetries) {
          // Exponential backoff: 2^attempt seconds
          const delay = Math.pow(2, attempt) * 1000;
          logger.warn(`Gemini invocation failed, retrying in ${delay}ms (attempt ${attempt}/${maxRetries})`, {
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
    throw lastError || new Error('Failed to invoke Gemini after retries');
  }

  /**
   * Invoke Gemini and parse JSON response
   * @param {string} systemPrompt - System prompt/instructions
   * @param {string} userPrompt - User prompt/content
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} Parsed JSON response
   */
  async invokeAndParseJSON(systemPrompt, userPrompt, options = {}) {
    try {
      const responseText = await this.invokeWithRetry(systemPrompt, userPrompt, options);

      // Log the raw response for debugging
      logger.debug('Raw Gemini response', {
        responseLength: responseText.length,
        responsePreview: responseText.substring(0, 200)
      });

      // Check if response is empty
      if (!responseText || responseText.trim().length === 0) {
        logger.error('Gemini returned empty response');
        throw new Error('AI returned an empty response. Please try again.');
      }

      // Try to extract JSON from response (handle markdown code blocks)
      let jsonText = responseText.trim();

      // Remove markdown code blocks if present
      const jsonMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        jsonText = jsonMatch[1].trim();
        logger.debug('Extracted JSON from markdown code block');
      }

      // Additional cleanup: remove any leading/trailing non-JSON content
      // Find the first { or [ and last } or ]
      const startMatch = jsonText.match(/[{\[]/);
      const endMatch = jsonText.match(/[}\]]/g);
      
      if (startMatch && endMatch && endMatch.length > 0) {
        const startIndex = jsonText.indexOf(startMatch[0]);
        const endIndex = jsonText.lastIndexOf(endMatch[endMatch.length - 1]);
        
        if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
          jsonText = jsonText.substring(startIndex, endIndex + 1);
          logger.debug('Extracted JSON boundaries', {
            startIndex,
            endIndex,
            extractedLength: jsonText.length
          });
        }
      }

      // Log what we're about to parse
      logger.debug('Attempting to parse JSON', {
        jsonLength: jsonText.length,
        jsonPreview: jsonText.substring(0, 100)
      });

      // Parse JSON
      let parsed;
      try {
        parsed = JSON.parse(jsonText);
      } catch (parseError) {
        logger.error('JSON parse error', {
          error: parseError.message,
          jsonText: jsonText.substring(0, 500) // Log first 500 chars
        });
        throw new Error(`Invalid JSON from AI: ${parseError.message}. Response preview: ${jsonText.substring(0, 100)}`);
      }

      logger.info('Successfully parsed JSON response from Gemini', {
        keys: Object.keys(parsed),
        dataSize: JSON.stringify(parsed).length
      });

      return parsed;
    } catch (error) {
      logger.error('Failed to parse JSON response from Gemini', {
        error: error.message,
        stack: error.stack
      });
      
      // Provide more helpful error message
      if (error.message.includes('Unexpected end')) {
        throw new Error('AI response was incomplete. This may be due to rate limiting or response size. Please try again with a smaller document or simpler request.');
      }
      
      throw new Error(`Failed to parse AI response: ${error.message}`);
    }
  }
}

// Export singleton instance
export default new GeminiService();

