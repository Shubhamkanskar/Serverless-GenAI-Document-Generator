/**
 * Generate Document Handler
 * Combines AI generation with document creation (Excel/DOCX)
 * Saves to S3 outputs bucket and returns presigned download URL
 * Endpoint: POST /api/generate-document
 *
 * ASYNC VERSION - Uses async processing to avoid API Gateway 29-second timeout:
 * - When called via API Gateway, it invokes itself asynchronously and returns immediately
 * - The async invocation performs the actual processing
 * - Client polls /api/generation-status/{generationId} for updates
 */

import { v4 as uuidv4 } from 'uuid';
import { createSuccessResponse, createErrorResponse } from '../utils/errorHandler.js';
import { validateGenerateRequest } from '../utils/validators.js';
import { logger } from '../utils/logger.js';
import { handleGenerate } from '../controllers/generateController.js';
import excelService from '../services/excelService.js';
import docxService from '../services/docxService.js';
import s3Service from '../services/s3Service.js';
import generationStatusService from '../services/generationStatusService.js';
import { validateMethod, handleOptions, parseRequestBody } from '../utils/routeHandler.js';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';

/**
 * Checks if the event is from API Gateway (synchronous HTTP request)
 * @param {Object} event - Lambda event
 * @returns {boolean} True if from API Gateway
 */
const isApiGatewayEvent = (event) => {
  return event && (event.httpMethod || event.requestContext);
};

/**
 * Processes the document generation (actual work)
 * @param {string} generationId - Generation ID
 * @param {Object} params - Generation parameters
 * @returns {Promise<Object>} Processing result
 */
const processGeneration = async (generationId, params) => {
  const { useCase, documentIds, queryText, llmProvider = 'gemini', promptId = null } = params;
  const startTime = Date.now();

  try {
    // Update status to processing
    await generationStatusService.updateStatus(generationId, {
      status: 'processing',
      currentStep: 'generating_ai_content',
      progress: 10,
      message: 'Generating AI content...'
    });

    // Step 1: Generate AI content using controller with progress updates
    logger.info('Step 1: Generating AI content (chunked generation - 5 requests)...');
    
    // Create progress callback for status updates
    const progressCallback = async (progressUpdate) => {
      await generationStatusService.updateStatus(generationId, {
        currentStep: progressUpdate.step || 'generating_ai_content',
        progress: progressUpdate.progress || 10,
        message: progressUpdate.message || 'Generating AI content...'
      });
    };
    
    const aiResponse = await handleGenerate({ 
      useCase, 
      documentIds, 
      queryText, 
      llmProvider, 
      promptId,
      onProgress: progressCallback
    });
    const aiGeneratedData = aiResponse.data;

    if (!aiGeneratedData) {
      throw new Error('AI generation returned empty data');
    }

    logger.info('AI content generated successfully', {
      useCase,
      dataKeys: Object.keys(aiGeneratedData),
      chunksUsed: aiResponse.chunksUsed
    });

    // Update status after AI generation
    await generationStatusService.updateStatus(generationId, {
      currentStep: 'creating_document',
      progress: 25,
      message: 'AI content generated, creating document...'
    });

    // Step 2: Generate document based on use case
    logger.info('Step 2: Creating document from AI-generated content...');
    let documentBuffer;
    let fileExtension;
    let contentType;
    let fileName;

    const fileId = uuidv4();
    const timestamp = new Date().toISOString().split('T')[0].replace(/-/g, '');

    if (useCase === 'checksheet') {
      // Generate Excel checksheet
      logger.info('Generating Excel checksheet...');
      documentBuffer = await excelService.generateChecksheet(aiGeneratedData, `checksheet-${timestamp}`);
      fileExtension = 'xlsx';
      contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      fileName = `inspection-checksheet-${timestamp}-${fileId.substring(0, 8)}.xlsx`;
    } else if (useCase === 'workInstructions') {
      // Generate DOCX work instructions
      logger.info('Generating DOCX work instructions...');
      documentBuffer = await docxService.generateWorkInstructions(aiGeneratedData, `work-instructions-${timestamp}`);
      fileExtension = 'docx';
      contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      fileName = `work-instructions-${timestamp}-${fileId.substring(0, 8)}.docx`;
    } else {
      throw new Error(`Unsupported use case: ${useCase}`);
    }

    logger.info('Document generated successfully', {
      fileName,
      fileExtension,
      bufferSize: documentBuffer.length
    });

    // Update status after document creation
    await generationStatusService.updateStatus(generationId, {
      currentStep: 'uploading_to_s3',
      progress: 50,
      message: 'Document created, uploading to S3...'
    });

    // Step 3: Upload to S3 outputs bucket
    logger.info('Step 3: Uploading document to S3...');
    const uploadResult = await s3Service.uploadOutput(
      documentBuffer,
      fileName,
      contentType,
      fileId
    );

    logger.info('Document uploaded to S3', {
      bucket: uploadResult.bucket,
      key: uploadResult.s3Key,
      fileId
    });

    // Update status after S3 upload
    await generationStatusService.updateStatus(generationId, {
      currentStep: 'generating_download_url',
      progress: 75,
      message: 'Uploaded to S3, generating download URL...'
    });

    // Step 4: Generate presigned URL for download
    logger.info('Step 4: Generating presigned download URL...');
    const bucket = process.env.S3_OUTPUTS_BUCKET || process.env.OUTPUTS_BUCKET;
    if (!bucket) {
      throw new Error('S3_OUTPUTS_BUCKET or OUTPUTS_BUCKET environment variable is not set');
    }
    
    const downloadUrl = await s3Service.getPresignedUrl(
      bucket,
      uploadResult.s3Key,
      3600 // 1 hour expiry
    );

    const processingTime = ((Date.now() - startTime) / 1000).toFixed(2);

    logger.info('Document generation completed successfully', {
      generationId,
      fileId,
      fileName,
      useCase,
      processingTime
    });

    // Mark as completed with result
    await generationStatusService.markCompleted(generationId, {
      fileId,
      fileName,
      fileType: fileExtension,
      contentType,
      downloadUrl,
      s3Key: uploadResult.s3Key,
      s3Bucket: uploadResult.bucket,
      useCase,
      processingTime: `${processingTime}s`
    });

    return {
      generationId,
      fileId,
      fileName,
      fileType: fileExtension,
      contentType,
      downloadUrl,
      s3Key: uploadResult.s3Key,
      s3Bucket: uploadResult.bucket,
      useCase,
      processingTime: `${processingTime}s`,
      status: 'completed'
    };
  } catch (error) {
    logger.error('Generation processing failed', error);
    await generationStatusService.markFailed(
      generationId,
      error.message || 'Failed to generate document',
      'processing'
    );
    throw error;
  }
};

