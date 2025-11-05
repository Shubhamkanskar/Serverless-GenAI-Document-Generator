/**
 * Prompts Configuration
 * Contains all AI prompts used for document generation
 */

/**
 * System prompt for document generation
 */
export const SYSTEM_PROMPT = `You are an expert document generator. Your task is to create well-structured, professional documents based on user requirements and context from ingested documents.

Guidelines:
- Use the provided context from ingested documents to inform your responses
- Maintain professional tone and formatting
- Structure documents clearly with appropriate headings and sections
- Ensure accuracy and relevance to the user's requirements
- Follow standard document formatting conventions`;

/**
 * Generates a prompt for document generation
 * @param {string} documentType - Type of document to generate (e.g., 'report', 'summary')
 * @param {string} userRequirements - User's specific requirements
 * @param {string} context - Relevant context from ingested documents
 * @returns {string} Complete prompt for the AI model
 */
export const generateDocumentPrompt = (documentType, userRequirements, context = '') => {
  const contextSection = context 
    ? `\n\nRelevant Context from Documents:\n${context}`
    : '';

  return `Generate a ${documentType} based on the following requirements:

${userRequirements}
${contextSection}

Please create a well-structured ${documentType} that addresses all the requirements above.`;
};

/**
 * Prompt for document summarization
 * @param {string} documentContent - Content to summarize
 * @param {number} maxLength - Maximum length of summary
 * @returns {string} Summarization prompt
 */
export const generateSummaryPrompt = (documentContent, maxLength = 500) => {
  return `Summarize the following document in approximately ${maxLength} words. Focus on key points, main ideas, and important details:

${documentContent}`;
};

/**
 * Prompt for document analysis
 * @param {string} documentContent - Content to analyze
 * @param {string} analysisType - Type of analysis requested
 * @returns {string} Analysis prompt
 */
export const generateAnalysisPrompt = (documentContent, analysisType) => {
  return `Perform a ${analysisType} analysis of the following document:

${documentContent}

Provide insights, patterns, and key findings based on the ${analysisType} perspective.`;
};

/**
 * Prompt for extracting structured data
 * @param {string} documentContent - Content to extract from
 * @param {string} dataStructure - Desired output structure
 * @returns {string} Extraction prompt
 */
export const generateExtractionPrompt = (documentContent, dataStructure) => {
  return `Extract structured data from the following document and format it as ${dataStructure}:

${documentContent}

Provide the extracted data in the requested format.`;
};

/**
 * Prompt templates for specific document types
 */
export const PROMPTS = {
  checksheet: {
    system: `You are an expert maintenance documentation assistant. 
Extract inspection points from maintenance manuals and format them as structured JSON.

CRITICAL: Your response must be ONLY valid JSON. Do not include any explanatory text, markdown formatting, or code blocks.
Start your response with [ and end with ]. No other characters before or after the JSON array.`,
    user: (context) => `Based on the following maintenance manual excerpts:

${context}

Extract all inspection points and create a structured checklist with these columns:
- Item Name
- Inspection Point
- Frequency (Annual/Monthly/Weekly/Daily)
- Expected Status
- Notes (optional)

IMPORTANT: Respond with ONLY the JSON array. No markdown, no explanations, no code blocks.
Your entire response should be parseable by JSON.parse().

Example format (return similar structure):
[
  {
    "itemName": "HVAC Filter",
    "inspectionPoint": "Check filter cleanliness",
    "frequency": "Monthly",
    "expectedStatus": "Clean",
    "notes": "Replace if dirty"
  },
  {
    "itemName": "Motor Bearings",
    "inspectionPoint": "Check for unusual noise or vibration",
    "frequency": "Weekly",
    "expectedStatus": "Smooth operation",
    "notes": "Lubricate if needed"
  }
]`
  },
  workInstructions: {
    system: `You are an expert technical writer for maintenance procedures. 
Create detailed step-by-step work instructions from maintenance manuals.

CRITICAL: Your response must be ONLY valid JSON. Do not include any explanatory text, markdown formatting, or code blocks.
Start your response with { and end with }. No other characters before or after the JSON object.`,
    user: (context) => `Based on the following maintenance manual excerpts:

${context}

Create detailed step-by-step work instructions. Include:
1. Overview section
2. Prerequisites (tools, materials, safety)
3. Step-by-step procedure (numbered)
4. Safety warnings
5. Completion checklist

IMPORTANT: Respond with ONLY the JSON object. No markdown, no explanations, no code blocks.
Your entire response should be parseable by JSON.parse().

Example format (return similar structure):
{
  "overview": "Procedure for routine HVAC system maintenance",
  "prerequisites": {
    "tools": ["Screwdriver set", "Multimeter", "Vacuum cleaner"],
    "materials": ["Replacement filters", "Cleaning solution", "Lubricant"],
    "safety": ["Ensure power is disconnected", "Wear safety glasses", "Use proper PPE"]
  },
  "steps": [
    {
      "stepNumber": 1,
      "description": "Power Down System",
      "details": "Turn off main power switch and wait 5 minutes for capacitors to discharge"
    },
    {
      "stepNumber": 2,
      "description": "Remove Access Panel",
      "details": "Use Phillips screwdriver to remove 4 screws securing the front access panel"
    }
  ],
  "safetyWarnings": ["Never work on energized equipment", "Capacitors may retain charge"],
  "completionChecklist": ["All panels secured", "Power restored", "System tested", "Documentation complete"]
}`
  }
};

/**
 * Generate checksheet prompt
 * @param {string} context - Context from ingested documents
 * @returns {Object} Object with system and user prompts
 */
export const generateChecksheetPrompt = (context) => {
  return {
    system: PROMPTS.checksheet.system,
    user: PROMPTS.checksheet.user(context)
  };
};

/**
 * Generate work instructions prompt
 * @param {string} context - Context from ingested documents
 * @returns {Object} Object with system and user prompts
 */
export const generateWorkInstructionsPrompt = (context) => {
  return {
    system: PROMPTS.workInstructions.system,
    user: PROMPTS.workInstructions.user(context)
  };
};

