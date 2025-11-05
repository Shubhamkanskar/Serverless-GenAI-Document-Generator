/**
 * GenAI Document Generator - Express Server
 * 
 * Local Express server for testing all API endpoints
 * This server wraps Lambda handlers for local development and testing
 */

// IMPORTANT: Load environment variables FIRST before any other imports
// This ensures services can access env vars when they're instantiated
import './src/config/env.js';

import express from 'express';
import multer from 'multer';
import cors from 'cors';
import { handler as uploadHandler } from './src/handlers/upload.js';
import { handler as getUploadUrlHandler } from './src/handlers/getUploadUrl.js';
import { handler as ingestHandler } from './src/handlers/ingest.js';
import { handler as generateHandler } from './src/handlers/generate.js';
import { handler as generateDocumentHandler } from './src/handlers/generateDocument.js';
import { handler as downloadHandler } from './src/handlers/download.js';
import { handler as promptsHandler } from './src/handlers/prompts.js';
import { handler as promptLibraryHandler } from './src/handlers/promptLibrary.js';
import { logger } from './src/utils/logger.js';
import { createMultipartEvent, expressToLambdaEvent, lambdaToExpressResponse } from './src/utils/expressAdapter.js';

const app = express();
const PORT = process.env.PORT || 3000;

// Configure multer for file uploads
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 100 * 1024 * 1024 // 100MB
    },
    fileFilter: (req, file, cb) => {
        // Only allow PDF files
        if (file.mimetype === 'application/pdf') {
            cb(null, true);
        } else {
            cb(new Error('Only PDF files are allowed'), false);
        }
    }
});

// Middleware
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'X-Amz-Date', 'Authorization', 'X-Api-Key', 'X-Amz-Security-Token'],
    credentials: false
}));

app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ extended: true, limit: '100mb' }));

// Helper functions are imported from expressAdapter.js

// API Routes

/**
 * POST /api/get-upload-url
 * Get presigned URL for direct S3 upload (for files >10MB)
 */
app.post('/api/get-upload-url', async (req, res) => {
    try {
        const event = expressToLambdaEvent(req);
        const context = {};
        const response = await getUploadUrlHandler(event, context);
        lambdaToExpressResponse(response, res);
    } catch (error) {
        logger.error('Get upload URL handler error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Failed to generate upload URL'
        });
    }
});

/**
 * POST /api/upload
 * Upload PDF documents to S3
 */
app.post('/api/upload', upload.single('file'), async (req, res) => {
    try {
        // Validate file
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'No file provided. Please include a file in the request.'
            });
        }

        // Create Lambda-compatible event with multipart body
        const event = createMultipartEvent(req.file, req);
        const context = {};

        const response = await uploadHandler(event, context);
        lambdaToExpressResponse(response, res);
    } catch (error) {
        logger.error('Upload handler error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: process.env.NODE_ENV === 'development' ? error.message : 'File upload failed'
        });
    }
});

/**
 * POST /api/ingest
 * Ingest and vectorize uploaded documents
 */
app.post('/api/ingest', async (req, res) => {
    try {
        const event = expressToLambdaEvent(req);
        const context = {};
        const response = await ingestHandler(event, context);
        lambdaToExpressResponse(response, res);
    } catch (error) {
        logger.error('Ingest handler error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Document ingestion failed'
        });
    }
});

/**
 * POST /api/generate
 * Generate AI content (checksheet/workInstructions) from documents
 */
app.post('/api/generate', async (req, res) => {
    try {
        const event = expressToLambdaEvent(req);
        const context = {};
        const response = await generateHandler(event, context);
        lambdaToExpressResponse(response, res);
    } catch (error) {
        logger.error('Generate handler error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Document generation failed'
        });
    }
});

/**
 * POST /api/generate-document
 * Generate complete document (Excel/DOCX) and upload to S3
 */
app.post('/api/generate-document', async (req, res) => {
    try {
        const event = expressToLambdaEvent(req);
        const context = {};
        const response = await generateDocumentHandler(event, context);
        lambdaToExpressResponse(response, res);
    } catch (error) {
        logger.error('Generate document handler error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Document generation failed'
        });
    }
});

/**
 * GET /api/download/:fileId
 * Get presigned URL for downloading generated documents
 */
