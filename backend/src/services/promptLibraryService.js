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
          system: 'You are an expert maintenance documentation specialist. Extract inspection points with detail including acceptance criteria, tolerances, and notes. Keep responses EXTREMELY BRIEF. Item names: 3 words max. Inspection points: 1 sentence, 10 words max. Notes: 5 words max. Return ONLY valid JSON array. STRICT: Use ONLY information from the provided context. DO NOT add external knowledge.',
          userTemplate: `Based EXCLUSIVELY on the following maintenance manual excerpts from the PDF:\n\n{context}\n\nCRITICAL INSTRUCTIONS:\n1. Extract ONLY inspection points EXPLICITLY mentioned in the provided context\n2. DO NOT add information from training data, general knowledge, or internet\n3. Use exact wording from the PDF when possible\n4. Every item must be traceable to the provided context\n\nCreate a comprehensive inspection checksheet with these columns:\n- Item Name (3 words max, specific equipment/component from PDF)\n- Inspection Point (1 sentence, 10 words max, use exact wording from PDF)\n- Frequency (Daily/Weekly/Monthly/Quarterly/Annual as mentioned in PDF)\n- Expected Status (brief, specific acceptance criteria from PDF)\n- Notes (5 words max, essential instructions from PDF only)\n\nCRITICAL: Keep response EXTREMELY BRIEF. Return ONLY a JSON array. Only use information from the provided context. Example:\n[\n  {\n    "itemName": "Hydraulic Pump Motor",\n    "inspectionPoint": "Check motor bearing temperature",\n    "frequency": "Weekly",\n    "expectedStatus": "≤ 70°C",\n    "notes": "Measure housing. Shutdown if > 80°C"\n  }\n]`,
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
          system: 'You are a maintenance checklist expert. Create EXTREMELY BRIEF inspection points for quick daily checks. Item names: 3 words max. Inspection points: 1 sentence, 10 words max. Notes: 5 words max. Return ONLY valid JSON array.',
          userTemplate: `Based on these documents:\n\n{context}\n\nCreate a simple, quick inspection checksheet focusing on:\n- Most critical items only\n- Simple yes/no or pass/fail checks\n- Daily and weekly frequencies primarily\n- Brief, clear descriptions (10 words max per point)\n\nCRITICAL: Keep EXTREMELY BRIEF. Return ONLY JSON array format:\n[\n  {\n    "itemName": "Safety Guards",\n    "inspectionPoint": "Verify all guards in place",\n    "frequency": "Daily",\n    "expectedStatus": "All present",\n    "notes": "Visual check"\n  }\n]`,
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
          system: 'You are a safety compliance expert. Prioritize safety-critical inspection points. Keep EXTREMELY BRIEF. Item names: 3 words max. Inspection points: 1 sentence, 10 words max. Notes: 5 words max. Return ONLY valid JSON array.',
          userTemplate: `From these documents:\n\n{context}\n\nGenerate a SAFETY-FOCUSED checksheet prioritizing:\n- Safety-critical components\n- Hazard prevention checks\n- Compliance items\n- Emergency systems\n- Personal protective equipment\n\nCRITICAL: Keep EXTREMELY BRIEF. Return ONLY JSON:\n[\n  {\n    "itemName": "Emergency Stop Button",\n    "inspectionPoint": "Test emergency stop functionality",\n    "frequency": "Weekly",\n    "expectedStatus": "Stops immediately",\n    "notes": "CRITICAL SAFETY"\n  }\n]`,
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
          system: 'You are a preventive maintenance specialist. Extract scheduled maintenance tasks. Keep EXTREMELY BRIEF. Item names: 3 words max. Inspection points: 1 sentence, 10 words max. Notes: 5 words max. Return ONLY valid JSON array.',
          userTemplate: `Using these documents:\n\n{context}\n\nCreate a PREVENTIVE MAINTENANCE checksheet with:\n- Lubrication points and schedules\n- Filter replacements\n- Belt/chain tension checks\n- Wear item inspections\n- Calibration requirements\n\nCRITICAL: Keep EXTREMELY BRIEF. Return ONLY JSON:\n[\n  {\n    "itemName": "Drive Belt Tension",\n    "inspectionPoint": "Check and adjust belt tension",\n    "frequency": "Monthly",\n    "expectedStatus": "½ inch deflection",\n    "notes": "Use tension gauge"\n  }\n]`,
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
          system: 'You are a condition monitoring expert. Extract measurement points. Keep EXTREMELY BRIEF. Item names: 3 words max. Inspection points: 1 sentence, 10 words max. Notes: 5 words max. Return ONLY valid JSON array.',
          userTemplate: `From these manuals:\n\n{context}\n\nCreate a CONDITION MONITORING checksheet with:\n- Measurement points (pressure, temperature, vibration, current)\n- Acceptable ranges and tolerances\n- Trending requirements\n- Diagnostic indicators\n\nCRITICAL: Keep EXTREMELY BRIEF. Return ONLY JSON:\n[\n  {\n    "itemName": "Hydraulic Pressure",\n    "inspectionPoint": "Record system pressure at gauge",\n    "frequency": "Daily",\n    "expectedStatus": "1500-1800 PSI",\n    "notes": "Trend data. Alert if out"\n  }\n]`,
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
          system: 'You are a compliance auditor. Extract inspection points. Keep EXTREMELY BRIEF. Item names: 3 words max. Inspection points: 1 sentence, 10 words max. Notes: 5 words max. Return ONLY valid JSON array.',
          userTemplate: `Based on:\n\n{context}\n\nGenerate a REGULATORY COMPLIANCE checksheet including:\n- OSHA requirements\n- Industry standards (ISO, ANSI, etc.)\n- Certification requirements\n- Documentation requirements\n- Audit trail items\n\nCRITICAL: Keep EXTREMELY BRIEF. Return ONLY JSON:\n[\n  {\n    "itemName": "Lockout/Tagout Procedure",\n    "inspectionPoint": "Verify LOTO equipment availability",\n    "frequency": "Monthly",\n    "expectedStatus": "All tags present",\n    "notes": "OSHA 1910.147"\n  }\n]`,
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
          system: 'You are a visual inspection specialist. Extract inspection points. Keep EXTREMELY BRIEF. Item names: 3 words max. Inspection points: 1 sentence, 10 words max. Notes: 5 words max. Return ONLY valid JSON array.',
          userTemplate: `From these documents:\n\n{context}\n\nCreate a VISUAL INSPECTION checksheet with:\n- Items visible to naked eye\n- No special tools required\n- Leak detection\n- Damage/wear observation\n- Cleanliness checks\n\nCRITICAL: Keep EXTREMELY BRIEF. Return ONLY JSON:\n[\n  {\n    "itemName": "Hydraulic Hoses",\n    "inspectionPoint": "Visual check for cracks abrasion leaks",\n    "frequency": "Weekly",\n    "expectedStatus": "No visible damage",\n    "notes": "Replace if defects"\n  }\n]`,
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
          system: 'You are a shutdown planning expert. Extract major inspection items. Keep EXTREMELY BRIEF. Item names: 3 words max. Inspection points: 1 sentence, 10 words max. Notes: 5 words max. Return ONLY valid JSON array.',
          userTemplate: `Using:\n\n{context}\n\nCreate a SEASONAL/SHUTDOWN checksheet for:\n- Annual overhaul items\n- Extended downtime maintenance\n- Major component inspections\n- Seasonal preparations\n- Turnaround activities\n\nCRITICAL: Keep EXTREMELY BRIEF. Return ONLY JSON:\n[\n  {\n    "itemName": "Gearbox Complete Inspection",\n    "inspectionPoint": "Disassemble inspect replace worn components",\n    "frequency": "Annual",\n    "expectedStatus": "All components within tolerance",\n    "notes": "Schedule downtime order parts"\n  }\n]`,
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
          system: 'You are an electrical maintenance specialist. Focus on electrical components. Keep EXTREMELY BRIEF. Item names: 3 words max. Inspection points: 1 sentence, 10 words max. Notes: 5 words max. Return ONLY valid JSON array.',
          userTemplate: `From:\n\n{context}\n\nGenerate an ELECTRICAL SYSTEMS checksheet covering:\n- Electrical connections and terminals\n- Control panels and circuits\n- Grounding and bonding\n- Insulation resistance\n- Arc flash zones\n\nCRITICAL: Keep EXTREMELY BRIEF. Return ONLY JSON:\n[\n  {\n    "itemName": "Motor Control Center",\n    "inspectionPoint": "Check for loose connections overheating arcing",\n    "frequency": "Quarterly",\n    "expectedStatus": "Tight connections no discoloration",\n    "notes": "Thermographic scan NFPA 70E"\n  }\n]`,
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
          system: 'You are an efficiency expert. Extract only the most critical 5-10 inspection points. Be EXTREMELY concise. Item names: 3 words max. Inspection points: 1 sentence, 10 words max. Notes: 5 words max. Return ONLY valid JSON array.',
          userTemplate: `From:\n\n{context}\n\nCreate an ULTRA-MINIMAL checksheet with:\n- Top 5-10 critical items ONLY\n- One-line descriptions (10 words max)\n- Essential checks only\n- Maximum efficiency\n\nCRITICAL: Keep EXTREMELY BRIEF. Return ONLY JSON:\n[\n  {\n    "itemName": "Oil Level",\n    "inspectionPoint": "Check oil level",\n    "frequency": "Daily",\n    "expectedStatus": "Between marks",\n    "notes": "Add if low"\n  }\n]`,
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
          name: '📚 Detailed Maintenance Instructions',
          description: 'Extract comprehensive maintenance procedures from manuals',
          system: 'You are an expert in extracting maintenance procedures from technical manuals. Extract procedural steps, inspection points, and maintenance tasks. Keep responses EXTREMELY BRIEF. Title: 5 words max. Overview: 1 sentence, 15 words max. Prerequisites: 2-3 items per category, each 2-3 words. Steps: max 2 per request, title 3 words, description 1 sentence 10 words max. Safety: max 2 items, 5 words each. Completion: max 2 items, 3 words each. Return ONLY valid JSON. STRICT: Use ONLY information from the provided context. DO NOT add external knowledge.',
          userTemplate: `Extract maintenance work instructions EXCLUSIVELY from this PDF manual:\n\n{context}\n\nCRITICAL INSTRUCTIONS - READ CAREFULLY:\n1. Extract ONLY procedures, steps, and instructions EXPLICITLY mentioned in the provided context\n2. DO NOT add any information from your training data, general knowledge, or the internet\n3. DO NOT create generic procedures - only extract what is actually written in the PDF\n4. Use the exact wording from the PDF when possible\n5. If a detail is not in the provided context, do not invent it - use "See manual" or omit it\n6. Every step you create must be directly traceable to the provided context\n\nYour task: Find and extract ALL maintenance procedures from the provided context including:\n- Inspection procedures (daily, weekly, monthly, annual checks) - only if mentioned in context\n- Maintenance tasks (lubrication, adjustment, cleaning, replacement) - only if mentioned in context\n- Service procedures (overhaul, calibration, testing, repairs) - only if mentioned in context\n- Safety procedures (lockout/tagout, hazard warnings) - only if mentioned in context\n- Troubleshooting steps - only if mentioned in context\n\nExtraction Guidelines:\n1. Look for numbered steps, bullet points, or sequential procedures in the provided context\n2. Extract specific measurements, torque specs, tolerances, and technical values from the context\n3. Include tool requirements and part numbers mentioned in the context\n4. Capture frequency/schedule information (daily, weekly, monthly, annual) from the context\n5. Extract safety warnings and PPE requirements from the context\n6. Include acceptance criteria and quality checks from the context\n7. If multiple procedures exist, choose the most detailed one from the context\n\nReturn ONLY valid JSON (no markdown, no explanations):\n{\n  "title": "Name of the procedure extracted from PDF (e.g., 'Monthly Hydraulic System Maintenance')",\n  "overview": "What this procedure does and when to perform it (from PDF)",\n  "frequency": "Daily/Weekly/Monthly/Quarterly/Annual/As-Needed (from PDF)",\n  "estimatedDuration": "Estimated time from PDF (e.g., '45 minutes') or 'See manual' if not specified",\n  "prerequisites": {\n    "tools": ["Tool name with specification from PDF (e.g., 'Torque wrench 50-250 Nm')"],\n    "materials": ["Materials or parts needed from PDF (e.g., 'SAE 10W-30 oil, 2 quarts')"],\n    "safety": ["Required PPE and safety equipment from PDF"]\n  },\n  "steps": [\n    {\n      "stepNumber": 1,\n      "description": "Clear action statement from PDF",\n      "details": "Complete details with measurements, specifications, inspection criteria from PDF",\n      "warning": "Safety warning for this step from PDF (if applicable)"\n    }\n  ],\n  "safetyWarnings": ["Overall safety warnings and hazards from PDF"],\n  "completionChecklist": ["How to verify work was completed correctly from PDF"],\n  "notes": "Additional references or related information from PDF"\n}\n\nIMPORTANT: Extract ONLY actual content from the provided context. Do not create generic procedures. Do not add information not present in the context. If no clear procedure is found in the context, extract inspection points or maintenance tasks as steps from what IS in the context.`,
          version: '2.0.0',
          tags: ['detailed', 'expert', 'maintenance', 'recommended'],
          isActive: true,
          createdAt: now,
          updatedAt: now
        },
        {
          id: 'beginner-friendly',
          name: '🌟 Beginner-Friendly Instructions',
          description: 'Simple, easy-to-follow steps for new technicians',
          system: 'You are a training specialist. Write clear, simple instructions. Keep EXTREMELY BRIEF. Title: 5 words max. Overview: 1 sentence, 15 words max. Prerequisites: 2-3 items per category, each 2-3 words. Steps: max 2 per request, title 3 words, description 1 sentence 10 words max. Safety: max 2 items, 5 words each. Completion: max 2 items, 3 words each. Return ONLY valid JSON.',
          userTemplate: `From:\n\n{context}\n\nCreate BEGINNER-FRIENDLY instructions:\n- Simple language, no jargon\n- Explain technical terms\n- Extra safety reminders\n- Visual cues ("look for red wire")\n- Common mistakes to avoid\n\nCRITICAL: Keep EXTREMELY BRIEF. Return ONLY JSON with same structure as example.`,
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
          system: 'You are creating a quick reference. Provide concise steps. Keep EXTREMELY BRIEF. Title: 5 words max. Overview: 1 sentence, 15 words max. Prerequisites: 2-3 items per category, each 2-3 words. Steps: max 2 per request, title 3 words, description 1 sentence 10 words max. Safety: max 2 items, 5 words each. Completion: max 2 items, 3 words each. Return ONLY valid JSON.',
          userTemplate: `Using:\n\n{context}\n\nCreate QUICK REFERENCE instructions:\n- Brief, bullet-point style\n- Assume technical knowledge\n- Critical steps only\n- Key specifications\n- Fast to read\n\nCRITICAL: Keep EXTREMELY BRIEF. Return ONLY JSON format.`,
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
          system: 'You are a safety engineer. Emphasize safety procedures. Keep EXTREMELY BRIEF. Title: 5 words max. Overview: 1 sentence, 15 words max. Prerequisites: 2-3 items per category, each 2-3 words. Steps: max 2 per request, title 3 words, description 1 sentence 10 words max. Safety: max 2 items, 5 words each. Completion: max 2 items, 3 words each. Return ONLY valid JSON.',
          userTemplate: `From:\n\n{context}\n\nCreate SAFETY-CRITICAL instructions:\n- Safety warning before each step\n- Lockout/tagout procedures\n- PPE requirements\n- Hazard identification\n- Emergency procedures\n\nCRITICAL: Keep EXTREMELY BRIEF. Return ONLY JSON format.`,
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
          system: 'You are a troubleshooting expert. Create diagnostic procedures. Keep EXTREMELY BRIEF. Title: 5 words max. Overview: 1 sentence, 15 words max. Prerequisites: 2-3 items per category, each 2-3 words. Steps: max 2 per request, title 3 words, description 1 sentence 10 words max. Safety: max 2 items, 5 words each. Completion: max 2 items, 3 words each. Return ONLY valid JSON.',
          userTemplate: `Based on:\n\n{context}\n\nCreate TROUBLESHOOTING instructions:\n- Common problems\n- Diagnostic steps\n- Root cause analysis\n- Solutions for each issue\n- When to escalate\n\nCRITICAL: Keep EXTREMELY BRIEF. Return ONLY JSON format.`,
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
          system: 'You are an installation specialist. Create procedures. Keep EXTREMELY BRIEF. Title: 5 words max. Overview: 1 sentence, 15 words max. Prerequisites: 2-3 items per category, each 2-3 words. Steps: max 2 per request, title 3 words, description 1 sentence 10 words max. Safety: max 2 items, 5 words each. Completion: max 2 items, 3 words each. Return ONLY valid JSON.',
          userTemplate: `From:\n\n{context}\n\nCreate INSTALLATION instructions:\n- Pre-installation checks\n- Assembly sequence\n- Alignment procedures\n- Connection details\n- Commissioning steps\n- Testing and validation\n\nCRITICAL: Keep EXTREMELY BRIEF. Return ONLY JSON format.`,
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
          system: 'You are a calibration technician. Create precise calibration procedures. Keep EXTREMELY BRIEF. Title: 5 words max. Overview: 1 sentence, 15 words max. Prerequisites: 2-3 items per category, each 2-3 words. Steps: max 2 per request, title 3 words, description 1 sentence 10 words max. Safety: max 2 items, 5 words each. Completion: max 2 items, 3 words each. Return ONLY valid JSON.',
          userTemplate: `Using:\n\n{context}\n\nCreate CALIBRATION instructions:\n- Calibration standards\n- Required test equipment\n- Adjustment procedures\n- Tolerance specifications\n- Documentation requirements\n\nCRITICAL: Keep EXTREMELY BRIEF. Return ONLY JSON format.`,
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
          system: 'You are a preventive maintenance planner. Create procedures. Keep EXTREMELY BRIEF. Title: 5 words max. Overview: 1 sentence, 15 words max. Prerequisites: 2-3 items per category, each 2-3 words. Steps: max 2 per request, title 3 words, description 1 sentence 10 words max. Safety: max 2 items, 5 words each. Completion: max 2 items, 3 words each. Return ONLY valid JSON.',
          userTemplate: `From:\n\n{context}\n\nCreate PREVENTIVE SERVICE instructions:\n- Lubrication procedures\n- Filter changes\n- Cleaning procedures\n- Adjustment checks\n- Parts replacement intervals\n\nCRITICAL: Keep EXTREMELY BRIEF. Return ONLY JSON format.`,
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
          system: 'You are an emergency response specialist. Create fast repair procedures. Keep EXTREMELY BRIEF. Title: 5 words max. Overview: 1 sentence, 15 words max. Prerequisites: 2-3 items per category, each 2-3 words. Steps: max 2 per request, title 3 words, description 1 sentence 10 words max. Safety: max 2 items, 5 words each. Completion: max 2 items, 3 words each. Return ONLY valid JSON.',
          userTemplate: `Based on:\n\n{context}\n\nCreate EMERGENCY REPAIR instructions:\n- Quick diagnosis\n- Temporary fixes\n- Priority actions\n- Safety in haste\n- Permanent repair planning\n\nCRITICAL: Keep EXTREMELY BRIEF. Return ONLY JSON format.`,
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
          system: 'You are a quality control inspector. Create inspection procedures. Keep EXTREMELY BRIEF. Title: 5 words max. Overview: 1 sentence, 15 words max. Prerequisites: 2-3 items per category, each 2-3 words. Steps: max 2 per request, title 3 words, description 1 sentence 10 words max. Safety: max 2 items, 5 words each. Completion: max 2 items, 3 words each. Return ONLY valid JSON.',
          userTemplate: `From:\n\n{context}\n\nCreate INSPECTION & TESTING instructions:\n- Test equipment setup\n- Measurement procedures\n- Acceptance criteria\n- Pass/fail determination\n- Documentation requirements\n\nCRITICAL: Keep EXTREMELY BRIEF. Return ONLY JSON format.`,
          version: '1.0.0',
          tags: ['inspection', 'testing', 'quality'],
          isActive: false,
          createdAt: now,
          updatedAt: now
        },
        {
          id: 'weekly-maintenance',
          name: '📅 Weekly Maintenance Procedures',
          description: 'Extract only weekly maintenance tasks',
          system: 'You are a maintenance scheduler extracting WEEKLY procedures only. Keep EXTREMELY BRIEF. Title: 5 words max. Overview: 1 sentence, 15 words max. Prerequisites: 2-3 items per category, each 2-3 words. Steps: max 2 per request, title 3 words, description 1 sentence 10 words max. Safety: max 2 items, 5 words each. Completion: max 2 items, 3 words each. Return ONLY valid JSON.',
          userTemplate: `From this maintenance manual:\n\n{context}\n\nExtract ONLY WEEKLY MAINTENANCE procedures:\n- Look for tasks labeled "Weekly", "1 Week", "7 days", "Every week"\n- Include weekly inspection rounds\n- Weekly lubrication tasks\n- Weekly system checks\n- Weekly cleaning procedures\n\nCRITICAL: Keep EXTREMELY BRIEF. Return ONLY valid JSON with this structure:\n{\n  "title": "Weekly Maintenance",\n  "overview": "Weekly maintenance tasks",\n  "frequency": "Weekly",\n  "prerequisites": {\n    "tools": ["Tool1", "Tool2"],\n    "materials": ["Mat1", "Mat2"],\n    "safety": ["Safety1", "Safety2"]\n  },\n  "steps": [\n    {\n      "stepNumber": 1,\n      "title": "Task Title",\n      "description": "One sentence description"\n    }\n  ],\n  "safetyWarnings": ["Warning1", "Warning2"],\n  "completionChecklist": ["Item1", "Item2"]\n}\n\nFocus ONLY on weekly tasks. Ignore daily, monthly, and annual tasks.`,
          version: '1.0.0',
          tags: ['weekly', 'schedule', 'frequency'],
          isActive: false,
          createdAt: now,
          updatedAt: now
        },
        {
          id: 'monthly-maintenance',
          name: '📅 Monthly Maintenance Procedures',
          description: 'Extract only monthly maintenance tasks',
          system: 'You are a maintenance scheduler extracting MONTHLY procedures only. Keep EXTREMELY BRIEF. Title: 5 words max. Overview: 1 sentence, 15 words max. Prerequisites: 2-3 items per category, each 2-3 words. Steps: max 2 per request, title 3 words, description 1 sentence 10 words max. Safety: max 2 items, 5 words each. Completion: max 2 items, 3 words each. Return ONLY valid JSON.',
          userTemplate: `From this maintenance manual:\n\n{context}\n\nExtract ONLY MONTHLY MAINTENANCE procedures:\n- Look for tasks labeled "Monthly", "1 Month", "30 days", "Every month"\n- Include monthly inspection procedures\n- Monthly lubrication and filter changes\n- Monthly calibration checks\n- Monthly performance tests\n\nCRITICAL: Keep EXTREMELY BRIEF. Return ONLY valid JSON with this structure:\n{\n  "title": "Monthly Maintenance",\n  "overview": "Monthly maintenance tasks",\n  "frequency": "Monthly",\n  "prerequisites": {\n    "tools": ["Tool1", "Tool2"],\n    "materials": ["Mat1", "Mat2"],\n    "safety": ["Safety1", "Safety2"]\n  },\n  "steps": [\n    {\n      "stepNumber": 1,\n      "title": "Task Title",\n      "description": "One sentence description"\n    }\n  ],\n  "safetyWarnings": ["Warning1", "Warning2"],\n  "completionChecklist": ["Item1", "Item2"]\n}\n\nFocus ONLY on monthly tasks. Ignore daily, weekly, and annual tasks.`,
          version: '1.0.0',
          tags: ['monthly', 'schedule', 'frequency'],
          isActive: false,
          createdAt: now,
          updatedAt: now
        },
        {
          id: 'annual-maintenance',
          name: '📅 Annual Maintenance Procedures',
          description: 'Extract only annual/yearly maintenance tasks',
          system: 'You are a maintenance scheduler extracting ANNUAL procedures only. Keep EXTREMELY BRIEF. Title: 5 words max. Overview: 1 sentence, 15 words max. Prerequisites: 2-3 items per category, each 2-3 words. Steps: max 2 per request, title 3 words, description 1 sentence 10 words max. Safety: max 2 items, 5 words each. Completion: max 2 items, 3 words each. Return ONLY valid JSON.',
          userTemplate: `From this maintenance manual:\n\n{context}\n\nExtract ONLY ANNUAL MAINTENANCE procedures:\n- Look for tasks labeled "Annual", "Yearly", "12 months", "Once per year"\n- Include annual overhaul procedures\n- Annual certifications and compliance checks\n- Major component replacements\n- Annual shutdown maintenance\n\nCRITICAL: Keep EXTREMELY BRIEF. Return ONLY valid JSON with this structure:\n{\n  "title": "Annual Maintenance",\n  "overview": "Annual maintenance tasks",\n  "frequency": "Annual",\n  "prerequisites": {\n    "tools": ["Tool1", "Tool2"],\n    "materials": ["Mat1", "Mat2"],\n    "safety": ["Safety1", "Safety2"]\n  },\n  "steps": [\n    {\n      "stepNumber": 1,\n      "title": "Task Title",\n      "description": "One sentence description"\n    }\n  ],\n  "safetyWarnings": ["Warning1", "Warning2"],\n  "completionChecklist": ["Item1", "Item2"]\n}\n\nFocus ONLY on annual/yearly tasks. Ignore daily, weekly, and monthly tasks.`,
          version: '1.0.0',
          tags: ['annual', 'yearly', 'schedule', 'frequency'],
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

