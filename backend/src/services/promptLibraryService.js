/**
 * Prompt Library Service
 * Manages prompt libraries with multiple prompts per use case
 * Each use case can have multiple prompt variations, with one marked as active/default
 */

import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { logger } from '../utils/logger.js';
import { PROMPTS as DEFAULT_PROMPTS } from '../config/prompts.js';

const s3Client = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });
const PROMPTS_BUCKET = process.env.PROMPTS_BUCKET || process.env.S3_DOCUMENTS_BUCKET || 'genai-documents-shubham';
const PROMPTS_KEY = 'prompts/prompt-library.json';

/**
 * Get default prompt library structure
 * Each use case has a library with multiple prompt variations
 */
const getDefaultLibrary = () => {
  const now = new Date().toISOString();
  
  return {
    checksheet: {
      useCase: 'checksheet',
      activePromptId: 'detailed-comprehensive',
      prompts: [
        {
          id: 'detailed-comprehensive',
          name: '📋 Detailed Comprehensive Checksheet',
          description: 'Comprehensive inspection points with detailed notes and acceptance criteria',
          system: 'You are an expert maintenance documentation specialist. Extract ALL inspection points with maximum detail including acceptance criteria, tolerances, and detailed notes. Return ONLY valid JSON array.',
          userTemplate: `Based on the following maintenance manual excerpts:\n\n{context}\n\nCreate a comprehensive inspection checksheet with these columns:\n- Item Name (specific equipment/component)\n- Inspection Point (detailed description)\n- Frequency (Daily/Weekly/Monthly/Quarterly/Annual)\n- Expected Status (specific acceptance criteria)\n- Notes (detailed instructions, tolerances, specifications)\n\nIMPORTANT: Return ONLY a JSON array. Example:\n[\n  {\n    "itemName": "Hydraulic Pump Motor",\n    "inspectionPoint": "Check motor bearing temperature using infrared thermometer",\n    "frequency": "Weekly",\n    "expectedStatus": "≤ 70°C (158°F)",\n    "notes": "Measure at bearing housing. If temp > 80°C, immediate shutdown required"\n  }\n]`,
          version: '1.0.0',
          tags: ['detailed', 'comprehensive', 'recommended'],
          isActive: true,
          createdAt: now,
          updatedAt: now
        },
        {
          id: 'quick-simple',
          name: '⚡ Quick & Simple Checksheet',
          description: 'Simplified checklist for routine daily inspections',
          system: 'You are a maintenance checklist expert. Create simple, easy-to-follow inspection points for quick daily checks. Focus on essential items only. Return ONLY valid JSON array.',
          userTemplate: `Based on these documents:\n\n{context}\n\nCreate a simple, quick inspection checksheet focusing on:\n- Most critical items only\n- Simple yes/no or pass/fail checks\n- Daily and weekly frequencies primarily\n- Brief, clear descriptions\n\nReturn ONLY JSON array format:\n[\n  {\n    "itemName": "Safety Guards",\n    "inspectionPoint": "Verify all guards in place",\n    "frequency": "Daily",\n    "expectedStatus": "All present",\n    "notes": "Visual check"\n  }\n]`,
          version: '1.0.0',
          tags: ['simple', 'quick', 'daily'],
          isActive: false,
          createdAt: now,
          updatedAt: now
        },
        {
          id: 'safety-focused',
          name: '🛡️ Safety-Focused Checksheet',
          description: 'Emphasizes safety-critical inspection points',
          system: 'You are a safety compliance expert. Prioritize safety-critical inspection points, hazard identification, and regulatory compliance items. Return ONLY valid JSON array.',
          userTemplate: `From these documents:\n\n{context}\n\nGenerate a SAFETY-FOCUSED checksheet prioritizing:\n- Safety-critical components\n- Hazard prevention checks\n- Compliance items\n- Emergency systems\n- Personal protective equipment\n\nReturn ONLY JSON:\n[\n  {\n    "itemName": "Emergency Stop Button",\n    "inspectionPoint": "Test emergency stop functionality",\n    "frequency": "Weekly",\n    "expectedStatus": "Stops immediately",\n    "notes": "CRITICAL SAFETY - Document test results"\n  }\n]`,
          version: '1.0.0',
          tags: ['safety', 'critical', 'compliance'],
          isActive: false,
          createdAt: now,
          updatedAt: now
        },
        {
          id: 'preventive-maintenance',
          name: '🔧 Preventive Maintenance Checksheet',
          description: 'Focus on preventive maintenance tasks and schedules',
          system: 'You are a preventive maintenance specialist. Extract scheduled maintenance tasks, lubrication points, and wear items. Return ONLY valid JSON array.',
          userTemplate: `Using these documents:\n\n{context}\n\nCreate a PREVENTIVE MAINTENANCE checksheet with:\n- Lubrication points and schedules\n- Filter replacements\n- Belt/chain tension checks\n- Wear item inspections\n- Calibration requirements\n\nReturn ONLY JSON:\n[\n  {\n    "itemName": "Drive Belt Tension",\n    "inspectionPoint": "Check and adjust belt tension",\n    "frequency": "Monthly",\n    "expectedStatus": "½ inch deflection",\n    "notes": "Use tension gauge. Replace if cracked"\n  }\n]`,
          version: '1.0.0',
          tags: ['preventive', 'maintenance', 'scheduled'],
          isActive: false,
          createdAt: now,
          updatedAt: now
        },
        {
          id: 'condition-based',
          name: '📊 Condition-Based Monitoring',
          description: 'Focus on measurements, readings, and condition indicators',
          system: 'You are a condition monitoring expert. Extract measurement points, acceptable ranges, and trending data requirements. Return ONLY valid JSON array.',
          userTemplate: `From these manuals:\n\n{context}\n\nCreate a CONDITION MONITORING checksheet with:\n- Measurement points (pressure, temperature, vibration, current)\n- Acceptable ranges and tolerances\n- Trending requirements\n- Diagnostic indicators\n\nReturn ONLY JSON:\n[\n  {\n    "itemName": "Hydraulic Pressure",\n    "inspectionPoint": "Record system pressure at gauge #1",\n    "frequency": "Daily",\n    "expectedStatus": "1500-1800 PSI",\n    "notes": "Trend data. Alert if < 1400 or > 1900 PSI"\n  }\n]`,
          version: '1.0.0',
          tags: ['monitoring', 'measurements', 'trending'],
          isActive: false,
          createdAt: now,
          updatedAt: now
        },
        {
          id: 'regulatory-compliance',
          name: '📜 Regulatory Compliance Checksheet',
          description: 'Focus on regulatory and certification requirements',
          system: 'You are a compliance auditor. Extract inspection points required by regulations, standards, and certifications. Return ONLY valid JSON array.',
          userTemplate: `Based on:\n\n{context}\n\nGenerate a REGULATORY COMPLIANCE checksheet including:\n- OSHA requirements\n- Industry standards (ISO, ANSI, etc.)\n- Certification requirements\n- Documentation requirements\n- Audit trail items\n\nReturn ONLY JSON:\n[\n  {\n    "itemName": "Lockout/Tagout Procedure",\n    "inspectionPoint": "Verify LOTO equipment availability and condition",\n    "frequency": "Monthly",\n    "expectedStatus": "All tags/locks present and functional",\n    "notes": "OSHA 1910.147 - Document serial numbers"\n  }\n]`,
          version: '1.0.0',
          tags: ['compliance', 'regulatory', 'audit'],
          isActive: false,
          createdAt: now,
          updatedAt: now
        },
        {
          id: 'visual-inspection',
          name: '👁️ Visual Inspection Checksheet',
          description: 'Focus on visual inspection points without special tools',
          system: 'You are a visual inspection specialist. Extract inspection points that can be completed through visual observation. Return ONLY valid JSON array.',
          userTemplate: `From these documents:\n\n{context}\n\nCreate a VISUAL INSPECTION checksheet with:\n- Items visible to naked eye\n- No special tools required\n- Leak detection\n- Damage/wear observation\n- Cleanliness checks\n\nReturn ONLY JSON:\n[\n  {\n    "itemName": "Hydraulic Hoses",\n    "inspectionPoint": "Visual check for cracks, abrasion, or leaks",\n    "frequency": "Weekly",\n    "expectedStatus": "No visible damage",\n    "notes": "Replace if any defects found"\n  }\n]`,
          version: '1.0.0',
          tags: ['visual', 'simple', 'no-tools'],
          isActive: false,
          createdAt: now,
          updatedAt: now
        },
        {
          id: 'seasonal-shutdown',
          name: '🗓️ Seasonal/Shutdown Checksheet',
          description: 'For annual maintenance, turnarounds, or seasonal work',
          system: 'You are a shutdown planning expert. Extract major inspection and overhaul items suitable for planned outages. Return ONLY valid JSON array.',
          userTemplate: `Using:\n\n{context}\n\nCreate a SEASONAL/SHUTDOWN checksheet for:\n- Annual overhaul items\n- Extended downtime maintenance\n- Major component inspections\n- Seasonal preparations\n- Turnaround activities\n\nReturn ONLY JSON:\n[\n  {\n    "itemName": "Gearbox Complete Inspection",\n    "inspectionPoint": "Disassemble, inspect, and replace worn components",\n    "frequency": "Annual",\n    "expectedStatus": "All components within tolerance",\n    "notes": "Schedule 2-week downtime. Order parts in advance"\n  }\n]`,
          version: '1.0.0',
          tags: ['annual', 'shutdown', 'major'],
          isActive: false,
          createdAt: now,
          updatedAt: now
        },
        {
          id: 'electrical-systems',
          name: '⚡ Electrical Systems Checksheet',
          description: 'Specialized for electrical equipment and systems',
          system: 'You are an electrical maintenance specialist. Focus on electrical components, connections, and safety. Return ONLY valid JSON array.',
          userTemplate: `From:\n\n{context}\n\nGenerate an ELECTRICAL SYSTEMS checksheet covering:\n- Electrical connections and terminals\n- Control panels and circuits\n- Grounding and bonding\n- Insulation resistance\n- Arc flash zones\n\nReturn ONLY JSON:\n[\n  {\n    "itemName": "Motor Control Center",\n    "inspectionPoint": "Check for loose connections, overheating, arcing",\n    "frequency": "Quarterly",\n    "expectedStatus": "Tight connections, no discoloration",\n    "notes": "Thermographic scan recommended. Follow NFPA 70E"\n  }\n]`,
          version: '1.0.0',
          tags: ['electrical', 'specialized', 'safety'],
          isActive: false,
          createdAt: now,
          updatedAt: now
        },
        {
          id: 'minimal-concise',
          name: '📝 Minimal & Concise Checksheet',
          description: 'Absolute minimum essential items only',
          system: 'You are an efficiency expert. Extract only the most critical 5-10 inspection points. Be extremely concise. Return ONLY valid JSON array.',
          userTemplate: `From:\n\n{context}\n\nCreate an ULTRA-MINIMAL checksheet with:\n- Top 5-10 critical items ONLY\n- One-line descriptions\n- Essential checks only\n- Maximum efficiency\n\nReturn ONLY JSON:\n[\n  {\n    "itemName": "Oil Level",\n    "inspectionPoint": "Check oil level",\n    "frequency": "Daily",\n    "expectedStatus": "Between marks",\n    "notes": "Add if low"\n  }\n]`,
          version: '1.0.0',
          tags: ['minimal', 'essential', 'efficient'],
          isActive: false,
          createdAt: now,
          updatedAt: now
        }
      ]
    },
    workInstructions: {
      useCase: 'workInstructions',
      activePromptId: 'detailed-expert',
      prompts: [
        {
          id: 'detailed-expert',
          name: '📚 Detailed Expert Instructions',
          description: 'Comprehensive step-by-step with technical details',
          system: 'You are a technical documentation expert. Create detailed, professional work instructions with all necessary technical information. Return ONLY valid JSON.',
          userTemplate: `Based on:\n\n{context}\n\nCreate DETAILED WORK INSTRUCTIONS including:\n- Comprehensive overview\n- Complete tool/material lists\n- Detailed step-by-step procedures\n- Technical specifications\n- Quality checkpoints\n- Troubleshooting tips\n\nReturn ONLY JSON:\n{\n  "overview": "Complete procedure description",\n  "prerequisites": {\n    "tools": ["Specific tools with sizes"],\n    "materials": ["Parts with part numbers"],\n    "safety": ["PPE and safety requirements"]\n  },\n  "steps": [\n    {\n      "stepNumber": 1,\n      "description": "Action description",\n      "details": "Detailed technical explanation with specs"\n    }\n  ],\n  "safetyWarnings": ["Critical safety information"],\n  "completionChecklist": ["Verification items"]\n}`,
          version: '1.0.0',
          tags: ['detailed', 'expert', 'comprehensive', 'recommended'],
          isActive: true,
          createdAt: now,
          updatedAt: now
        },
        {
          id: 'beginner-friendly',
          name: '🌟 Beginner-Friendly Instructions',
          description: 'Simple, easy-to-follow steps for new technicians',
          system: 'You are a training specialist. Write clear, simple instructions suitable for beginners. Avoid jargon, explain everything clearly. Return ONLY valid JSON.',
          userTemplate: `From:\n\n{context}\n\nCreate BEGINNER-FRIENDLY instructions:\n- Simple language, no jargon\n- Explain technical terms\n- Extra safety reminders\n- Visual cues ("look for red wire")\n- Common mistakes to avoid\n\nReturn ONLY JSON with same structure as example.`,
          version: '1.0.0',
          tags: ['beginner', 'training', 'simple'],
          isActive: false,
          createdAt: now,
          updatedAt: now
        },
        {
          id: 'quick-reference',
          name: '⚡ Quick Reference Guide',
          description: 'Condensed procedure for experienced technicians',
          system: 'You are creating a quick reference. Provide concise steps for experienced users who know the basics. Return ONLY valid JSON.',
          userTemplate: `Using:\n\n{context}\n\nCreate QUICK REFERENCE instructions:\n- Brief, bullet-point style\n- Assume technical knowledge\n- Critical steps only\n- Key specifications\n- Fast to read\n\nReturn ONLY JSON format.`,
          version: '1.0.0',
          tags: ['quick', 'experienced', 'concise'],
          isActive: false,
          createdAt: now,
          updatedAt: now
        },
        {
          id: 'safety-critical',
          name: '🛡️ Safety-Critical Procedure',
          description: 'Emphasizes safety at every step',
          system: 'You are a safety engineer. Emphasize safety procedures, hazards, and protective measures at every step. Return ONLY valid JSON.',
          userTemplate: `From:\n\n{context}\n\nCreate SAFETY-CRITICAL instructions:\n- Safety warning before each step\n- Lockout/tagout procedures\n- PPE requirements\n- Hazard identification\n- Emergency procedures\n\nReturn ONLY JSON format.`,
          version: '1.0.0',
          tags: ['safety', 'critical', 'hazards'],
          isActive: false,
          createdAt: now,
          updatedAt: now
        },
        {
          id: 'troubleshooting',
          name: '🔍 Troubleshooting Guide',
          description: 'Problem-solution format with diagnostics',
          system: 'You are a troubleshooting expert. Create diagnostic procedures with symptom-cause-solution format. Return ONLY valid JSON.',
          userTemplate: `Based on:\n\n{context}\n\nCreate TROUBLESHOOTING instructions:\n- Common problems\n- Diagnostic steps\n- Root cause analysis\n- Solutions for each issue\n- When to escalate\n\nReturn ONLY JSON format.`,
          version: '1.0.0',
          tags: ['troubleshooting', 'diagnostics', 'problems'],
          isActive: false,
          createdAt: now,
          updatedAt: now
        },
        {
          id: 'installation',
          name: '🔨 Installation Procedure',
          description: 'Focus on installation, assembly, and commissioning',
          system: 'You are an installation specialist. Create procedures for installing, assembling, and commissioning equipment. Return ONLY valid JSON.',
          userTemplate: `From:\n\n{context}\n\nCreate INSTALLATION instructions:\n- Pre-installation checks\n- Assembly sequence\n- Alignment procedures\n- Connection details\n- Commissioning steps\n- Testing and validation\n\nReturn ONLY JSON format.`,
          version: '1.0.0',
          tags: ['installation', 'assembly', 'commissioning'],
          isActive: false,
          createdAt: now,
          updatedAt: now
        },
        {
          id: 'calibration',
          name: '⚙️ Calibration Procedure',
          description: 'Detailed calibration and adjustment steps',
          system: 'You are a calibration technician. Create precise calibration procedures with tolerances and acceptance criteria. Return ONLY valid JSON.',
          userTemplate: `Using:\n\n{context}\n\nCreate CALIBRATION instructions:\n- Calibration standards\n- Required test equipment\n- Adjustment procedures\n- Tolerance specifications\n- Documentation requirements\n\nReturn ONLY JSON format.`,
          version: '1.0.0',
          tags: ['calibration', 'precision', 'adjustment'],
          isActive: false,
          createdAt: now,
          updatedAt: now
        },
        {
          id: 'preventive-service',
          name: '🔧 Preventive Service Procedure',
          description: 'Routine maintenance and service tasks',
          system: 'You are a preventive maintenance planner. Create procedures for routine service tasks and scheduled maintenance. Return ONLY valid JSON.',
          userTemplate: `From:\n\n{context}\n\nCreate PREVENTIVE SERVICE instructions:\n- Lubrication procedures\n- Filter changes\n- Cleaning procedures\n- Adjustment checks\n- Parts replacement intervals\n\nReturn ONLY JSON format.`,
          version: '1.0.0',
          tags: ['preventive', 'service', 'routine'],
          isActive: false,
          createdAt: now,
          updatedAt: now
        },
        {
          id: 'emergency-repair',
          name: '🚨 Emergency Repair Procedure',
          description: 'Quick repair for emergency situations',
          system: 'You are an emergency response specialist. Create fast, efficient repair procedures for urgent situations. Return ONLY valid JSON.',
          userTemplate: `Based on:\n\n{context}\n\nCreate EMERGENCY REPAIR instructions:\n- Quick diagnosis\n- Temporary fixes\n- Priority actions\n- Safety in haste\n- Permanent repair planning\n\nReturn ONLY JSON format.`,
          version: '1.0.0',
          tags: ['emergency', 'urgent', 'quick'],
          isActive: false,
          createdAt: now,
          updatedAt: now
        },
        {
          id: 'inspection-testing',
          name: '🧪 Inspection & Testing Procedure',
          description: 'Quality control and testing procedures',
          system: 'You are a quality control inspector. Create inspection and testing procedures with acceptance criteria. Return ONLY valid JSON.',
          userTemplate: `From:\n\n{context}\n\nCreate INSPECTION & TESTING instructions:\n- Test equipment setup\n- Measurement procedures\n- Acceptance criteria\n- Pass/fail determination\n- Documentation requirements\n\nReturn ONLY JSON format.`,
          version: '1.0.0',
          tags: ['inspection', 'testing', 'quality'],
          isActive: false,
          createdAt: now,
          updatedAt: now
        }
      ]
    }
  };
};

