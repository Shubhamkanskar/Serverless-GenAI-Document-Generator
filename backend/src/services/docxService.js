/**
 * DOCX Service
 * Handles generation of Word documents (.docx) with structured work instructions
 * Uses docx library for document creation and formatting
 */

import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  PageBreak,
  ExternalHyperlink,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle
} from 'docx';
import { logger } from '../utils/logger.js';

class DOCXService {
  /**
   * Generate Word document with work instructions
   * @param {Object} data - Work instructions data
   * @param {string} fileName - Optional file name for metadata
   * @returns {Promise<Buffer>} DOCX file buffer
   */
  async generateWorkInstructions(data, fileName = 'work-instructions') {
    try {
      // Validate input
      this.validateWorkInstructionsData(data);

      logger.info('Generating DOCX work instructions', {
        fileName,
        hasTitle: !!data.title,
        stepCount: data.steps?.length || 0
      });

      const children = [];

      // Cover Page Header
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: '═══════════════════════════════════════',
              color: '1F4E78',
              size: 24
            })
          ],
          alignment: AlignmentType.CENTER,
          spacing: { after: 200, before: 100 }
        })
      );

      // Title
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: '📋 ' + (data.title || 'Work Instructions').toUpperCase(),
              bold: true,
              size: 40, // 20pt
              color: '1F4E78'
            })
          ],
          heading: HeadingLevel.HEADING_1,
          alignment: AlignmentType.CENTER,
          spacing: { after: 300, before: 200 },
          border: {
            top: { color: '1F4E78', space: 1, style: BorderStyle.SINGLE, size: 24 },
            bottom: { color: '1F4E78', space: 1, style: BorderStyle.SINGLE, size: 24 }
          }
        })
      );

      // Cover Page Footer
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: '═══════════════════════════════════════',
              color: '1F4E78',
              size: 24
            })
          ],
          alignment: AlignmentType.CENTER,
          spacing: { after: 100, before: 200 }
        })
      );

      // Metadata
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: `Generated: ${new Date().toLocaleString('en-US', { dateStyle: 'full', timeStyle: 'short' })}`,
              italics: true,
              size: 18,
              color: '666666'
            })
          ],
          alignment: AlignmentType.CENTER,
          spacing: { after: 600 }
        })
      );

      // Overview Section
      if (data.overview) {
        children.push(
          this.createSectionHeading('Overview', 200)
        );
        children.push(
          new Paragraph({
            text: data.overview,
            spacing: { after: 300 }
          })
        );
      }

      // Prerequisites Section
      // Handle both formats: array of strings OR object with tools/materials/safety
      let prerequisitesList = [];
      if (data.prerequisites) {
        if (Array.isArray(data.prerequisites)) {
          // Format 1: Flat array of strings
          prerequisitesList = data.prerequisites;
        } else if (typeof data.prerequisites === 'object' && !Array.isArray(data.prerequisites)) {
          // Format 2: Object with tools, materials, safety
          const tools = Array.isArray(data.prerequisites.tools) ? data.prerequisites.tools : [];
          const materials = Array.isArray(data.prerequisites.materials) ? data.prerequisites.materials : [];
          const safety = Array.isArray(data.prerequisites.safety) ? data.prerequisites.safety : [];
          
          // Flatten into a single array with category labels
          if (tools.length > 0) {
            prerequisitesList.push('Tools:', ...tools.map(t => `  • ${t}`));
          }
          if (materials.length > 0) {
            prerequisitesList.push('Materials:', ...materials.map(m => `  • ${m}`));
          }
          if (safety.length > 0) {
            prerequisitesList.push('Safety Requirements:', ...safety.map(s => `  • ${s}`));
          }
        }
      }
      
      if (prerequisitesList.length > 0) {
        children.push(
          this.createSectionHeading('Prerequisites', 200)
        );
        
        prerequisitesList.forEach(prereq => {
          if (prereq && typeof prereq === 'string' && prereq.trim()) {
            const isCategory = prereq.endsWith(':');
            children.push(
              new Paragraph({
                children: [
                  new TextRun({
                    text: isCategory ? prereq.trim() : '• ' + prereq.trim(),
                    bold: isCategory,
                    size: isCategory ? 24 : 22
                  })
                ],
                spacing: { after: isCategory ? 50 : 100 },
                indent: { left: isCategory ? 0 : 200 }
              })
            );
          }
        });
        children.push(new Paragraph({ text: '' })); // Spacing
      }

      // Steps Section
      if (data.steps && Array.isArray(data.steps) && data.steps.length > 0) {
        children.push(
          this.createSectionHeading('📝 Step-by-Step Procedure', 200)
        );
        
        data.steps.forEach((step, index) => {
          const stepNumber = step.stepNumber || index + 1;
          const description = step.description || step.text || '';
          const details = step.details || step.additionalInfo || '';

          if (description) {
            // Step header with number box
            children.push(
              new Paragraph({
                children: [
                  new TextRun({
                    text: `  ${stepNumber}  `,
                    bold: true,
                    size: 22,
                    color: 'FFFFFF'
                  }),
                  new TextRun({
                    text: '  ' + description,
                    bold: true,
                    size: 24,
                    color: '1F4E78'
                  })
                ],
                spacing: { before: 200, after: 120 },
                shading: {
                  type: 'clear',
                  fill: 'E7F3FF'
                },
                border: {
                  left: { color: '4472C4', space: 1, style: BorderStyle.SINGLE, size: 24 }
                }
              })
            );

            // Step details
            if (details) {
              children.push(
                new Paragraph({
                  children: [
                    new TextRun({
                      text: '➤ ',
                      color: '4472C4',
                      size: 20
                    }),
                    new TextRun({
                      text: details,
                      size: 22
                    })
                  ],
                  indent: { left: 720 },
                  spacing: { after: 180 }
                })
              );
            }

            // Add checkbox for completion
            children.push(
              new Paragraph({
                children: [
                  new TextRun({
                    text: '☐ ',
                    size: 20,
                    color: '666666'
                  }),
                  new TextRun({
                    text: 'Completed',
                    italics: true,
                    size: 18,
                    color: '666666'
                  })
                ],
                indent: { left: 720 },
                spacing: { after: 100 }
              })
            );
          }
        });
      }

      // Safety Warnings Section
      if (data.safetyWarnings && Array.isArray(data.safetyWarnings) && data.safetyWarnings.length > 0) {
        children.push(
          this.createSectionHeading('⚠️ Safety Warnings & Precautions', 200)
        );
        
        data.safetyWarnings.forEach((warning, index) => {
          if (warning && typeof warning === 'string' && warning.trim()) {
            children.push(
              new Paragraph({
                children: [
                  new TextRun({
                    text: '⚠️  ',
                    bold: true,
                    size: 26,
                    color: 'D32F2F'
                  }),
                  new TextRun({
                    text: `WARNING ${index + 1}: `,
                    bold: true,
                    size: 22,
                    color: 'D32F2F'
                  }),
                  new TextRun({
                    text: warning.trim(),
                    bold: true,
                    size: 22,
                    color: '000000'
                  })
                ],
                spacing: { after: 150, before: 100 },
                indent: { left: 360 },
                shading: {
                  fill: 'FFE5E5',
                  type: 'clear'
                },
                border: {
                  left: { color: 'D32F2F', space: 1, style: BorderStyle.DOUBLE, size: 24 },
                  top: { color: 'FFB0B0', space: 1, style: BorderStyle.SINGLE, size: 6 },
                  bottom: { color: 'FFB0B0', space: 1, style: BorderStyle.SINGLE, size: 6 }
                }
              })
            );
          }
        });

        children.push(new Paragraph({ text: '', spacing: { after: 200 } }));
      }

      // Completion Checklist
      if (data.completionChecklist && Array.isArray(data.completionChecklist) && data.completionChecklist.length > 0) {
        children.push(
          this.createSectionHeading('✓ Completion Checklist', 200)
        );
        
        children.push(
          new Paragraph({
            children: [
              new TextRun({
                text: 'Verify all items below before marking this work instruction as complete:',
                italics: true,
                size: 20,
                color: '666666'
              })
            ],
            spacing: { after: 200 }
          })
        );

        data.completionChecklist.forEach((item, index) => {
          if (item && typeof item === 'string' && item.trim()) {
            children.push(
              new Paragraph({
                children: [
                  new TextRun({
                    text: '☐  ',
                    bold: true,
                    size: 26,
                    color: '4CAF50'
                  }),
                  new TextRun({
                    text: item.trim(),
                    size: 22
                  })
                ],
                spacing: { after: 120 },
                indent: { left: 360 },
                shading: {
                  fill: index % 2 === 0 ? 'F5F5F5' : 'FFFFFF',
                  type: 'clear'
                }
              })
            );
          }
        });
      }

      // Add signature section
      children.push(
        new Paragraph({
          text: '',
          spacing: { before: 600 }
        })
      );

      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: '─────────────────────────────────────────────────────────',
              color: 'CCCCCC'
            })
          ],
          spacing: { after: 300 }
        })
      );

      // Signature table
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: 'Performed By: ____________________________    Date: ____________    Time: ____________',
              size: 20
            })
          ],
          spacing: { after: 200 }
        })
      );

      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: 'Verified By:   ____________________________    Date: ____________    Time: ____________',
              size: 20
            })
          ],
          spacing: { after: 400 }
        })
      );

      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: '─────────────────────────────────────────────────────────',
              color: 'CCCCCC'
            })
          ],
          spacing: { after: 200 }
        })
      );

      // Footer text
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: '📄 This document was auto-generated by GenAI Document Generator',
              italics: true,
              size: 16,
              color: '999999'
            })
          ],
          alignment: AlignmentType.CENTER,
          spacing: { before: 200 }
        })
      );

      // Create document
      const doc = new Document({
        creator: 'GenAI Document Generator',
        title: data.title || 'Work Instructions',
        description: 'Generated work instructions document',
        sections: [
          {
            properties: {
              page: {
                margin: {
                  top: 1440, // 1 inch
                  right: 1440,
                  bottom: 1440,
                  left: 1440
                }
              }
            },
            children
          }
        ]
      });

      // Generate buffer
      const buffer = await Packer.toBuffer(doc);
      
      logger.info('DOCX work instructions generated successfully', {
        fileName,
        bufferSize: buffer.length,
        sectionCount: this.countSections(data)
      });

      return buffer;

    } catch (error) {
      logger.error('DOCX generation failed', error);
      throw new Error(`Failed to generate DOCX file: ${error.message}`);
    }
  }

  /**
   * Create a section heading with consistent styling
   * @param {string} text - Heading text
   * @param {number} spacingBefore - Spacing before heading
   * @returns {Paragraph} Formatted heading paragraph
   */
  createSectionHeading(text, spacingBefore = 200) {
    return new Paragraph({
      children: [
        new TextRun({
          text: text,
          bold: true,
          size: 28, // 14pt
          color: '1F4E78'
        })
      ],
      heading: HeadingLevel.HEADING_2,
      spacing: { before: spacingBefore, after: 200 }
    });
  }

  /**
   * Count sections in data
   * @param {Object} data - Work instructions data
   * @returns {number} Number of sections
   */
  countSections(data) {
    let count = 1; // Title always present
    if (data.overview) count++;
    if (data.prerequisites?.length) count++;
    if (data.steps?.length) count++;
    if (data.safetyWarnings?.length) count++;
    if (data.completionChecklist?.length) count++;
    return count;
  }

  /**
   * Validate work instructions data structure
   * @param {*} data - Data to validate
   * @throws {Error} If validation fails
   */
  validateWorkInstructionsData(data) {
    if (!data) {
      throw new Error('Work instructions data is required');
    }

    if (typeof data !== 'object' || Array.isArray(data)) {
      throw new Error('Work instructions data must be an object');
    }

    // Validate prerequisites if present
    // Accept both array format and object format {tools: [], materials: [], safety: []}
    if (data.prerequisites !== undefined) {
      if (!Array.isArray(data.prerequisites) && 
          (typeof data.prerequisites !== 'object' || Array.isArray(data.prerequisites))) {
        throw new Error('Prerequisites must be an array or an object with tools, materials, and safety arrays');
      }
      
      // If it's an object, validate its structure
      if (typeof data.prerequisites === 'object' && !Array.isArray(data.prerequisites)) {
        if (data.prerequisites.tools && !Array.isArray(data.prerequisites.tools)) {
          throw new Error('Prerequisites.tools must be an array');
        }
        if (data.prerequisites.materials && !Array.isArray(data.prerequisites.materials)) {
          throw new Error('Prerequisites.materials must be an array');
        }
        if (data.prerequisites.safety && !Array.isArray(data.prerequisites.safety)) {
          throw new Error('Prerequisites.safety must be an array');
        }
      }
    }

    // Validate steps if present
    if (data.steps !== undefined) {
      if (!Array.isArray(data.steps)) {
        throw new Error('Steps must be an array');
      }

      data.steps.forEach((step, index) => {
        if (!step || typeof step !== 'object') {
          throw new Error(`Invalid step at index ${index}: must be an object`);
        }
        if (!step.description && !step.text) {
          throw new Error(`Invalid step at index ${index}: must have description or text`);
        }
      });
    }

    // Validate safety warnings if present
    if (data.safetyWarnings !== undefined) {
      if (!Array.isArray(data.safetyWarnings)) {
        throw new Error('Safety warnings must be an array');
      }
    }

    // Validate completion checklist if present
    if (data.completionChecklist !== undefined) {
      if (!Array.isArray(data.completionChecklist)) {
        throw new Error('Completion checklist must be an array');
      }
    }

    // At least one section should have content
    // Check prerequisites - handle both array and object formats
    const hasPrerequisites = Array.isArray(data.prerequisites) 
      ? data.prerequisites.length > 0
      : (data.prerequisites && typeof data.prerequisites === 'object' && (
          (data.prerequisites.tools && data.prerequisites.tools.length > 0) ||
          (data.prerequisites.materials && data.prerequisites.materials.length > 0) ||
          (data.prerequisites.safety && data.prerequisites.safety.length > 0)
        ));
    
    const hasContent = 
      data.title ||
      data.overview ||
      hasPrerequisites ||
      (data.steps && data.steps.length > 0) ||
      (data.safetyWarnings && data.safetyWarnings.length > 0) ||
      (data.completionChecklist && data.completionChecklist.length > 0);

    if (!hasContent) {
      throw new Error('Work instructions data must contain at least one section with content');
    }
  }

  /**
   * Generate a simple DOCX document from any structured data
   * @param {Object} data - Document data
   * @param {string} fileName - Optional file name
   * @returns {Promise<Buffer>} DOCX file buffer
   */
  async generateDocument(data, fileName = 'document') {
    try {
      if (!data || typeof data !== 'object') {
        throw new Error('Document data must be an object');
      }

      logger.info('Generating DOCX document', { fileName });

      const children = [];

      // Add title if present
      if (data.title) {
        children.push(
          new Paragraph({
            text: data.title,
            heading: HeadingLevel.HEADING_1,
            alignment: AlignmentType.CENTER,
            spacing: { after: 400 }
          })
        );
      }

      // Add content
      if (data.content) {
        if (Array.isArray(data.content)) {
          data.content.forEach(item => {
            if (typeof item === 'string') {
              children.push(new Paragraph({ text: item, spacing: { after: 200 } }));
            }
          });
        } else if (typeof data.content === 'string') {
          children.push(new Paragraph({ text: data.content }));
        }
      }

      const doc = new Document({
        creator: 'GenAI Document Generator',
        title: data.title || 'Document',
        sections: [
          {
            properties: {
              page: {
                margin: {
                  top: 1440,
                  right: 1440,
                  bottom: 1440,
                  left: 1440
                }
              }
            },
            children
          }
        ]
      });

      const buffer = await Packer.toBuffer(doc);
      
      logger.info('DOCX document generated successfully', {
        fileName,
        bufferSize: buffer.length
      });

      return buffer;
    } catch (error) {
      logger.error('DOCX generation failed', error);
      throw new Error(`Failed to generate DOCX file: ${error.message}`);
    }
  }
}

// Export singleton instance
export default new DOCXService();

