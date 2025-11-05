/**
 * Generate Document Handler
 * Combines AI generation with document creation (Excel/DOCX)
 * Saves to S3 outputs bucket and returns presigned download URL
 * Endpoint: POST /api/generate-document
 */

import { v4 as uuidv4 } from 'uuid';
import { createSuccessResponse, createErrorResponse, handleAwsError } from '../utils/errorHandler.js';
import { validateGenerateRequest } from '../utils/validators.js';
import { logger } from '../utils/logger.js';
import { handleGenerate } from '../controllers/generateController.js';
import excelService from '../services/excelService.js';
import docxService from '../services/docxService.js';
import s3Service from '../services/s3Service.js';
import { validateMethod, handleOptions, parseRequestBody } from '../utils/routeHandler.js';

/**
 * Lambda handler for complete document generation
 * @param {Object} event - API Gateway event
 * @param {Object} context - Lambda context
 * @returns {Promise<Object>} Response object with fileId, downloadUrl, etc.
 */
export const handler = async (event, context) => {
  logger.info('Generate document handler invoked', {
    method: event.httpMethod,
    path: event.path
  });

  try {
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

    const { useCase, documentIds, queryText, llmProvider = 'gemini' } = requestBody;

    // Validate input
    try {
      validateGenerateRequest({ useCase, documentIds });
    } catch (validationError) {
      logger.warn('Request validation failed', { error: validationError.message });
      return createErrorResponse(400, validationError.message);
    }

    logger.info(`Generating ${useCase} document for documents: ${documentIds.join(', ')}`);

    const startTime = Date.now();

    // Step 1: Generate AI content using controller
    let aiGeneratedData;
    try {
      const aiResponse = await handleGenerate({ useCase, documentIds, queryText, llmProvider });
      aiGeneratedData = aiResponse.data; // Extract the parsed data from AI response

      if (!aiGeneratedData) {
        throw new Error('AI generation returned empty data');
      }

      logger.info('AI content generated successfully', {
        useCase,
        dataKeys: Object.keys(aiGeneratedData),
        chunksUsed: aiResponse.chunksUsed
      });
    } catch (generateError) {
      logger.error('AI generation failed', generateError);

      // Handle specific error types
      if (generateError.message.includes('No relevant chunks')) {
        return createErrorResponse(404, generateError.message);
      }
      if (generateError.message.includes('Invalid use case')) {
        return createErrorResponse(400, generateError.message);
      }

      return createErrorResponse(500, `AI generation failed: ${generateError.message}`, generateError);
    }

    // Step 2: Generate document based on use case
    logger.info('Creating document from AI-generated content...');
    let documentBuffer;
    let fileExtension;
    let contentType;
    let fileName;

    const fileId = uuidv4();
    const timestamp = new Date().toISOString().split('T')[0].replace(/-/g, '');

    try {
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
    } catch (documentError) {
      logger.error('Document creation failed', documentError);
      return createErrorResponse(500, `Failed to create document: ${documentError.message}`, documentError);
    }

    // Step 3: Upload to S3 outputs bucket
    logger.info('Uploading document to S3...');
    let uploadResult;
    try {
      uploadResult = await s3Service.uploadOutput(
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
    } catch (uploadError) {
      logger.error('S3 upload failed', uploadError);
      return handleAwsError(uploadError);
    }

    // Step 4: Generate presigned URL for download
    logger.info('Generating presigned download URL...');
    let downloadUrl;
    try {
      const bucket = process.env.S3_OUTPUTS_BUCKET || process.env.OUTPUTS_BUCKET;
      if (!bucket) {
        throw new Error('S3_OUTPUTS_BUCKET or OUTPUTS_BUCKET environment variable is not set');
      }
      downloadUrl = await s3Service.getPresignedUrl(
        bucket,
        uploadResult.s3Key,
        3600 // 1 hour expiry
      );

      logger.info('Presigned URL generated', {
        fileId,
        expiresIn: '1 hour'
      });
    } catch (urlError) {
      logger.error('Presigned URL generation failed', urlError);
      // Don't fail the request if URL generation fails - document is still uploaded
      downloadUrl = null;
    }

    const processingTime = ((Date.now() - startTime) / 1000).toFixed(2);

    // Prepare response
    const responseData = {
      fileId,
      fileName,
      fileType: fileExtension,
      contentType,
      downloadUrl,
      s3Key: uploadResult.s3Key,
      s3Bucket: uploadResult.bucket,
      useCase,
      status: 'success',
      message: `${useCase} document generated and uploaded successfully`,
      processingTime: `${processingTime}s`,
      generatedAt: new Date().toISOString()
    };

    logger.info('Document generation completed successfully', {
      fileId,
      fileName,
      useCase,
      processingTime
    });

    return createSuccessResponse(responseData, 201);

  } catch (error) {
    logger.error('Generate document handler error', error);
    return createErrorResponse(500, 'Document generation failed', error);
  }
};