/**
 * Load prompt library from S3 or return defaults
 */
export const loadPromptLibrary = async () => {
  try {
    const command = new GetObjectCommand({
      Bucket: PROMPTS_BUCKET,
      Key: PROMPTS_KEY
    });

    const response = await s3Client.send(command);
    const body = await response.Body.transformToString();
    const library = JSON.parse(body);

    logger.info('Loaded prompt library from S3');
    return library;
  } catch (error) {
    if (error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404) {
      logger.info('No prompt library found, using defaults');
      return getDefaultLibrary();
    }
    logger.error('Error loading prompt library from S3, using defaults', error);
    return getDefaultLibrary();
  }
};

/**
 * Save prompt library to S3
 */
export const savePromptLibrary = async (library) => {
  try {
    const command = new PutObjectCommand({
      Bucket: PROMPTS_BUCKET,
      Key: PROMPTS_KEY,
      Body: JSON.stringify(library, null, 2),
      ContentType: 'application/json'
    });

    await s3Client.send(command);
    logger.info('Saved prompt library to S3');
    return true;
  } catch (error) {
    logger.error('Error saving prompt library to S3', error);
    throw new Error('Failed to save prompt library');
  }
};

/**
 * Get prompt library for a specific use case
 */
export const getPromptLibraryForUseCase = async (useCase) => {
  const library = await loadPromptLibrary();
  return library[useCase] || null;
};

