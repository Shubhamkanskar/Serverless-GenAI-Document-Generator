/**
 * Route Definitions
 * Centralized route configuration for all API endpoints
 * This provides a single source of truth for route paths and metadata
 */

export const ROUTES = {
    UPLOAD: {
        path: '/api/upload',
        method: 'POST',
        handler: 'upload',
        description: 'Upload PDF documents to S3',
        timeout: 30,
        memorySize: 256,
        cors: true
    },
    INGEST: {
        path: '/api/ingest',
        method: 'POST',
        handler: 'ingest',
        description: 'Ingest and vectorize uploaded documents',
        timeout: 300,
        memorySize: 512,
        cors: true
    },
    GENERATE: {
        path: '/api/generate',
        method: 'POST',
        handler: 'generate',
        description: 'Generate AI content (checksheet/workInstructions) from documents',
        timeout: 300,
        memorySize: 512,
        cors: true
    },
    GENERATE_DOCUMENT: {
        path: '/api/generate-document',
        method: 'POST',
        handler: 'generateDocument',
        description: 'Generate complete document (Excel/DOCX) and upload to S3',
        timeout: 300,
        memorySize: 512,
        cors: true
    },
    DOWNLOAD: {
        path: '/api/download/{fileId}',
        method: 'GET',
        handler: 'download',
        description: 'Get presigned URL for downloading generated documents',
        timeout: 30,
        memorySize: 256,
        cors: true
    }
};

/**
 * Get route configuration by path
 * @param {string} path - Route path
 * @returns {Object|null} Route configuration or null
 */
export const getRouteByPath = (path) => {
    return Object.values(ROUTES).find(route => route.path === path) || null;
};

/**
 * Get route configuration by handler name
 * @param {string} handlerName - Handler name
 * @returns {Object|null} Route configuration or null
 */
export const getRouteByHandler = (handlerName) => {
    return Object.values(ROUTES).find(route => route.handler === handlerName) || null;
};

/**
 * Get all routes
 * @returns {Object} All route configurations
 */
export const getAllRoutes = () => {
    return ROUTES;
};

/**
 * Generate serverless.yml function configuration
 * @returns {Object} Functions configuration for serverless.yml
 */
export const getServerlessFunctionsConfig = () => {
    const functions = {};

    Object.entries(ROUTES).forEach(([key, route]) => {
        functions[route.handler] = {
            handler: `src/handlers/${route.handler}.handler`,
            timeout: route.timeout,
            memorySize: route.memorySize,
            events: [
                {
                    http: {
                        path: route.path.replace(/^\//, ''), // Remove leading slash for serverless
                        method: route.method.toLowerCase(),
                        cors: route.cors ? {
                            origin: '*',
                            headers: [
                                'Content-Type',
                                'X-Amz-Date',
                                'Authorization',
                                'X-Api-Key',
                                'X-Amz-Security-Token'
                            ],
                            allowCredentials: false
                        } : false
                    }
                }
            ]
        };
    });

    return functions;
};