app.get('/api/download/:fileId', async (req, res) => {
    try {
        const event = expressToLambdaEvent(req);
        const context = {};
        const response = await downloadHandler(event, context);
        lambdaToExpressResponse(response, res);
    } catch (error) {
        logger.error('Download handler error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Failed to generate download URL'
        });
    }
});

/**
 * Prompt Management Routes
 * IMPORTANT: Define specific routes (like /reset) BEFORE parameterized routes (like /:useCase)
 * Otherwise Express will match /reset as a useCase parameter
 */

/**
 * POST /api/prompts/reset
 * Reset prompts to defaults
 * MUST be defined before /api/prompts/:useCase to avoid route conflicts
 */
app.post('/api/prompts/reset', async (req, res) => {
    try {
        const event = expressToLambdaEvent(req);
        const context = {};
        const response = await promptsHandler(event, context);
        lambdaToExpressResponse(response, res);
    } catch (error) {
        logger.error('Prompts handler error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Failed to reset prompts'
        });
    }
});

/**
 * Prompt Library Routes
 * All routes for /api/prompts/library/*
 * IMPORTANT: These must come BEFORE /api/prompts/:useCase routes
 * to avoid route conflicts (Express matches routes in order)
 */

/**
 * GET /api/prompts/library
 * Get all prompt libraries
 */
app.get('/api/prompts/library', async (req, res) => {
    try {
        const event = expressToLambdaEvent(req);
        const context = {};
        const response = await promptLibraryHandler(event, context);
        lambdaToExpressResponse(response, res);
    } catch (error) {
        logger.error('Prompt library handler error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Failed to get prompt libraries'
        });
    }
});

/**
 * POST /api/prompts/library/reset
 * Reset prompt library to defaults
 */
app.post('/api/prompts/library/reset', async (req, res) => {
    try {
        const event = expressToLambdaEvent(req);
        const context = {};
        const response = await promptLibraryHandler(event, context);
        lambdaToExpressResponse(response, res);
    } catch (error) {
        logger.error('Prompt library handler error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Failed to reset prompt library'
        });
    }
});

/**
 * GET /api/prompts/library/:useCase/prompts
 * Get all prompts for use case (must come before /:useCase route)
 */
app.get('/api/prompts/library/:useCase/prompts', async (req, res) => {
    try {
        const event = expressToLambdaEvent(req);
        const context = {};
        const response = await promptLibraryHandler(event, context);
        lambdaToExpressResponse(response, res);
    } catch (error) {
        logger.error('Prompt library handler error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Failed to get prompts'
        });
    }
});

/**
 * POST /api/prompts/library/:useCase/:promptId/activate
 * Set prompt as active (must come before /:useCase/:promptId route)
 */
app.post('/api/prompts/library/:useCase/:promptId/activate', async (req, res) => {
    try {
        const event = expressToLambdaEvent(req);
        const context = {};
        const response = await promptLibraryHandler(event, context);
        lambdaToExpressResponse(response, res);
    } catch (error) {
        logger.error('Prompt library handler error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Failed to activate prompt'
        });
    }
});

/**
 * GET /api/prompts/library/:useCase/:promptId
 * Get specific prompt
 */
app.get('/api/prompts/library/:useCase/:promptId', async (req, res) => {
    try {
        const event = expressToLambdaEvent(req);
        const context = {};
        const response = await promptLibraryHandler(event, context);
        lambdaToExpressResponse(response, res);
    } catch (error) {
        logger.error('Prompt library handler error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Failed to get prompt'
        });
    }
});

/**
 * POST /api/prompts/library/:useCase
 * Add new prompt to library
 */
app.post('/api/prompts/library/:useCase', async (req, res) => {
    try {
        const event = expressToLambdaEvent(req);
        const context = {};
        const response = await promptLibraryHandler(event, context);
        lambdaToExpressResponse(response, res);
    } catch (error) {
        logger.error('Prompt library handler error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Failed to add prompt'
        });
    }
});

/**
 * PUT /api/prompts/library/:useCase/:promptId
 * Update existing prompt
 */
app.put('/api/prompts/library/:useCase/:promptId', async (req, res) => {
    try {
        const event = expressToLambdaEvent(req);
        const context = {};
        const response = await promptLibraryHandler(event, context);
        lambdaToExpressResponse(response, res);
    } catch (error) {
        logger.error('Prompt library handler error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Failed to update prompt'
        });
    }
});

