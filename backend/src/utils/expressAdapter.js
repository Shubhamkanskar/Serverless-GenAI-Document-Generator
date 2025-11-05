/**
 * Express Adapter Utility
 * Converts Express requests to Lambda event format and handles file uploads
 */

import Busboy from 'busboy';
import { logger } from './logger.js';

/**
 * Create a Lambda-compatible multipart event from multer file
 * This reconstructs the multipart body so parseMultipartFormData can handle it
 * @param {Object} multerFile - File object from multer
 * @param {Object} req - Express request object
 * @returns {Object} Lambda event format
 */
export const createMultipartEvent = (multerFile, req) => {
  // Create a multipart/form-data body with the file
  const boundary = `----WebKitFormBoundary${Date.now()}${Math.random().toString(36).substr(2, 9)}`;
  const contentType = `multipart/form-data; boundary=${boundary}`;
  
  // Build multipart body manually
  let multipartBody = `--${boundary}\r\n`;
  multipartBody += `Content-Disposition: form-data; name="file"; filename="${multerFile.originalname}"\r\n`;
  multipartBody += `Content-Type: ${multerFile.mimetype}\r\n\r\n`;
  
  // Convert to buffer and append file buffer
  const headerBuffer = Buffer.from(multipartBody, 'utf8');
  const fileBuffer = multerFile.buffer;
  const footerBuffer = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8');
  
  const fullBody = Buffer.concat([headerBuffer, fileBuffer, footerBuffer]);
  
  return {
    httpMethod: 'POST',
    path: '/api/upload',
    pathParameters: {},
    queryStringParameters: {},
    headers: {
      'content-type': contentType,
      'host': req.headers.host || `localhost:${process.env.PORT || 3000}`,
      'user-agent': req.headers['user-agent'] || 'Express-Server'
    },
    body: fullBody.toString('base64'),
    isBase64Encoded: true,
    requestContext: {
      requestId: `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      stage: 'local',
      httpMethod: 'POST',
      path: '/api/upload',
      identity: {
        sourceIp: req.ip || req.connection.remoteAddress || '127.0.0.1'
      }
    }
  };
};

/**
 * Convert Express request to Lambda event format
 * @param {Object} req - Express request object
 * @returns {Object} Lambda event format
 */
export const expressToLambdaEvent = (req) => {
  const headers = {};
  Object.keys(req.headers).forEach(key => {
    headers[key.toLowerCase()] = req.headers[key];
  });

  return {
    httpMethod: req.method,
    path: req.path,
    pathParameters: req.params || {},
    queryStringParameters: req.query || {},
    headers: headers,
    body: req.body ? JSON.stringify(req.body) : null,
    isBase64Encoded: false,
    requestContext: {
      requestId: `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      stage: 'local',
      httpMethod: req.method,
      path: req.path,
      identity: {
        sourceIp: req.ip || req.connection.remoteAddress || '127.0.0.1'
      }
    }
  };
};

/**
 * Convert Lambda response to Express response
 * @param {Object} lambdaResponse - Lambda response object
 * @param {Object} res - Express response object
 */
export const lambdaToExpressResponse = (lambdaResponse, res) => {
  const statusCode = lambdaResponse.statusCode || 200;
  res.status(statusCode);
  
  // Set headers
  if (lambdaResponse.headers) {
    Object.entries(lambdaResponse.headers).forEach(([key, value]) => {
      res.setHeader(key, value);
    });
  }
  
  // Send body
  if (lambdaResponse.body) {
    if (typeof lambdaResponse.body === 'string') {
      try {
        const parsed = JSON.parse(lambdaResponse.body);
        res.json(parsed);
      } catch {
        res.send(lambdaResponse.body);
      }
    } else {
      res.json(lambdaResponse.body);
    }
  } else {
    res.end();
  }
};

