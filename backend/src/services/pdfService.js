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
        let currentPage = 1; // Track current page number - starts at 1
        
        reader.parseBuffer(pdfBuffer, (err, item) => {
          if (err) {
            logger.error('PDF parsing error', err);
            reject(new Error(`Failed to parse PDF: ${err.message}`));
            return;
          }
          
          if (!item) {
            // End of parsing - process all pages and detect internal page numbers
            const sortedPages = Array.from(pageTextMap.keys()).sort((a, b) => a - b);
            const pageTexts = [];
            const internalPageMap = new Map(); // Map: PDF page index -> internal page number
            
            // First pass: detect internal page numbers for each PDF page
            sortedPages.forEach(pdfPageIndex => {
              const pageText = pageTextMap.get(pdfPageIndex).join(' ');
              const internalPageNum = this.detectInternalPageNumber(pageText);
              
              if (internalPageNum) {
                internalPageMap.set(pdfPageIndex, internalPageNum);
                logger.debug(`Detected internal page number ${internalPageNum} on PDF page ${pdfPageIndex}`);
              }
              
              pageTexts.push(pageText);
            });
            
            // Build cumulative position map for accurate page tracking
            const pagePositions = []; // Array of { pageNumber, startPos, endPos, internalPageNumber }
            let currentPosition = 0;

            sortedPages.forEach(pdfPageIndex => {
              const pageText = pageTextMap.get(pdfPageIndex).join(' ');
              const internalPageNum = internalPageMap.get(pdfPageIndex) || null;

              const startPos = currentPosition;
              fullText += pageText + '\n';
              currentPosition = fullText.length; // After adding pageText + '\n'

              pagePositions.push({
                pageNumber: pdfPageIndex, // PDF page index
                internalPageNumber: internalPageNum, // Internal page number from document
                startPos: startPos,
                endPos: currentPosition - 1 // -1 to exclude the newline
              });
            });

            // Log page mapping for diagnostics
            if (internalPageMap.size > 0) {
              const sampleMappings = Array.from(internalPageMap.entries())
                .slice(0, 5)
                .map(([pdfIndex, internal]) => ({ pdfPage: pdfIndex, internalPage: internal }));
              logger.info('Internal page number mapping detected', {
                totalMappings: internalPageMap.size,
                totalPages: sortedPages.length,
                sampleMappings
              });
            }

            // Diagnostic: Log page position map to verify accurate tracking
            if (pagePositions.length > 0) {
              const samplePositions = [pagePositions[0], pagePositions[Math.floor(pagePositions.length / 2)], pagePositions[pagePositions.length - 1]].filter(Boolean);
              logger.info('Page position map created (diagnostic)', {
                totalPages: pagePositions.length,
                totalTextLength: fullText.length,
                samplePositions: samplePositions.map(p => ({
                  page: p.pageNumber,
                  startPos: p.startPos,
                  endPos: p.endPos,
                  length: p.endPos - p.startPos + 1
                }))
              });
            }

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
                pagePositions, // Add position map for accurate page tracking
                internalPageMap: Object.fromEntries(internalPageMap), // Store mapping: PDF index -> internal page number
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
              internalPageMappings: internalPageMap.size,
              fileName: metadata.fileName
            });
            
            resolve(extractedData);
            return;
          }
          
          // Handle page metadata items: {page:integer, width:float, height:float}
          // According to pdfreader docs, page metadata comes as a separate item
          if (item.page !== undefined && item.width !== undefined && item.height !== undefined) {
            // This is a page metadata item - update current page
            currentPage = item.page;
            if (!pageTextMap.has(currentPage)) {
              pageTextMap.set(currentPage, []);
            }
            logger.debug('Processing page', { page: currentPage, width: item.width, height: item.height });
            return; // Don't process this as text
          }
          
          // Handle text items: {text:string, x:float, y:float, w:float, ...}
          if (item.text) {
            // Use the tracked currentPage for this text item
            if (!pageTextMap.has(currentPage)) {
              pageTextMap.set(currentPage, []);
            }
            const pageTexts = pageTextMap.get(currentPage);
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
   * Detect internal page number from page text content
   * Looks for patterns like "Page: 11", "Page 11", "Pg. 11", etc.
   * @param {string} pageText - Text content of a single page
   * @returns {number|null} Detected internal page number or null if not found
   */
  detectInternalPageNumber(pageText) {
    if (!pageText || typeof pageText !== 'string') {
      return null;
    }

    // Common patterns for page numbers in documents
    // Order matters - more specific patterns first
    const patterns = [
      /Page:\s*(\d+)/i,           // "Page: 11"
      /Pg\.\s*(\d+)/i,            // "Pg. 11"
      /Page\s+(\d+)\s+of/i,       // "Page 11 of"
      /Page\s+(\d+)/i,            // "Page 11"
      /\(Page\s+(\d+)\)/i,        // "(Page 11)"
      /^Page\s+(\d+)$/i,          // "Page 11" (standalone line)
    ];

    for (const pattern of patterns) {
      const matches = pageText.match(pattern);
      if (matches && matches[1]) {
        const pageNum = parseInt(matches[1], 10);
        // Reasonable range check (1 to 9999)
        if (pageNum > 0 && pageNum < 10000) {
          return pageNum;
        }
      }
    }
    
    return null;
  }

  /**
   * Calculate page number for a character position in text
   * @param {number} charPosition - Character position in full text
   * @param {Array<string>} pageTexts - Array of page texts (fallback)
   * @param {Array<Object>} pagePositions - Array of { pageNumber, startPos, endPos, internalPageNumber } (preferred)
   * @returns {Object} Page information { pageNumber, pageRange, internalPageNumber, displayPageNumber }
   */
  getPageForPosition(charPosition, pageTexts, pagePositions = null) {
    // Use pagePositions if available (more accurate)
    if (pagePositions && pagePositions.length > 0) {
      for (const pagePos of pagePositions) {
        if (charPosition >= pagePos.startPos && charPosition <= pagePos.endPos) {
          // Prefer internal page number if available, fallback to PDF page index
          const displayPage = pagePos.internalPageNumber || pagePos.pageNumber;
          return {
            pageNumber: pagePos.pageNumber, // PDF page index for tracking
            internalPageNumber: pagePos.internalPageNumber || null, // Internal page number from document
            displayPageNumber: displayPage, // What to show to users
            pageRange: `${displayPage}`
          };
        }
      }

      // If beyond all pages, return last page
      const lastPage = pagePositions[pagePositions.length - 1];
      const displayPage = lastPage.internalPageNumber || lastPage.pageNumber;
      return {
        pageNumber: lastPage.pageNumber,
        internalPageNumber: lastPage.internalPageNumber || null,
        displayPageNumber: displayPage,
        pageRange: `${displayPage}`
      };
    }

    // Fallback to old method if pagePositions not available
    if (!pageTexts || pageTexts.length === 0) {
      return { pageNumber: 1, pageRange: '1' };
    }

    let currentPos = 0;
    for (let i = 0; i < pageTexts.length; i++) {
      const pageLength = pageTexts[i].length + 1; // +1 for newline
      if (charPosition < currentPos + pageLength) {
        return {
          pageNumber: i + 1,
          pageRange: `${i + 1}`
        };
      }
      currentPos += pageLength;
    }

    // If beyond last page, return last page
    return {
      pageNumber: pageTexts.length,
      pageRange: `${pageTexts.length}`
    };
  }

  /**
   * Split text into chunks with overlap and page tracking
   * @param {string} text - Text to split
   * @param {Object} metadata - Metadata to attach to each chunk
   * @returns {Array<Object>} Array of text chunks with metadata including page numbers
   */
  splitText(text, metadata = {}) {
    try {
      if (!text || text.trim().length === 0) {
        throw new Error('Text is empty, cannot split');
      }

      const chunks = [];
      let startIndex = 0;
      let chunkIndex = 0;
      const pageTexts = metadata.pageTexts || [];
      const pagePositions = metadata.pagePositions || null; // Use position map if available

      while (startIndex < text.length) {
        // Calculate end index for this chunk
        const endIndex = Math.min(startIndex + this.chunkSize, text.length);
        
        // Extract chunk
        let chunk = text.slice(startIndex, endIndex);
        const chunkStartIndex = startIndex;
        
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

        // Calculate page information for this chunk
        const chunkEndIndex = startIndex;
        const startPage = this.getPageForPosition(chunkStartIndex, pageTexts, pagePositions);
        const endPage = this.getPageForPosition(chunkEndIndex - 1, pageTexts, pagePositions);
        
        // Determine page range
        let pageRange;
        if (startPage.pageNumber === endPage.pageNumber) {
          pageRange = `${startPage.pageNumber}`;
        } else {
          pageRange = `${startPage.pageNumber}-${endPage.pageNumber}`;
        }

        // Add chunk with metadata including page information
        // Exclude pageTexts and pagePositions from metadata (they're large and only needed during chunking, not storage)
        const { pageTexts: _, pagePositions: __, ...metadataWithoutPageTexts } = metadata;
        chunks.push({
          text: chunk.trim(),
          chunkIndex: chunkIndex++,
          startChar: chunkStartIndex,
          endChar: chunkEndIndex,
          pageNumber: startPage.pageNumber, // Primary page (where chunk starts)
          pageRange: pageRange, // Full range if chunk spans pages
          ...metadataWithoutPageTexts, // Spread metadata without pageTexts
          chunkSize: chunk.length
        });
      }

      logger.info('Text split into chunks with page tracking', {
        totalChunks: chunks.length,
        totalTextLength: text.length,
        totalPages: pageTexts.length,
        avgChunkSize: Math.round(chunks.reduce((sum, c) => sum + c.text.length, 0) / chunks.length)
      });

      // Diagnostic: Log sample chunks with page numbers to verify tracking
      if (chunks.length > 0) {
        const sampleChunks = [chunks[0], chunks[Math.floor(chunks.length / 2)], chunks[chunks.length - 1]].filter(Boolean);
        logger.info('Sample chunks with page numbers (diagnostic)', {
          samples: sampleChunks.map(c => ({
            chunkIndex: c.chunkIndex,
            pageNumber: c.pageNumber,
            pageRange: c.pageRange,
            textPreview: c.text.substring(0, 50) + '...',
            startChar: c.startChar,
            endChar: c.endChar
          }))
        });
      }

      return chunks;
    } catch (error) {
      logger.error('Text splitting failed', error);
      throw new Error(`Failed to split text: ${error.message}`);
    }
  }

  /**
   * Split text into chunks by page boundaries (one or more chunks per page)
   * This ensures each chunk has accurate page attribution
   * @param {Array<string>} pageTexts - Array of text for each page
   * @param {Object} metadata - Metadata to attach to each chunk
   * @returns {Array<Object>} Array of text chunks with metadata including page numbers
   */
  splitTextByPages(pageTexts, metadata = {}) {
    try {
      if (!pageTexts || pageTexts.length === 0) {
        throw new Error('Page texts array is empty, cannot split');
      }

      const chunks = [];
      let chunkIndex = 0;
      const maxChunkSize = this.chunkSize; // e.g., 1500 chars
      const internalPageMap = metadata.internalPageMap || {}; // Get mapping from metadata

      pageTexts.forEach((pageText, pageIndex) => {
        const pdfPageNumber = pageIndex + 1; // PDF page index (1-based)
        const internalPageNumber = internalPageMap[pdfPageNumber] || null; // Internal page number from document
        const displayPageNumber = internalPageNumber || pdfPageNumber; // What to show to users
        const trimmedPageText = pageText.trim();

        if (trimmedPageText.length === 0) {
          logger.warn(`Page ${displayPageNumber} (PDF index: ${pdfPageNumber}) is empty, skipping`);
          return; // Skip empty pages
        }

        // If page is small enough, keep as single chunk
        if (trimmedPageText.length <= maxChunkSize) {
          chunks.push({
            text: trimmedPageText,
            chunkIndex: chunkIndex++,
            pageNumber: pdfPageNumber, // PDF page index for tracking
            internalPageNumber: internalPageNumber, // Internal page number from document
            displayPageNumber: displayPageNumber, // What to show to users
            pageRange: `${displayPageNumber}`,
            ...metadata,
            chunkSize: trimmedPageText.length
          });
        } else {
          // Page is too large, split it into multiple chunks while preserving page number
          let startIndex = 0;

          while (startIndex < trimmedPageText.length) {
            const endIndex = Math.min(startIndex + maxChunkSize, trimmedPageText.length);
            let chunk = trimmedPageText.slice(startIndex, endIndex);

            // Try to split at natural boundaries if not at end
            if (endIndex < trimmedPageText.length) {
              const overlapStart = Math.max(0, endIndex - this.chunkOverlap);
              const overlapRegion = trimmedPageText.slice(overlapStart, endIndex);

              // Try paragraph break first
              const paraBreak = overlapRegion.lastIndexOf('\n\n');
              if (paraBreak !== -1) {
                chunk = trimmedPageText.slice(startIndex, overlapStart + paraBreak);
                startIndex = overlapStart + paraBreak + 2;
              } else {
                // Try sentence break
                const sentenceBreak = overlapRegion.lastIndexOf('. ');
                if (sentenceBreak !== -1) {
                  chunk = trimmedPageText.slice(startIndex, overlapStart + sentenceBreak + 1);
                  startIndex = overlapStart + sentenceBreak + 2;
                } else {
                  // Try line break
                  const lineBreak = overlapRegion.lastIndexOf('\n');
                  if (lineBreak !== -1) {
                    chunk = trimmedPageText.slice(startIndex, overlapStart + lineBreak);
                    startIndex = overlapStart + lineBreak + 1;
                  } else {
                    // Try word boundary
                    const wordBreak = overlapRegion.lastIndexOf(' ');
                    if (wordBreak !== -1) {
                      chunk = trimmedPageText.slice(startIndex, overlapStart + wordBreak);
                      startIndex = overlapStart + wordBreak + 1;
                    } else {
                      // No boundary found, use fixed size
                      startIndex = startIndex + maxChunkSize - this.chunkOverlap;
                    }
                  }
                }
              }
            } else {
              // Last chunk of page
              startIndex = trimmedPageText.length;
            }

            chunks.push({
              text: chunk.trim(),
              chunkIndex: chunkIndex++,
              pageNumber: pdfPageNumber, // PDF page index for tracking
              internalPageNumber: internalPageNumber, // Internal page number from document
              displayPageNumber: displayPageNumber, // What to show to users
              pageRange: `${displayPageNumber}`, // Always single page since we chunk by page
              ...metadata,
              chunkSize: chunk.length
            });
          }
        }
      });

      logger.info('Text split into page-based chunks', {
        totalChunks: chunks.length,
        totalPages: pageTexts.length,
        avgChunksPerPage: (chunks.length / pageTexts.length).toFixed(2),
        avgChunkSize: Math.round(chunks.reduce((sum, c) => sum + c.text.length, 0) / chunks.length)
      });

      // Diagnostic: Log sample chunks to verify page tracking
      if (chunks.length > 0) {
        const sampleChunks = [
          chunks[0],
          chunks[Math.floor(chunks.length / 3)],
          chunks[Math.floor(2 * chunks.length / 3)],
          chunks[chunks.length - 1]
        ].filter(Boolean);

        logger.info('Sample page-based chunks (diagnostic)', {
          samples: sampleChunks.map(c => ({
            chunkIndex: c.chunkIndex,
            pageNumber: c.pageNumber,
            pageRange: c.pageRange,
            textLength: c.text.length,
            textPreview: c.text.substring(0, 60) + '...'
          }))
        });
      }

      return chunks;
    } catch (error) {
      logger.error('Page-based text splitting failed', error);
      throw new Error(`Failed to split text by pages: ${error.message}`);
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