/**
 * GET /api/prompts/library/:useCase
 * Get library for specific use case (must come after more specific routes)
 */
app.get('/api/prompts/library/:useCase', async (req, res) => {
    try {
        const event = expressToLambdaEvent(req);
        const context = {};
        const response = await promptLibraryHandler(event, context);
        lambdaToExpressResponse(response, res);
    } catch (error) {
        logger.error('Prompt library handler error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Failed to get prompt library'
        });
    }
});

/**
 * DELETE /api/prompts/library/:useCase/:promptId
 * Delete prompt from library
 */
app.delete('/api/prompts/library/:useCase/:promptId', async (req, res) => {
    try {
        const event = expressToLambdaEvent(req);
        const context = {};
        const response = await promptLibraryHandler(event, context);
        lambdaToExpressResponse(response, res);
    } catch (error) {
        logger.error('Prompt library handler error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Failed to delete prompt'
        });
    }
});

/**
 * Legacy Prompts Routes
 * These routes use the old prompts handler (for backward compatibility)
 * Must come AFTER /api/prompts/library routes to avoid conflicts
 */

/**
 * GET /api/prompts
 * Get all prompts (legacy)
 */
app.get('/api/prompts', async (req, res) => {
    try {
        const event = expressToLambdaEvent(req);
        const context = {};
        const response = await promptsHandler(event, context);
        lambdaToExpressResponse(response, res);
    } catch (error) {
        logger.error('Prompts handler error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Failed to get prompts'
        });
    }
});

/**
 * POST /api/prompts
 * Add new prompt (legacy)
 */
app.post('/api/prompts', async (req, res) => {
    try {
        const event = expressToLambdaEvent(req);
        const context = {};
        const response = await promptsHandler(event, context);
        lambdaToExpressResponse(response, res);
    } catch (error) {
        logger.error('Prompts handler error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Failed to add prompt'
        });
    }
});

/**
 * GET /api/prompts/:useCase
 * Get specific prompt (legacy)
 */
app.get('/api/prompts/:useCase', async (req, res) => {
    try {
        const event = expressToLambdaEvent(req);
        const context = {};
        const response = await promptsHandler(event, context);
        lambdaToExpressResponse(response, res);
    } catch (error) {
        logger.error('Prompts handler error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Failed to get prompt'
        });
    }
});

/**
 * PUT /api/prompts/:useCase
 * Update existing prompt (legacy)
 */
app.put('/api/prompts/:useCase', async (req, res) => {
    try {
        const event = expressToLambdaEvent(req);
        const context = {};
        const response = await promptsHandler(event, context);
        lambdaToExpressResponse(response, res);
    } catch (error) {
        logger.error('Prompts handler error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Failed to update prompt'
        });
    }
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        service: 'GenAI Document Generator API',
        version: '1.0.0'
    });
});

// API documentation endpoint
app.get('/api', (req, res) => {
    res.json({
        service: 'GenAI Document Generator API',
        version: '1.0.0',
        baseUrl: `http://localhost:${PORT}`,
        endpoints: {
            upload: {
                method: 'POST',
                path: '/api/upload',
                description: 'Upload PDF documents to S3',
                body: 'multipart/form-data with file field'
            },
            ingest: {
                method: 'POST',
                path: '/api/ingest',
                description: 'Ingest and vectorize uploaded documents',
                body: { fileId: 'string', s3Key: 'string' }
            },
            generate: {
                method: 'POST',
                path: '/api/generate',
                description: 'Generate AI content (checksheet/workInstructions) from documents',
                body: { useCase: 'checksheet | workInstructions', documentIds: ['string'], queryText: 'string (optional)' }
            },
            generateDocument: {
                method: 'POST',
                path: '/api/generate-document',
                description: 'Generate complete document (Excel/DOCX) and upload to S3',
                body: { useCase: 'checksheet | workInstructions', documentIds: ['string'], queryText: 'string (optional)' }
            },
            download: {
                method: 'GET',
                path: '/api/download/:fileId',
                description: 'Get presigned URL for downloading generated documents',
                query: { s3Key: 'string (required)', expiresIn: 'number (optional)' }
            },
            prompts: {
                method: 'GET',
                path: '/api/prompts',
                description: 'Get all prompts'
            },
            getPrompt: {
                method: 'GET',
                path: '/api/prompts/:useCase',
                description: 'Get specific prompt by use case'
            },
            updatePrompt: {
                method: 'PUT',
                path: '/api/prompts/:useCase',
                description: 'Update existing prompt',
                body: { system: 'string', userTemplate: 'string', name: 'string (optional)', description: 'string (optional)' }
            },
            addPrompt: {
                method: 'POST',
                path: '/api/prompts',
                description: 'Add new prompt',
                body: { useCase: 'string', name: 'string', system: 'string', userTemplate: 'string', description: 'string (optional)' }
            },
            resetPrompts: {
                method: 'POST',
                path: '/api/prompts/reset',
                description: 'Reset all prompts to defaults'
            }
        }
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: 'Endpoint not found',
        path: req.path,
        method: req.method,
        availableEndpoints: [
            'POST /api/upload',
            'POST /api/ingest',
            'POST /api/generate',
            'POST /api/generate-document',
            'GET /api/download/:fileId',
            'GET /api/prompts',
            'GET /api/prompts/:useCase',
            'PUT /api/prompts/:useCase',
            'POST /api/prompts',
            'POST /api/prompts/reset',
            'GET /health',
            'GET /api'
        ]
    });
});