/**
 * Get all prompt libraries
 */
export const getAllPromptLibraries = async () => {
  return await loadPromptLibrary();
};

/**
 * Get a specific prompt by use case and promptId
 * If promptId is not provided, returns the active prompt
 */
export const getPrompt = async (useCase, promptId = null) => {
  const library = await loadPromptLibrary();
  const useCaseLibrary = library[useCase];
  
  if (!useCaseLibrary) {
    return null;
  }

  // If no promptId specified, use active prompt
  const targetPromptId = promptId || useCaseLibrary.activePromptId || 'default';
  
  const prompt = useCaseLibrary.prompts.find(p => p.id === targetPromptId);
  
  if (!prompt) {
    // Fallback to first prompt if active/default not found
    logger.warn(`Prompt ${targetPromptId} not found for use case ${useCase}, using first prompt`);
    return useCaseLibrary.prompts[0] || null;
  }

  return prompt;
};

/**
 * Get all prompts for a use case
 */
export const getPromptsForUseCase = async (useCase) => {
  const library = await loadPromptLibrary();
  const useCaseLibrary = library[useCase];
  
  if (!useCaseLibrary) {
    return [];
  }

  return useCaseLibrary.prompts;
};

/**
 * Add a new prompt to a use case library
 */
export const addPrompt = async (useCase, promptData) => {
  const library = await loadPromptLibrary();
  
  if (!library[useCase]) {
    // Create new use case library
    library[useCase] = {
      useCase,
      activePromptId: 'default',
      prompts: []
    };
  }

  const useCaseLibrary = library[useCase];
  
  // Generate unique ID if not provided
  const promptId = promptData.id || `prompt-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  // Check if prompt ID already exists
  if (useCaseLibrary.prompts.find(p => p.id === promptId)) {
    throw new Error(`Prompt with ID '${promptId}' already exists for use case '${useCase}'`);
  }

  const newPrompt = {
    id: promptId,
    name: promptData.name,
    description: promptData.description || '',
    system: promptData.system,
    userTemplate: promptData.userTemplate,
    version: promptData.version || '1.0.0',
    tags: promptData.tags || [],
    isActive: promptData.isActive || false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  // If this is set as active, update active flag
  if (newPrompt.isActive) {
    // Set all other prompts as inactive
    useCaseLibrary.prompts.forEach(p => p.isActive = false);
    useCaseLibrary.activePromptId = promptId;
  }

  useCaseLibrary.prompts.push(newPrompt);
  
  await savePromptLibrary(library);
  logger.info(`Added new prompt ${promptId} to use case ${useCase}`);
  
  return newPrompt;
};

/**
 * Update an existing prompt
 */
export const updatePrompt = async (useCase, promptId, promptData) => {
  const library = await loadPromptLibrary();
  const useCaseLibrary = library[useCase];
  
  if (!useCaseLibrary) {
    throw new Error(`Use case '${useCase}' not found`);
  }

  const promptIndex = useCaseLibrary.prompts.findIndex(p => p.id === promptId);
  
  if (promptIndex === -1) {
    throw new Error(`Prompt '${promptId}' not found for use case '${useCase}'`);
  }

  const existingPrompt = useCaseLibrary.prompts[promptIndex];
  
  // Update prompt data
  const updatedPrompt = {
    ...existingPrompt,
    ...promptData,
    id: promptId, // Ensure ID doesn't change
    updatedAt: new Date().toISOString()
  };

  // If setting as active, update active flags
  if (promptData.isActive !== undefined && promptData.isActive) {
    useCaseLibrary.prompts.forEach(p => p.isActive = false);
    updatedPrompt.isActive = true;
    useCaseLibrary.activePromptId = promptId;
  }

  useCaseLibrary.prompts[promptIndex] = updatedPrompt;
  
  await savePromptLibrary(library);
  logger.info(`Updated prompt ${promptId} for use case ${useCase}`);
  
  return updatedPrompt;
};

/**
 * Set a prompt as active for a use case
 */
export const setActivePrompt = async (useCase, promptId) => {
  const library = await loadPromptLibrary();
  const useCaseLibrary = library[useCase];
  
  if (!useCaseLibrary) {
    throw new Error(`Use case '${useCase}' not found`);
  }

  const prompt = useCaseLibrary.prompts.find(p => p.id === promptId);
  
  if (!prompt) {
    throw new Error(`Prompt '${promptId}' not found for use case '${useCase}'`);
  }

  // Set all prompts as inactive
  useCaseLibrary.prompts.forEach(p => p.isActive = false);
  
  // Set selected prompt as active
  prompt.isActive = true;
  useCaseLibrary.activePromptId = promptId;
  
  await savePromptLibrary(library);
  logger.info(`Set prompt ${promptId} as active for use case ${useCase}`);
  
  return prompt;
};

/**
 * Delete a prompt from a use case library
 */
export const deletePrompt = async (useCase, promptId) => {
  const library = await loadPromptLibrary();
  const useCaseLibrary = library[useCase];
  
  if (!useCaseLibrary) {
    throw new Error(`Use case '${useCase}' not found`);
  }

  const promptIndex = useCaseLibrary.prompts.findIndex(p => p.id === promptId);
  
  if (promptIndex === -1) {
    throw new Error(`Prompt '${promptId}' not found for use case '${useCase}'`);
  }

  // Don't allow deleting if it's the only prompt
  if (useCaseLibrary.prompts.length === 1) {
    throw new Error(`Cannot delete the last prompt for use case '${useCase}'. At least one prompt is required.`);
  }

  const wasActive = useCaseLibrary.prompts[promptIndex].isActive;
  
  // Remove prompt
  useCaseLibrary.prompts.splice(promptIndex, 1);
  
  // If deleted prompt was active, set first prompt as active
  if (wasActive && useCaseLibrary.prompts.length > 0) {
    useCaseLibrary.prompts[0].isActive = true;
    useCaseLibrary.activePromptId = useCaseLibrary.prompts[0].id;
  }
  
  await savePromptLibrary(library);
  logger.info(`Deleted prompt ${promptId} from use case ${useCase}`);
  
  return true;
};

/**
 * Reset prompt library to defaults
 */
export const resetPromptLibrary = async () => {
  const defaultLibrary = getDefaultLibrary();
  await savePromptLibrary(defaultLibrary);
  logger.info('Reset prompt library to defaults');
  return defaultLibrary;
};

