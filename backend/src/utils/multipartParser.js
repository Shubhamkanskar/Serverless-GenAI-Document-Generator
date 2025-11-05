/**
 * Multipart Parser Utility
 * Parses multipart/form-data from API Gateway events
 */

import Busboy from 'busboy';
import { logger } from './logger.js';

/**
 * Parse multipart/form-data from API Gateway event
 * @param {Object} event - API Gateway event
 * @returns {Promise<Object>} Parsed form data with files
 */
export const parseMultipartFormData = (event) => {
  return new Promise((resolve, reject) => {
    try {
      const contentType = event?.headers?.['content-type'] || event?.headers?.['Content-Type'];
      
      if (!contentType || !contentType.includes('multipart/form-data')) {
        return reject(new Error('Content-Type must be multipart/form-data'));
      }

      if (!event.body) {
        return reject(new Error('Request body is missing or empty'));
      }

      let body;
      try {
        body = event.isBase64Encoded
          ? Buffer.from(event.body, 'base64')
          : Buffer.from(event.body, 'utf8');
      } catch (bufferError) {
        logger.error('Failed to create buffer from body', bufferError);
        return reject(new Error('Invalid request body format'));
      }

    const busboy = Busboy({ headers: { 'content-type': contentType } });
    const files = [];
    const fields = {};

    busboy.on('file', (fieldname, file, info) => {
      const { filename, encoding, mimeType } = info;
      logger.info('File received', { fieldname, filename, mimeType });

      const chunks = [];
      
      file.on('data', (chunk) => {
        chunks.push(chunk);
      });

      file.on('end', () => {
        files.push({
          fieldname,
          filename,
          encoding,
          contentType: mimeType,
          buffer: Buffer.concat(chunks),
          size: Buffer.concat(chunks).length
        });
      });
    });

    busboy.on('field', (fieldname, value) => {
      fields[fieldname] = value;
      logger.debug('Field received', { fieldname, value });
    });

    busboy.on('finish', () => {
      resolve({ files, fields });
    });

    busboy.on('error', (error) => {
      logger.error('Multipart parsing error', error);
      reject(new Error(`Failed to parse multipart data: ${error.message}`));
    });

      busboy.write(body);
      busboy.end();
    } catch (error) {
      logger.error('Multipart parser initialization error', error);
      reject(new Error(`Failed to initialize multipart parser: ${error.message}`));
    }
  });
};

