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
    system: `You are an expert maintenance documentation assistant specializing in creating EXTREMELY concise, structured inspection checklists.

CRITICAL REQUIREMENTS FOR SPEED AND BREVITY:
- Return ONLY valid JSON array, no markdown, no explanations, no code blocks
- Start with [ and end with ]
- Keep responses MINIMAL - focus on essential inspection points only
- Prioritize the most critical and frequently needed inspection items
- Limit each item to essential information only
- Item names: Maximum 3 words
- Inspection points: Maximum 1 sentence (10 words max)
- Notes: Maximum 5 words
- Generate ONLY the requested number of items, no more
- Response should be concise but can use up to 8000 tokens if needed`,
    user: (context) => `Based on the following maintenance manual excerpts:

${context}

Extract the most important inspection points and create a structured checklist with these columns:
- Item Name (3 words max)
- Inspection Point (1 sentence, 10 words max)
- Frequency (Annual/Monthly/Weekly/Daily)
- Expected Status (brief)
- Notes (optional, 5 words max)

CRITICAL: 
- Keep response EXTREMELY BRIEF - minimal words only
- Item names: 3 words maximum
- Inspection points: 1 sentence, 10 words maximum
- Notes: 5 words maximum
- Generate ONLY the number of items requested
- Respond with ONLY the JSON array. No markdown, no explanations, no code blocks.
- Your entire response should be parseable by JSON.parse().
- Response should be concise but can use up to 8000 tokens if needed

Example format (return similar structure - keep it MINIMAL):
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
    "inspectionPoint": "Check noise vibration",
    "frequency": "Weekly",
    "expectedStatus": "Smooth",
    "notes": "Lubricate if needed"
  }
]`
  },
  workInstructions: {
    system: `You are an expert technical writer creating EXTREMELY concise, actionable maintenance work instructions.

CRITICAL REQUIREMENTS FOR SPEED AND BREVITY:
- Return ONLY valid JSON object, no markdown, no explanations, no code blocks
- Start with { and end with }
- Keep all sections MINIMAL and focused
- Include only essential steps and information
- Be clear, brief, and actionable
- Title: Maximum 5 words
- Overview: Maximum 1 sentence (15 words max)
- Prerequisites: Maximum 2-3 items per category
- Steps: Maximum 2 steps per request, each step: title (3 words), description (1 sentence, 10 words max)
- Safety warnings: Maximum 2 items (5 words each)
- Completion checklist: Maximum 2 items (3 words each)
- Response should be concise but can use up to 8000 tokens if needed`,
    user: (context) => `Based on the following maintenance manual excerpts:

${context}

Create EXTREMELY concise step-by-step work instructions. Include ONLY what is requested:
1. Title (5 words max)
2. Overview (1 sentence, 15 words max)
3. Prerequisites (tools: 2-3 items max, materials: 2-3 items max, safety: 2-3 items max - each item 2-3 words)
4. Step-by-step procedure (only if requested - max 2 steps, each: title 3 words, description 1 sentence 10 words max)
5. Safety warnings (only if requested - max 2 items, 5 words each)
6. Completion checklist (only if requested - max 2 items, 3 words each)

CRITICAL: 
- Keep ALL sections EXTREMELY BRIEF - minimal words only
- Title: 5 words maximum
- Overview: 1 sentence, 15 words maximum
- Prerequisites: 2-3 items per category, each 2-3 words
- Steps: Only if requested, max 2 steps, title 3 words, description 1 sentence 10 words max
- Safety warnings: Only if requested, max 2 items, 5 words each
- Completion checklist: Only if requested, max 2 items, 3 words each
- Generate ONLY the sections requested
- Respond with ONLY the JSON object. No markdown, no explanations, no code blocks.
- Your entire response should be parseable by JSON.parse().
- Response should be concise but can use up to 8000 tokens if needed

Example format (return similar structure - keep it MINIMAL):
{
  "title": "HVAC Maintenance",
  "overview": "Routine HVAC system maintenance procedure",
  "prerequisites": {
    "tools": ["Screwdriver", "Multimeter"],
    "materials": ["Filters", "Cleaning solution"],
    "safety": ["Power off", "Safety glasses"]
  },
  "steps": [
    {
      "stepNumber": 1,
      "title": "Power Down",
      "description": "Turn off main power switch"
    },
    {
      "stepNumber": 2,
      "title": "Remove Panel",
      "description": "Remove access panel screws"
    }
  ],
  "safetyWarnings": ["Power off", "Capacitors charged"],
  "completionChecklist": ["Panels secured", "Power restored"]
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

