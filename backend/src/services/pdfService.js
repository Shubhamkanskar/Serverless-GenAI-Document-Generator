/**
 * PDF Service
 * Handles PDF text extraction, chunking, and metadata preservation
 */

// Use pdfreader for PDF text extraction
// This library is CJS-compatible and works well with Lambda and esbuild bundling
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { logger } from '../utils/logger.js';
import { PdfReader } from 'pdfreader';

class PDFService {
  constructor() {
    const region = process.env.AWS_REGION || process.env.REGION || 'us-east-1';
    this.s3Client = new S3Client({ region });
    this.documentsBucket = process.env.S3_DOCUMENTS_BUCKET || process.env.DOCUMENTS_BUCKET;
    
    // Chunking configuration
    // Based on best practices: 1000-1500 chars with 10-20% overlap for optimal retrieval
    this.chunkSize = 1200; // Optimal size for embeddings
    this.chunkOverlap = 200; // ~16% overlap for context preservation
    
    logger.info('PDFService initialized', {
      region,
      chunkSize: this.chunkSize,
      chunkOverlap: this.chunkOverlap
    });
  }

  /**
   * Download PDF from S3
   * @param {string} s3Key - S3 object key
   * @param {string} bucket - S3 bucket name (optional, defaults to documents bucket)
   * @returns {Promise<Buffer>} PDF file buffer
   */
  async downloadFromS3(s3Key, bucket = null) {
    try {
      const bucketName = bucket || this.documentsBucket;
      
      if (!bucketName) {
        throw new Error('S3_DOCUMENTS_BUCKET or DOCUMENTS_BUCKET environment variable is not set. Please configure it in your environment variables.');
      }
      
      const command = new GetObjectCommand({
        Bucket: bucketName,
        Key: s3Key
      });

      const response = await this.s3Client.send(command);
      
      // Convert stream to buffer
      const chunks = [];
      for await (const chunk of response.Body) {
        chunks.push(chunk);
      }
      const buffer = Buffer.concat(chunks);

      logger.info('PDF downloaded from S3', {
        bucket: bucketName,
        key: s3Key,
        size: buffer.length
      });

      return buffer;
    } catch (error) {
      logger.error('Failed to download PDF from S3', error);
      if (error.name === 'NoSuchKey') {
        throw new Error(`PDF file not found in S3: ${s3Key}`);
      }
      throw new Error(`Failed to download PDF from S3: ${error.message}`);
    }
  }

  /**
   * Extract text from PDF buffer
   * @param {Buffer} pdfBuffer - PDF file as buffer
   * @param {Object} metadata - Additional metadata (fileName, fileId, etc.)
   * @returns {Promise<Object>} Extracted text with metadata
   */
  async extractText(pdfBuffer, metadata = {}) {
    try {
      // Validate PDF buffer
      if (!pdfBuffer || pdfBuffer.length === 0) {
        throw new Error('PDF buffer is empty');
      }

      // Extract text using pdfreader (CJS-compatible, works with bundling)
      return new Promise((resolve, reject) => {
        const reader = new PdfReader();
        let fullText = '';
        const pageTextMap = new Map(); // Map to store text by page number
        
        reader.parseBuffer(pdfBuffer, (err, item) => {
          if (err) {
            logger.error('PDF parsing error', err);
            reject(new Error(`Failed to parse PDF: ${err.message}`));
            return;
          }
          
          if (!item) {
            // End of parsing - process all pages
            // Sort pages and build text
            const sortedPages = Array.from(pageTextMap.keys()).sort((a, b) => a - b);
            const pageTexts = [];
            
            sortedPages.forEach(pageNum => {
              const pageText = pageTextMap.get(pageNum).join(' ');
              pageTexts.push(pageText);
              fullText += pageText + '\n';
            });
            
            const numPages = sortedPages.length > 0 ? Math.max(...sortedPages) : 0;
            
            // Validate extracted data
            if (!fullText || fullText.trim().length === 0) {
              logger.warn('PDF appears to be empty or contains no extractable text', {
                pages: numPages,
                fileName: metadata.fileName
              });
              reject(new Error('PDF contains no extractable text. It may be image-based or empty.'));
              return;
            }
            
            const extractedData = {
              text: fullText.trim(),
              metadata: {
                ...metadata,
                numPages,
                pageTexts,
                info: {
                  // pdfreader doesn't provide detailed metadata
                  title: null,
                  author: null,
                  subject: null,
                  creator: null,
                  producer: null,
                  creationDate: null,
                  modDate: null
                },
                extractedAt: new Date().toISOString()
              }
            };
            
            logger.info('Text extracted from PDF', {
              textLength: fullText.length,
              pages: numPages,
              fileName: metadata.fileName
            });
            
            resolve(extractedData);
            return;
          }
          
          // Process text items
          if (item.page !== undefined) {
            const pageNum = item.page;
            if (!pageTextMap.has(pageNum)) {
              pageTextMap.set(pageNum, []);
            }
          }
          
          if (item.text) {
            const currentPage = item.page !== undefined ? item.page : 1;
            const pageTexts = pageTextMap.get(currentPage) || [];
            pageTexts.push(item.text);
            pageTextMap.set(currentPage, pageTexts);
          }
        });
      });
    } catch (error) {
      logger.error('PDF text extraction failed', error);
      
      // Handle specific error cases
      if (error.message?.includes('password') || error.message?.includes('encrypted') || error.name === 'PasswordException') {
        throw new Error('PDF is password-protected. Password-protected PDFs are not supported.');
      }
      
      if (error.message?.includes('corrupt') || error.message?.includes('Invalid') || error.message?.includes('Malformed') || error.name === 'InvalidPDFException') {
        throw new Error('PDF file is corrupted or invalid. Please upload a valid PDF file.');
      }
      
      throw new Error(`Failed to extract text from PDF: ${error.message || error}`);
    }
  }