// Error handler
app.use((err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({
                success: false,
                message: 'File too large. Maximum size is 100MB.'
            });
        }
    }

    logger.error('Express error:', err);
    res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
    });
});

// Start server
app.listen(PORT, () => {
    console.log('╔══════════════════════════════════════════════════════════════════════════════╗');
    console.log('║                    GenAI Document Generator API                              ║');
    console.log('║                        Express Server Running                                ║');
    console.log('╚══════════════════════════════════════════════════════════════════════════════╝');
    console.log('');
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log('');
    console.log('📋 Available Endpoints:');
    console.log(`   POST   http://localhost:${PORT}/api/upload`);
    console.log(`   POST   http://localhost:${PORT}/api/ingest`);
    console.log(`   POST   http://localhost:${PORT}/api/generate`);
    console.log(`   POST   http://localhost:${PORT}/api/generate-document`);
    console.log(`   GET    http://localhost:${PORT}/api/download/:fileId`);
    console.log(`   GET    http://localhost:${PORT}/api/prompts`);
    console.log(`   GET    http://localhost:${PORT}/api/prompts/:useCase`);
    console.log(`   PUT    http://localhost:${PORT}/api/prompts/:useCase`);
    console.log(`   POST   http://localhost:${PORT}/api/prompts`);
    console.log(`   POST   http://localhost:${PORT}/api/prompts/reset`);
    console.log('');
    console.log('📚 Prompt Library Endpoints:');
    console.log(`   GET    http://localhost:${PORT}/api/prompts/library`);
    console.log(`   GET    http://localhost:${PORT}/api/prompts/library/:useCase`);
    console.log(`   GET    http://localhost:${PORT}/api/prompts/library/:useCase/prompts`);
    console.log(`   GET    http://localhost:${PORT}/api/prompts/library/:useCase/:promptId`);
    console.log(`   POST   http://localhost:${PORT}/api/prompts/library/:useCase`);
    console.log(`   PUT    http://localhost:${PORT}/api/prompts/library/:useCase/:promptId`);
    console.log(`   POST   http://localhost:${PORT}/api/prompts/library/:useCase/:promptId/activate`);
    console.log(`   DELETE http://localhost:${PORT}/api/prompts/library/:useCase/:promptId`);
    console.log(`   POST   http://localhost:${PORT}/api/prompts/library/reset`);
    console.log(`   GET    http://localhost:${PORT}/health`);
    console.log(`   GET    http://localhost:${PORT}/api (API documentation)`);
    console.log('');
    console.log('📝 Postman Testing:');
    console.log('   1. Import postman-collection.json into Postman');
    console.log('   2. Set baseUrl variable to: http://localhost:3000');
    console.log('   3. For /api/upload: Body → form-data → Key: file, Type: File');
    console.log('');
    console.log('💡 Tips:');
    console.log('   - Use /health to check if server is running');
    console.log('   - Use /api to see all available endpoints');
    console.log('   - All endpoints support CORS');
    console.log('╚══════════════════════════════════════════════════════════════════════════════╝');
});

export default app;
