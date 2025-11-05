/**
 * Excel Service
 * Handles generation of Excel files (.xlsx) with structured data
 * Uses ExcelJS for workbook creation and formatting
 */

import ExcelJS from 'exceljs';
import { logger } from '../utils/logger.js';

class ExcelService {
  /**
   * Generate Excel checksheet from structured data
   * @param {Array|Object} data - Checksheet data (array of items or object with items array)
   * @param {string} fileName - Optional file name for metadata
   * @returns {Promise<Buffer>} Excel file buffer
   */
  async generateChecksheet(data, fileName = 'checksheet') {
    try {
      // Validate input
      this.validateChecksheetData(data);

      // Extract items array from data
      const items = Array.isArray(data) ? data : (data.items || data.data || []);

      if (!Array.isArray(items) || items.length === 0) {
        throw new Error('Checksheet data must be a non-empty array or contain a non-empty items array');
      }

      logger.info(`Generating Excel checksheet with ${items.length} items`, { fileName });

      // Create workbook
      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'GenAI Document Generator';
      workbook.created = new Date();
      workbook.modified = new Date();

      // Create worksheet
      const worksheet = workbook.addWorksheet('Inspection Checksheet');

      // Define columns with proper widths
      worksheet.columns = [
        { header: 'Item Name', key: 'itemName', width: 25 },
        { header: 'Inspection Point', key: 'inspectionPoint', width: 40 },
        { header: 'Frequency', key: 'frequency', width: 15 },
        { header: 'Expected Status', key: 'expectedStatus', width: 20 },
        { header: 'Notes', key: 'notes', width: 30 },
        { header: 'Status', key: 'status', width: 15 }
      ];

      // Style header row
      const headerRow = worksheet.getRow(1);
      headerRow.font = {
        bold: true,
        size: 12,
        color: { argb: 'FFFFFFFF' }
      };
      headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF4472C4' } // Blue background
      };
      headerRow.alignment = {
        vertical: 'middle',
        horizontal: 'center'
      };
      headerRow.height = 20;

      // Add data rows
      items.forEach((item, index) => {
        // Validate item structure
        const rowData = {
          itemName: item.itemName || item.name || '',
          inspectionPoint: item.inspectionPoint || item.inspection || '',
          frequency: item.frequency || '',
          expectedStatus: item.expectedStatus || item.status || '',
          notes: item.notes || item.note || '',
          status: '' // Empty for user to fill
        };

        const row = worksheet.addRow(rowData);

        // Alternate row colors for better readability
        if (index % 2 === 0) {
          row.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFF2F2F2' } // Light gray
          };
        }

        // Set row height
        row.height = 18;

        // Center align frequency and status columns
        row.getCell('frequency').alignment = { horizontal: 'center' };
        row.getCell('status').alignment = { horizontal: 'center' };
        row.getCell('expectedStatus').alignment = { horizontal: 'center' };
      });

      // Apply borders to all cells
      worksheet.eachRow((row, rowNumber) => {
        row.eachCell((cell) => {
          cell.border = {
            top: { style: 'thin', color: { argb: 'FFD0D0D0' } },
            left: { style: 'thin', color: { argb: 'FFD0D0D0' } },
            bottom: { style: 'thin', color: { argb: 'FFD0D0D0' } },
            right: { style: 'thin', color: { argb: 'FFD0D0D0' } }
          };
        });
      });

      // Freeze header row for scrolling
      worksheet.views = [
        {
          state: 'frozen',
          ySplit: 1,
          activeCell: 'A2',
          showGridLines: true
        }
      ];

      // Auto-fit columns (with minimum width)
      worksheet.columns.forEach((column) => {
        if (column.header) {
          column.width = Math.max(column.width || 10, 10);
        }
      });

      // Generate buffer
      const buffer = await workbook.xlsx.writeBuffer();
      
      logger.info('Excel checksheet generated successfully', {
        fileName,
        itemCount: items.length,
        bufferSize: buffer.length
      });

      return buffer;
    } catch (error) {
      logger.error('Excel generation failed', error);
      throw new Error(`Failed to generate Excel file: ${error.message}`);
    }
  }

  /**
   * Validate checksheet data structure
   * @param {*} data - Data to validate
   * @throws {Error} If validation fails
   */
  validateChecksheetData(data) {
    if (!data) {
      throw new Error('Checksheet data is required');
    }

    // Allow array or object with items/data property
    if (Array.isArray(data)) {
      if (data.length === 0) {
        throw new Error('Checksheet data array cannot be empty');
      }

      // Validate each item has at least itemName or inspectionPoint
      data.forEach((item, index) => {
        if (!item || typeof item !== 'object') {
          throw new Error(`Invalid item at index ${index}: must be an object`);
        }
        if (!item.itemName && !item.name && !item.inspectionPoint && !item.inspection) {
          throw new Error(`Invalid item at index ${index}: must have itemName or inspectionPoint`);
        }
      });
    } else if (typeof data === 'object') {
      // Check if it has items or data array
      const items = data.items || data.data || [];
      if (!Array.isArray(items) || items.length === 0) {
        throw new Error('Checksheet data object must contain a non-empty items or data array');
      }
    } else {
      throw new Error('Checksheet data must be an array or an object with items/data array');
    }
  }

  /**
   * Generate Excel file with custom worksheet name
   * @param {Array} data - Data array
   * @param {string} worksheetName - Name for the worksheet
   * @param {string} fileName - Optional file name
   * @returns {Promise<Buffer>} Excel file buffer
   */
  async generateExcel(data, worksheetName = 'Sheet1', fileName = 'document') {
    try {
      if (!Array.isArray(data) || data.length === 0) {
        throw new Error('Data must be a non-empty array');
      }

      logger.info(`Generating Excel file: ${worksheetName}`, { fileName, rowCount: data.length });

      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'GenAI Document Generator';
      workbook.created = new Date();

      const worksheet = workbook.addWorksheet(worksheetName);

      // Auto-detect columns from first row
      if (data.length > 0) {
        const firstRow = data[0];
        const columns = Object.keys(firstRow).map(key => ({
          header: this.formatHeader(key),
          key: key,
          width: 20
        }));

        worksheet.columns = columns;

        // Style header row
        const headerRow = worksheet.getRow(1);
        headerRow.font = { bold: true, size: 11 };
        headerRow.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFE0E0E0' }
        };

        // Add data rows
        data.forEach((row, index) => {
          worksheet.addRow(row);
        });

        // Apply borders
        worksheet.eachRow((row) => {
          row.eachCell((cell) => {
            cell.border = {
              top: { style: 'thin' },
              left: { style: 'thin' },
              bottom: { style: 'thin' },
              right: { style: 'thin' }
            };
          });
        });
      }

      const buffer = await workbook.xlsx.writeBuffer();
      
      logger.info('Excel file generated successfully', {
        fileName,
        worksheetName,
        rowCount: data.length,
        bufferSize: buffer.length
      });

      return buffer;
    } catch (error) {
      logger.error('Excel generation failed', error);
      throw new Error(`Failed to generate Excel file: ${error.message}`);
    }
  }

  /**
   * Format header text (convert camelCase to Title Case)
   * @param {string} key - Header key
   * @returns {string} Formatted header
   */
  formatHeader(key) {
    return key
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, str => str.toUpperCase())
      .trim();
  }
}

// Export singleton instance
export default new ExcelService();

