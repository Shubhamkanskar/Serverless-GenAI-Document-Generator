/**
 * Excel Service
 * Handles generation of Excel files (.xlsx) with structured data
 * Uses ExcelJS for workbook creation and formatting
 */

import ExcelJS from 'exceljs';
import { logger } from '../utils/logger.js';

class ExcelService {
  /**
   * Generate Excel checksheet from structured data with frequency-based tabs
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

      logger.info(`Generating Excel checksheet with ${items.length} items organized by frequency`, { fileName });

      // Create workbook
      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'GenAI Document Generator';
      workbook.created = new Date();
      workbook.modified = new Date();

      // Group items by frequency
      const frequencyGroups = {
        daily: [],
        weekly: [],
        monthly: [],
        quarterly: [],
        annually: [],
        yearly: [],
        other: []
      };

      items.forEach((item) => {
        const freq = (item.frequency || '').toLowerCase().trim();
        if (freq.includes('daily')) {
          frequencyGroups.daily.push(item);
        } else if (freq.includes('weekly')) {
          frequencyGroups.weekly.push(item);
        } else if (freq.includes('monthly')) {
          frequencyGroups.monthly.push(item);
        } else if (freq.includes('quarterly') || freq.includes('quarter')) {
          frequencyGroups.quarterly.push(item);
        } else if (freq.includes('annual') || freq.includes('yearly') || freq.includes('year')) {
          frequencyGroups.annually.push(item);
        } else {
          frequencyGroups.other.push(item);
        }
      });

      // Define frequency order and tab names
      const frequencyOrder = [
        { key: 'daily', name: 'Daily', color: 'FFFFC7CE' }, // Red
        { key: 'weekly', name: 'Weekly', color: 'FFFFEB9C' }, // Yellow
        { key: 'monthly', name: 'Monthly', color: 'FFC6EFCE' }, // Green
        { key: 'quarterly', name: 'Quarterly', color: 'FFD9E1F2' }, // Light blue
        { key: 'annually', name: 'Annually', color: 'FFC6E0F4' }, // Blue
        { key: 'other', name: 'Other', color: 'FFE7E6E6' } // Gray
      ];

      // Create worksheets for each frequency that has items
      frequencyOrder.forEach((freqConfig) => {
        const freqItems = frequencyGroups[freqConfig.key];
        if (freqItems.length > 0) {
          this.createFrequencyWorksheet(workbook, freqConfig.name, freqItems, freqConfig.color);
        }
      });

      // If no items were categorized, create a default "All Items" sheet
      if (items.length > 0 && Object.values(frequencyGroups).every(group => group.length === 0)) {
        this.createFrequencyWorksheet(workbook, 'All Items', items, 'FF4472C4');
      }

      // Add source citation sheet if metadata includes sources
      if (data.metadata && data.metadata.sources && data.metadata.sources.length > 0) {
        const citationSheet = workbook.addWorksheet('Source Citations', {
          properties: { tabColor: { argb: 'FF95B3D7' } } // Light blue
        });
        
        // Title
        citationSheet.mergeCells('A1:B1');
        const citationTitle = citationSheet.getCell('A1');
        citationTitle.value = '📚 SOURCE DOCUMENT REFERENCES';
        citationTitle.font = { name: 'Calibri', bold: true, size: 16, color: { argb: 'FF1F4E78' } };
        citationTitle.alignment = { horizontal: 'center', vertical: 'middle' };
        citationSheet.getRow(1).height = 30;
        
        // Description
        citationSheet.mergeCells('A2:B2');
        const citationDesc = citationSheet.getCell('A2');
        citationDesc.value = 'All checksheet items are extracted from the following source documents:';
        citationDesc.font = { italic: true, size: 11 };
        citationSheet.getRow(2).height = 20;
        
        // Add blank row
        citationSheet.addRow([]);
        
        // Headers
        const headerRow = citationSheet.addRow(['#', 'Source Reference']);
        headerRow.font = { bold: true, size: 11 };
        headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E1F2' } };
        
        // Add sources
        data.metadata.sources.forEach((source, index) => {
          const row = citationSheet.addRow([index + 1, source]);
          row.alignment = { vertical: 'top', wrapText: true };
        });
        
        // Format columns
        citationSheet.getColumn(1).width = 5;
        citationSheet.getColumn(2).width = 80;
        
        // Add border to citation rows
        for (let i = 4; i <= 4 + data.metadata.sources.length; i++) {
          const row = citationSheet.getRow(i);
          row.eachCell({ includeEmpty: true }, (cell) => {
            cell.border = {
              top: { style: 'thin' },
              left: { style: 'thin' },
              bottom: { style: 'thin' },
              right: { style: 'thin' }
            };
          });
        }
        
        logger.info('Added source citations sheet', { sourceCount: data.metadata.sources.length });
      }

      logger.info('Excel checksheet with frequency tabs generated', {
        fileName,
        totalItems: items.length,
        sheets: workbook.worksheets.map(ws => ({ name: ws.name, itemCount: ws.rowCount - 4 }))
      });

      // Generate buffer
      const buffer = await workbook.xlsx.writeBuffer();
      
      logger.info('Excel checksheet generated successfully', {
        fileName,
        itemCount: items.length,
        bufferSize: buffer.length,
        sheetCount: workbook.worksheets.length
      });

      return buffer;
    } catch (error) {
      logger.error('Excel generation failed', error);
      throw new Error(`Failed to generate Excel file: ${error.message}`);
    }
  }

  /**
   * Create a worksheet for a specific frequency
   * @param {ExcelJS.Workbook} workbook - Workbook instance
   * @param {string} sheetName - Name of the worksheet
   * @param {Array} items - Items for this frequency
   * @param {string} tabColor - Tab color in ARGB format
   */
  createFrequencyWorksheet(workbook, sheetName, items, tabColor) {
    const worksheet = workbook.addWorksheet(sheetName, {
      properties: { tabColor: { argb: tabColor } }
    });

      // Add title row (now H1 for 8 columns)
      worksheet.mergeCells('A1:H1');
      const titleCell = worksheet.getCell('A1');
      titleCell.value = '🔧 MAINTENANCE INSPECTION CHECKSHEET 🔧';
      titleCell.font = {
        name: 'Calibri',
        bold: true,
        size: 18,
        color: { argb: 'FFFFFFFF' }
      };
      titleCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF1F4E78' } // Dark blue
      };
      titleCell.alignment = {
        vertical: 'middle',
        horizontal: 'center'
      };
      worksheet.getRow(1).height = 35;