  /**
   * Extract text from PDF stored in S3
   * @param {string} s3Key - S3 object key
   * @param {string} bucket - S3 bucket name (optional)
   * @param {Object} metadata - Additional metadata
   * @returns {Promise<Object>} Extracted text with metadata
   */
  async extractTextFromS3(s3Key, bucket = null, metadata = {}) {
    try {
      // Download PDF from S3
      const pdfBuffer = await this.downloadFromS3(s3Key, bucket);
      
      // Extract text
      const extractedData = await this.extractText(pdfBuffer, {
        ...metadata,
        s3Key,
        s3Bucket: bucket || this.documentsBucket
      });

      return extractedData;
    } catch (error) {
      logger.error('Failed to extract text from S3 PDF', error);
      throw error;
    }
  }

  /**
   * Split text into chunks with overlap
   * @param {string} text - Text to split
   * @param {Object} metadata - Metadata to attach to each chunk
   * @returns {Array<Object>} Array of text chunks with metadata
   */
  splitText(text, metadata = {}) {
    try {
      if (!text || text.trim().length === 0) {
        throw new Error('Text is empty, cannot split');
      }

      const chunks = [];
      let startIndex = 0;
      let chunkIndex = 0;

      while (startIndex < text.length) {
        // Calculate end index for this chunk
        const endIndex = Math.min(startIndex + this.chunkSize, text.length);
        
        // Extract chunk
        let chunk = text.slice(startIndex, endIndex);
        
        // Try to split at natural boundaries (paragraphs, sentences)
        if (endIndex < text.length) {
          // Look for paragraph break within overlap region
          const overlapStart = Math.max(0, endIndex - this.chunkOverlap);
          const overlapRegion = text.slice(overlapStart, endIndex);
          
          // Try paragraph break first
          const paraBreak = overlapRegion.lastIndexOf('\n\n');
          if (paraBreak !== -1) {
            chunk = text.slice(startIndex, overlapStart + paraBreak);
            startIndex = overlapStart + paraBreak + 2; // Skip the \n\n
          } else {
            // Try sentence break
            const sentenceBreak = overlapRegion.lastIndexOf('. ');
            if (sentenceBreak !== -1) {
              chunk = text.slice(startIndex, overlapStart + sentenceBreak + 1);
              startIndex = overlapStart + sentenceBreak + 2; // Skip the '. '
            } else {
              // Try line break
              const lineBreak = overlapRegion.lastIndexOf('\n');
              if (lineBreak !== -1) {
                chunk = text.slice(startIndex, overlapStart + lineBreak);
                startIndex = overlapStart + lineBreak + 1; // Skip the \n
              } else {
                // No natural boundary, use word boundary
                const wordBreak = overlapRegion.lastIndexOf(' ');
                if (wordBreak !== -1) {
                  chunk = text.slice(startIndex, overlapStart + wordBreak);
                  startIndex = overlapStart + wordBreak + 1; // Skip the space
                } else {
                  // No boundary found, use fixed chunk
                  startIndex = startIndex + this.chunkSize - this.chunkOverlap;
                }
              }
            }
          }
        } else {
          // Last chunk
          startIndex = text.length;
        }

        // Add chunk with metadata
        chunks.push({
          text: chunk.trim(),
          chunkIndex: chunkIndex++,
          startChar: startIndex - chunk.length,
          endChar: startIndex,
          ...metadata,
          chunkSize: chunk.length
        });
      }

      logger.info('Text split into chunks', {
        totalChunks: chunks.length,
        totalTextLength: text.length,
        avgChunkSize: Math.round(chunks.reduce((sum, c) => sum + c.text.length, 0) / chunks.length)
      });

      return chunks;
    } catch (error) {
      logger.error('Text splitting failed', error);
      throw new Error(`Failed to split text: ${error.message}`);
    }
  }

  /**
   * Extract text and split into chunks in one operation
   * @param {string} s3Key - S3 object key
   * @param {string} bucket - S3 bucket name (optional)
   * @param {Object} metadata - Additional metadata
   * @returns {Promise<Array<Object>>} Array of text chunks with metadata
   */
  async extractAndChunk(s3Key, bucket = null, metadata = {}) {
    try {
      // Extract text from S3
      const extractedData = await this.extractTextFromS3(s3Key, bucket, metadata);
      
      // Split into chunks
      const chunks = this.splitText(extractedData.text, {
        ...extractedData.metadata,
        ...metadata
      });

      logger.info('PDF extracted and chunked', {
        s3Key,
        chunksCount: chunks.length,
        totalPages: extractedData.metadata.numPages
      });

      return chunks;
    } catch (error) {
      logger.error('PDF extraction and chunking failed', error);
      throw error;
    }
  }
}

// Export singleton instance
export default new PDFService();

