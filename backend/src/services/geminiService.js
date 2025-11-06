/**
 * Gemini Service
 * Handles interactions with Google Gemini models for AI content generation
 * Replaces BedrockService for Claude
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { logger } from '../utils/logger.js';
import { geminiRateLimiter } from '../utils/rateLimiter.js';

class GeminiService {
  constructor() {
    const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;

    if (!apiKey) {
      logger.warn('GOOGLE_API_KEY or GEMINI_API_KEY not found in environment variables');
    }

    this.client = new GoogleGenerativeAI(apiKey);

    // Use Gemini 2.5 Flash (latest model, 1.5 is deprecated)
    // Valid models: gemini-2.5-flash, gemini-1.5-pro, gemini-pro, gemini-2.0-flash-exp
    // Can be overridden via GEMINI_MODEL environment variable
    this.modelName = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
    // Gemini 2.5 Flash supports up to 8192 output tokens
    // Default to 8192 (maximum) to prevent truncation
    // For faster responses, set lower via GEMINI_MAX_TOKENS env var
    this.defaultMaxTokens = parseInt(process.env.GEMINI_MAX_TOKENS) || 8192;
    this.defaultTemperature = 0.3;
    this.maxRetries = 3;

    // Validate model name
    this.validateModelName(this.modelName);

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
   * Validate model name
   * @param {string} modelName - Model name to validate
   * @returns {boolean} True if model name is valid
   */
  validateModelName(modelName) {
    const validModels = [
      'gemini-2.5-flash',
      'gemini-1.5-flash', // Deprecated but still supported
      'gemini-1.5-pro',
      'gemini-pro',
      'gemini-2.0-flash-exp'
    ];

    if (validModels.includes(modelName)) {
      return true;
    }

    logger.warn(`Model name "${modelName}" may not be valid. Valid models: ${validModels.join(', ')}`);
    return false; // Don't throw, just warn - let API handle validation
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

      // Validate model name if different from default
      if (modelName !== this.modelName) {
        this.validateModelName(modelName);
      }

      // Validate maxTokens is within Gemini limits (1-8192 for Flash models)
      const validMaxTokens = Math.min(Math.max(1, maxTokens), 8192);
      if (validMaxTokens !== maxTokens) {
        logger.warn(`maxTokens adjusted from ${maxTokens} to ${validMaxTokens} (Gemini Flash limit)`);
      }

      // Get model with custom config if needed
      let model = this.model;
      if (temperature !== this.defaultTemperature || maxTokens !== this.defaultMaxTokens || modelName !== this.modelName) {
        model = this.client.getGenerativeModel({
          model: modelName,
          generationConfig: {
            maxOutputTokens: validMaxTokens,
            temperature: Math.max(0, Math.min(2, temperature)) // Gemini supports 0-2
          },
          systemInstruction: systemPrompt.trim()
        });
      } else {
        // Update model with system instruction if not already set
        model = this.client.getGenerativeModel({
          model: this.modelName,
          generationConfig: {
            maxOutputTokens: validMaxTokens,
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

      // Use ONLY user prompt - system instruction is handled separately via systemInstruction parameter
      // This prevents duplication and reduces token usage
      // IMPORTANT: This is a single, non-streaming API call - we get the complete response in one go
      const prompt = userPrompt.trim();

      // Log prompt size to help debug truncation issues
      logger.debug('Sending request to Gemini', {
        promptLength: prompt.length,
        systemPromptLength: systemPrompt.length,
        maxOutputTokens: validMaxTokens,
        estimatedTokens: Math.ceil(prompt.length / 4) // Rough estimate: ~4 chars per token
      });

      // Use rate limiter to prevent hitting API limits
      let result;
      let response;
      try {
        result = await geminiRateLimiter.execute(async () => {
          return await model.generateContent(prompt);
        });
        response = await result.response;
      } catch (apiError) {
        // Catch API errors (invalid model, authentication, etc.)
        logger.error('Gemini API call failed', {
          error: apiError.message,
          status: apiError.status,
          statusText: apiError.statusText,
          modelName,
          promptLength: prompt.length
        });

        // Handle specific API errors
        if (apiError.message?.includes('model') || apiError.message?.includes('not found')) {
          throw new Error(`Invalid Gemini model: ${modelName}. Please check GEMINI_MODEL environment variable. Valid models: gemini-2.5-flash, gemini-1.5-pro, gemini-pro`);
        }
        if (apiError.status === 400) {
          throw new Error(`Invalid request to Gemini API: ${apiError.message}. Check your model name and prompt format.`);
        }
        if (apiError.status === 401 || apiError.status === 403) {
          throw new Error('Invalid or missing Google API key. Please check your GOOGLE_API_KEY or GEMINI_API_KEY.');
        }
        throw apiError;
      }

      // Check if response has candidates
      if (!response.candidates || response.candidates.length === 0) {
        logger.error('Gemini response has no candidates', {
          modelName,
          promptPreview: prompt.substring(0, 200),
          responseMetadata: response.promptFeedback,
          usageMetadata: response.usageMetadata
        });

        // Check for prompt feedback that might indicate why there are no candidates
        if (response.promptFeedback) {
          if (response.promptFeedback.blockReason) {
            throw new Error(`Request was blocked: ${response.promptFeedback.blockReason}. Please adjust your query.`);
          }
          if (response.promptFeedback.safetyRatings) {
            const highSafetyRatings = response.promptFeedback.safetyRatings.filter(r => r.probability === 'HIGH');
            if (highSafetyRatings.length > 0) {
              const blockedCategories = highSafetyRatings.map(r => r.category).join(', ');
              throw new Error(`Request was blocked by safety filters (${blockedCategories}). Please adjust your query or content.`);
            }
          }
        }

        throw new Error('AI returned no response candidates. This may be due to content filtering, invalid model name, or an API issue. Please check your GEMINI_MODEL setting and try again.');
      }

      // Check for safety blocks before extracting text
      if (response.candidates && response.candidates.length > 0) {
        const candidate = response.candidates[0];

        // Check if response was blocked by safety filters
        if (candidate.finishReason === 'SAFETY') {
          logger.error('Gemini response blocked by safety filters', {
            safetyRatings: candidate.safetyRatings
          });
          throw new Error('Response was blocked by safety filters. Please adjust your query or content.');
        }

        if (candidate.finishReason === 'RECITATION') {
          logger.error('Gemini response blocked due to recitation', {
            finishReason: candidate.finishReason
          });
          throw new Error('Response was blocked due to potential content recitation. Please try a different query.');
        }

        if (candidate.finishReason === 'OTHER' || candidate.finishReason === 'MAX_TOKENS') {
          logger.warn('Gemini response finished with reason', {
            finishReason: candidate.finishReason
          });
        }
      }

      // Extract FULL text from response in one go (not streaming)
      // response.text() gets all text from all parts in one call
      let responseText;
      try {
        // Get the complete response text in one call - this is not streaming
        responseText = response.text();

        // Log response info for debugging
        if (response.candidates && response.candidates.length > 0) {
          const candidate = response.candidates[0];
          logger.debug('Response extraction', {
            finishReason: candidate.finishReason,
            textLength: responseText.length,
            usageMetadata: response.usageMetadata
          });

          // If finishReason is MAX_TOKENS, the response was truncated
          if (candidate.finishReason === 'MAX_TOKENS') {
            logger.warn('Response hit MAX_TOKENS limit - response may be incomplete', {
              textLength: responseText.length,
              maxTokens: validMaxTokens,
              usageMetadata: response.usageMetadata
            });
          }
        }
      } catch (textError) {
        // response.text() might throw if no candidates or content
        const candidate = response.candidates?.[0];
        logger.error('Failed to extract text from Gemini response', {
          error: textError.message,
          hasCandidates: !!(response.candidates && response.candidates.length > 0),
          candidatesCount: response.candidates?.length || 0,
          finishReason: candidate?.finishReason,
          safetyRatings: candidate?.safetyRatings,
          contentParts: candidate?.content?.parts?.length || 0,
          modelName
        });

        // Check if it's a safety block
        if (response.candidates && response.candidates.length > 0) {
          if (candidate.safetyRatings && candidate.safetyRatings.some(r => r.probability === 'HIGH')) {
            const blockedCategories = candidate.safetyRatings
              .filter(r => r.probability === 'HIGH')
              .map(r => r.category)
              .join(', ');
            throw new Error(`Response was blocked by safety filters (${blockedCategories}). Please adjust your query or content.`);
          }
          if (candidate.finishReason === 'SAFETY') {
            throw new Error('Response was blocked by safety filters. Please adjust your query or content.');
          }
          if (candidate.finishReason === 'RECITATION') {
            throw new Error('Response was blocked due to potential content recitation. Please try a different query.');
          }
        }

        throw new Error(`Failed to extract text from AI response (${textError.message}). The response may be empty, blocked, or the model may not be available.`);
      }

      // Validate response text is not empty
      if (!responseText || typeof responseText !== 'string' || responseText.trim().length === 0) {
        const candidate = response.candidates?.[0];
        logger.error('Gemini returned empty text response', {
          modelName,
          hasCandidates: !!(response.candidates && response.candidates.length > 0),
          finishReason: candidate?.finishReason,
          safetyRatings: candidate?.safetyRatings,
          contentParts: candidate?.content?.parts?.length || 0,
          promptLength: prompt.length,
          usageMetadata: response.usageMetadata
        });

        // Provide more specific error message
        if (candidate?.finishReason === 'SAFETY') {
          throw new Error('Response was blocked by safety filters. Please adjust your query or content.');
        }
        if (candidate?.finishReason === 'MAX_TOKENS') {
          // Log usage to help debug
          const usage = response.usageMetadata;
          const receivedTokens = usage?.candidatesTokenCount || usage?.totalTokenCount || 'unknown';
          logger.error('Response truncated - MAX_TOKENS reached', {
            maxTokens: validMaxTokens,
            receivedTokens,
            promptTokens: usage?.promptTokenCount,
            totalTokens: usage?.totalTokenCount,
            responseLength: responseText?.length || 0
          });
          const maxAvailable = 8192;
          if (validMaxTokens >= maxAvailable) {
            throw new Error(`Response was truncated at ${validMaxTokens} tokens. Received ${receivedTokens} tokens. Maximum available is ${maxAvailable}. Try reducing context size (MAX_CONTEXT_CHARS) or splitting into more chunks.`);
          } else {
            throw new Error(`Response was truncated at ${validMaxTokens} tokens. Received ${receivedTokens} tokens. Maximum available is ${maxAvailable}. Consider increasing maxTokens or reducing context size (MAX_CONTEXT_CHARS).`);
          }
        }

        throw new Error(`AI returned an empty response. Model: ${modelName}, FinishReason: ${candidate?.finishReason || 'unknown'}. This may be due to content filtering, invalid model, or an API issue. Please check your GEMINI_MODEL setting and try again.`);
      }

      // Log complete response info
      const usage = response.usageMetadata;
      const finishReason = response.candidates?.[0]?.finishReason;

      logger.info('Gemini model invoked successfully - SINGLE COMPLETE RESPONSE', {
        modelName,
        responseLength: responseText.length,
        finishReason,
        promptTokenCount: usage?.promptTokenCount || 0,
        candidatesTokenCount: usage?.candidatesTokenCount || 0,
        totalTokenCount: usage?.totalTokenCount || 0,
        maxOutputTokens: validMaxTokens,
        isComplete: finishReason !== 'MAX_TOKENS' && finishReason !== 'OTHER'
      });

      // Warn if response was truncated
      if (finishReason === 'MAX_TOKENS') {
        logger.warn('Response was truncated - consider increasing maxOutputTokens or reducing context', {
          receivedTokens: usage?.candidatesTokenCount || 0,
          maxTokens: validMaxTokens,
          responseLength: responseText.length
        });
      }

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
        // Don't retry safety-related errors or authentication errors
        const isSafetyError =
          error.message.includes('safety filter') ||
          error.message.includes('blocked by safety') ||
          error.message.includes('blocked due to') ||
          error.message.includes('Request was blocked');

        // Truncation and JSON errors should NOT be retried - they'll fail the same way
        const isTruncationError =
          error.message.includes('truncated') ||
          error.message.includes('MAX_TOKENS') ||
          error.message.includes('max token limit') ||
          error.message.includes('incomplete') ||
          error.message.includes('Unexpected end') ||
          error.message.includes('JSON');

        const isRetryable =
          !isSafetyError &&
          !isTruncationError &&
          (error.status === 429 ||
            error.status >= 500 ||
            error.message.includes('rate limit') ||
            error.message.includes('timeout') ||
            error.message.includes('network') ||
            error.message.includes('temporarily unavailable') ||
            error.message.includes('empty response') ||
            error.message.includes('no response candidates') ||
            error.message.includes('failed to extract text'));

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
   * SINGLE API CALL - Gets complete response in one request (no streaming, no chunking, no retries on truncation)
   * @param {string} systemPrompt - System prompt/instructions
   * @param {string} userPrompt - User prompt/content
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} Parsed JSON response
   */
  async invokeAndParseJSON(systemPrompt, userPrompt, options = {}) {
    try {
      // SINGLE API CALL: invokeWithRetry -> invokeGemini -> model.generateContent()
      // This is ONE call to Gemini, not streaming, not multiple calls
      // IMPORTANT: Set maxRetries to 1 to prevent retries on truncation errors
      const responseText = await this.invokeWithRetry(systemPrompt, userPrompt, {
        ...options,
        maxRetries: 1 // Don't retry - truncation errors won't be fixed by retrying
      });

      logger.info('Received complete response from Gemini (SINGLE API CALL, NO RETRIES)', {
        responseLength: responseText.length,
        firstChars: responseText.substring(0, 100),
        lastChars: responseText.substring(Math.max(0, responseText.length - 100))
      });

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
      // Truncation errors should NOT trigger retries - they need user action (reduce context or increase tokens)
      if (error.message.includes('Unexpected end') || error.message.includes('JSON')) {
        // This is a truncation/parsing error - don't retry, just fail immediately
        logger.error('JSON parsing failed - likely truncation', {
          error: error.message,
          jsonPreview: error.message.includes('preview') ? error.message : 'N/A'
        });

        // Check if maxTokens was actually used (not defaulted to 8192)
        const usedMaxTokens = options?.maxTokens || this.defaultMaxTokens;
        throw new Error(`AI response JSON was incomplete/truncated. Response exceeded token limit. Max tokens used: ${usedMaxTokens}. Solution: Reduce context size (MAX_CONTEXT_CHARS), reduce maxTokens per chunk, or split into more/smaller requests. This error will NOT be retried.`);
      }

      throw new Error(`Failed to parse AI response: ${error.message}`);
    }
  }
}

// Export singleton instance
export default new GeminiService();