/**
 * Lambda handler for complete document generation (ASYNC)
 * @param {Object} event - API Gateway event or Lambda invocation event
 * @param {Object} context - Lambda context
 * @returns {Promise<Object>} Response object
 */
export const handler = async (event, context) => {
  logger.info('Generate document handler invoked', {
    method: event.httpMethod,
    path: event.path,
    isApiGateway: isApiGatewayEvent(event)
  });

  try {
    // Handle async invocation (when processing in background)
    if (!isApiGatewayEvent(event)) {
      // This is an async invocation - do the actual processing
      // Lambda may pass the event directly or wrapped, handle both cases
      let eventData = event;
      
      // If event is a string (unparsed JSON), parse it
      if (typeof event === 'string') {
        try {
          eventData = JSON.parse(event);
        } catch (parseError) {
          logger.error('Failed to parse async event as JSON', { event, error: parseError });
          throw new Error('Invalid async event format');
        }
      }
      
      // Handle cases where event might be wrapped in a body or Records array
      const generationId = eventData.generationId || eventData?.body?.generationId || (eventData?.Records?.[0]?.body && JSON.parse(eventData.Records[0].body)?.generationId);
      const params = eventData.params || eventData?.body?.params || (eventData?.Records?.[0]?.body && JSON.parse(eventData.Records[0].body)?.params);
      
      if (!generationId || !params) {
        logger.error('Invalid async invocation event', { event, eventData });
        throw new Error('Missing generationId or params in async event');
      }

      logger.info(`Async processing started for generation: ${generationId}`, { params });
      
      try {
        const result = await processGeneration(generationId, params);
        logger.info('Document generation completed successfully', {
          generationId,
          fileId: result.fileId,
          processingTime: result.processingTime
        });
        return result;
      } catch (processingError) {
        logger.error('Async processing failed', { generationId, error: processingError });
        throw processingError;
      }
    }

    // Handle API Gateway request - invoke asynchronously and return immediately
    // Handle OPTIONS preflight
    const optionsResponse = handleOptions(event);
    if (optionsResponse) {
      return optionsResponse;
    }

    // Validate HTTP method
    const methodError = validateMethod(event, 'POST');
    if (methodError) {
      return methodError;
    }

    // Parse request body
    const requestBody = parseRequestBody(event);
    if (!requestBody) {
      return createErrorResponse(400, 'Invalid or missing request body');
    }

    const { useCase, documentIds, queryText, llmProvider = 'gemini', promptId = null } = requestBody;

    // Validate input
    try {
      validateGenerateRequest({ useCase, documentIds });
    } catch (validationError) {
      logger.warn('Request validation failed', { error: validationError.message });
      return createErrorResponse(400, validationError.message);
    }

    logger.info(`Queuing generation`, {
      useCase,
      documentIds,
      llmProvider
    });

    // Generate unique generation ID
    const generationId = uuidv4();

    // Create initial status record
    try {
      await generationStatusService.createStatus(generationId, {
        useCase,
        documentIds,
        queryText,
        llmProvider,
        promptId
      });
    } catch (statusError) {
      logger.error('Failed to create initial status', statusError);
      // Continue anyway - status tracking is not critical
    }

    // Invoke Lambda asynchronously to process the generation
    try {
      const lambdaClient = new LambdaClient({ region: process.env.AWS_REGION || 'us-east-1' });
      
      // Get function name from context or environment variable
      // AWS_LAMBDA_FUNCTION_NAME is set by Lambda runtime
      const functionName = context?.functionName || 
                          context?.invokedFunctionArn?.split(':').slice(-1)[0] ||
                          process.env.AWS_LAMBDA_FUNCTION_NAME ||
                          `${process.env.SERVERLESS_SERVICE || 'genai-doc-generator'}-${process.env.SERVERLESS_STAGE || 'dev'}-generateDocument`;
      
      logger.info(`Invoking async processing for function: ${functionName}`);
      
      const invokeCommand = new InvokeCommand({
        FunctionName: functionName,
        InvocationType: 'Event', // Async invocation
        Payload: JSON.stringify({
          generationId,
          params: {
            useCase,
            documentIds,
            queryText,
            llmProvider,
            promptId
          }
        })
      });

      await lambdaClient.send(invokeCommand);
      
      logger.info('Async generation queued successfully', { generationId });

      // Return immediately with processing status
      return createSuccessResponse({
        generationId,
        status: 'processing',
        message: 'Document generation queued. Processing will continue in the background.',
        useCase
      }, 202); // 202 Accepted for async operations

    } catch (invokeError) {
      logger.error('Failed to invoke async processing', invokeError);
      // Fallback: try synchronous processing if async invocation fails
      logger.warn('Falling back to synchronous processing', { generationId });
      
      try {
        const result = await processGeneration(generationId, {
          useCase,
          documentIds,
          queryText,
          llmProvider,
          promptId
        });
        logger.info('Synchronous processing completed', {
          generationId,
          fileId: result.fileId,
          processingTime: result.processingTime
        });
        return createSuccessResponse(result, 200);
      } catch (processingError) {
        logger.error('Synchronous processing also failed', processingError);
        await generationStatusService.markFailed(
          generationId,
          `Failed to process document: ${processingError.message}`,
          'processing'
        );
        return createErrorResponse(500, `Failed to process document: ${processingError.message}`, processingError);
      }
    }

  } catch (error) {
    logger.error('Generation handler error', error);
    // If this is an async invocation, we can't return an HTTP response
    if (!isApiGatewayEvent(event)) {
      // Try to extract generationId for logging
      let generationId;
      try {
        const eventData = typeof event === 'string' ? JSON.parse(event) : event;
        generationId = eventData?.generationId || eventData?.body?.generationId;
        if (generationId) {
          await generationStatusService.markFailed(
            generationId,
            error.message || 'Failed to generate document',
            'processing'
          );
        }
      } catch (statusError) {
        logger.error('Failed to update status on error', statusError);
      }
      throw error; // Re-throw for Lambda to handle
    }
    return createErrorResponse(500, 'Failed to generate document', error);
  }
};