      // Add metadata row with sheet name (now H2 for 8 columns)
      worksheet.mergeCells('A2:H2');
      const metaCell = worksheet.getCell('A2');
      metaCell.value = `${sheetName} Frequency | Generated: ${new Date().toLocaleString('en-US', { dateStyle: 'long', timeStyle: 'short' })}`;
      metaCell.font = { italic: true, size: 10, color: { argb: 'FF666666' } };
      metaCell.alignment = { horizontal: 'center' };
      worksheet.getRow(2).height = 18;

      // Empty row for spacing
      worksheet.addRow([]);

      // Define columns with proper widths (row 4 will be headers)
      worksheet.columns = [
        { header: '№', key: 'number', width: 5 },
        { header: 'Item Name', key: 'itemName', width: 25 },
        { header: 'Inspection Point', key: 'inspectionPoint', width: 40 },
        { header: 'Frequency', key: 'frequency', width: 15 },
        { header: 'Expected Status', key: 'expectedStatus', width: 22 },
        { header: 'Notes', key: 'notes', width: 30 },
        { header: 'Source Reference', key: 'source', width: 35 },
        { header: 'Actual Status ✓', key: 'status', width: 18 }
      ];

      // Style header row (now row 4)
      const headerRow = worksheet.getRow(4);
      headerRow.font = {
        name: 'Calibri',
        bold: true,
        size: 11,
        color: { argb: 'FFFFFFFF' }
      };
      headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF4472C4' } // Medium blue
      };
      headerRow.alignment = {
        vertical: 'middle',
        horizontal: 'center',
        wrapText: true
      };
      headerRow.height = 30;

      // Add data rows
      items.forEach((item, index) => {
        // Validate item structure
        const rowData = {
          number: index + 1,
          itemName: item.itemName || item.name || '',
          inspectionPoint: item.inspectionPoint || item.inspection || '',
          frequency: item.frequency || sheetName, // Use sheet name as frequency if not specified
          expectedStatus: item.expectedStatus || item.status || '',
          notes: item.notes || item.note || '',
          // Build source reference with explicit page number handling
          source: (() => {
            if (item.source && (item.source.includes('Page') || item.source.includes('page'))) {
              return item.source;
            } else if (item.sourcePage || item.pageNumber) {
              const page = item.sourcePage || item.pageNumber;
              const file = item.sourceFile || item.fileName || item.source || 'Document';
              return `${file}, Page ${page}`;
            } else if (item.source) {
              return item.source;
            } else if (item.sourceFile) {
              return item.sourceFile;
            } else {
              return 'Unknown';
            }
          })(),
          status: '' // Empty for user to fill
        };

        const row = worksheet.addRow(rowData);

        // Alternate row colors for better readability
        if (index % 2 === 0) {
          row.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFF8F9FA' } // Very light gray
          };
        } else {
          row.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFFFFFFF' } // White
          };
        }

        // Set row height
        row.height = 22;

        // Style number column
        row.getCell('number').alignment = { horizontal: 'center', vertical: 'middle' };
        row.getCell('number').font = { bold: true, size: 10, color: { argb: 'FF666666' } };

        // Center align frequency and status columns
        row.getCell('frequency').alignment = { horizontal: 'center', vertical: 'middle' };
        row.getCell('status').alignment = { horizontal: 'center', vertical: 'middle' };
        row.getCell('expectedStatus').alignment = { horizontal: 'center', vertical: 'middle' };

        // Color code frequency cell with tab color
        row.getCell('frequency').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: tabColor } };

        // Wrap text in inspection point, notes, and source
        row.getCell('inspectionPoint').alignment = { wrapText: true, vertical: 'top' };
        row.getCell('notes').alignment = { wrapText: true, vertical: 'top' };
        row.getCell('source').alignment = { wrapText: true, vertical: 'top' };
        row.getCell('source').font = { size: 9, italic: true, color: { argb: 'FF666666' } };
      });

      // Apply borders to all cells (starting from row 4 - headers)
      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber >= 4) { // Only apply to header and data rows
          row.eachCell((cell) => {
            cell.border = {
              top: { style: 'thin', color: { argb: 'FFCCCCCC' } },
              left: { style: 'thin', color: { argb: 'FFCCCCCC' } },
              bottom: { style: 'thin', color: { argb: 'FFCCCCCC' } },
              right: { style: 'thin', color: { argb: 'FFCCCCCC' } }
            };
          });
        }
      });

      // Add data validation for Status column (Pass/Fail/N/A dropdown)
      const statusColumn = 'G'; // Status column
      for (let i = 5; i <= items.length + 4; i++) { // Starting from row 5 (first data row after header)
        worksheet.getCell(`${statusColumn}${i}`).dataValidation = {
          type: 'list',
          allowBlank: true,
          formulae: ['"✓ Pass,✗ Fail,⚠ Issue,N/A"'],
          showErrorMessage: true,
          errorTitle: 'Invalid Entry',
          error: 'Please select from the dropdown list'
        };
      }

      // Add auto-filter to header row
      worksheet.autoFilter = {
        from: { row: 4, column: 1 },
        to: { row: 4, column: 7 }
      };

      // Freeze rows above data (title, metadata, blank row, and header)
      worksheet.views = [
        {
          state: 'frozen',
          ySplit: 4, // Freeze first 4 rows
          xSplit: 0,
          topLeftCell: 'A5',
          activeCell: 'A5',
          showGridLines: true
        }
      ];

      // Add legend/instructions at the bottom
      const lastRow = items.length + 5;
      worksheet.mergeCells(`A${lastRow}:G${lastRow}`);
      const legendCell = worksheet.getCell(`A${lastRow}`);
      legendCell.value = `💡 Instructions: Fill in "Actual Status" column during inspection. Use dropdown for status (✓ Pass / ✗ Fail / ⚠ Issue / N/A). This sheet contains ${sheetName.toLowerCase()} inspection items.`;
      legendCell.font = { italic: true, size: 9, color: { argb: 'FF666666' } };
      legendCell.alignment = { horizontal: 'center', wrapText: true };
      legendCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFFFF9E6' }
      };
      worksheet.getRow(lastRow).height = 35;

      // Auto-fit columns (with minimum width)
      worksheet.columns.forEach((column) => {
        if (column.header) {
          column.width = Math.max(column.width || 10, 10);
        }
      });
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

