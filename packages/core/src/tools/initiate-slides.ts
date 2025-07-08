/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { SchemaValidator } from '../utils/schemaValidator.js';
import { BaseTool, ToolResult } from './tools.js';

/**
 * Metadata for the entire video project
 */
export interface ProjectMetadata {
  title: string;
  description?: string;
  total_slides: number;
  estimated_duration?: number;
  created_at: string;
  aspect_ratio?: string;
}

/**
 * Data for a single slide in the planning phase
 */
export interface SlideData {
  scene_id: string;
  title: string;
  script_text: string;
  layout_type: string;
  visual_description: string;
  estimated_duration?: number;
}

/**
 * Complete plan JSON structure
 */
export interface PlanJson {
  project_metadata: ProjectMetadata;
  slides: SlideData[];
}

/**
 * Parameters for the InitiateSlidesTool
 */
export interface InitiateSlidesParams {
  plan_json: PlanJson;
  output_directory: string;
  overwrite_existing?: boolean;
}

/**
 * Tool that creates slide directories and info.json files from a comprehensive plan.
 * Takes a complete plan.json and creates all slide directories with their info.json files in one operation.
 */
export class InitiateSlidesTool extends BaseTool<InitiateSlidesParams, ToolResult> {
  static readonly Name: string = 'initiate_slides';

  constructor() {
    super(
      InitiateSlidesTool.Name,
      'Slide Structure Initiator',
      'Creates slide directories and info.json files from a comprehensive plan. Takes a complete plan.json with all slide information and creates the entire slide directory structure in one operation.',
      {
        type: 'object',
        properties: {
          plan_json: {
            type: 'object',
            properties: {
              project_metadata: {
                type: 'object',
                properties: {
                  title: { type: 'string', description: 'Title of the video project' },
                  description: { type: 'string', description: 'Optional description of the project' },
                  total_slides: { type: 'number', description: 'Total number of slides in the project' },
                  estimated_duration: { type: 'number', description: 'Estimated duration in seconds' },
                  created_at: { type: 'string', description: 'ISO timestamp of creation' },
                  aspect_ratio: { type: 'string', description: 'Aspect ratio (e.g., 16:9, 9:16)' }
                },
                required: ['title', 'total_slides', 'created_at'],
                description: 'Metadata for the entire video project'
              },
              slides: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    scene_id: { type: 'string', description: 'Unique identifier for the slide (e.g., slide-001)' },
                    title: { type: 'string', description: 'Title of the slide' },
                    script_text: { type: 'string', description: 'Voice-over script text for this slide' },
                    layout_type: { type: 'string', description: 'Layout template to use for this slide' },
                    visual_description: { type: 'string', description: 'Detailed description of visual elements' },
                    estimated_duration: { type: 'number', description: 'Estimated duration for this slide in seconds' }
                  },
                  required: ['scene_id', 'title', 'script_text', 'layout_type', 'visual_description'],
                  description: 'Individual slide data'
                },
                minItems: 1,
                description: 'Array of all slides in the project'
              }
            },
            required: ['project_metadata', 'slides'],
            description: 'Complete plan JSON with project metadata and all slide information'
          },
          output_directory: {
            type: 'string',
            description: 'Path to the video project root directory where slides/ folder will be created'
          },
          overwrite_existing: {
            type: 'boolean',
            description: 'Whether to overwrite existing slide directories and info.json files. Defaults to true.',
            default: true
          }
        },
        required: ['plan_json', 'output_directory']
      }
    );
  }

  validateToolParams(params: InitiateSlidesParams): string | null {
    if (
      this.schema.parameters &&
      !SchemaValidator.validate(
        this.schema.parameters as Record<string, unknown>,
        params
      )
    ) {
      return 'Parameters failed schema validation. Check plan_json structure and output_directory.';
    }

    if (!params.plan_json) {
      return 'The plan_json parameter is required.';
    }

    if (!params.plan_json.project_metadata) {
      return 'The plan_json must contain project_metadata.';
    }

    if (!params.plan_json.slides || !Array.isArray(params.plan_json.slides)) {
      return 'The plan_json must contain a slides array.';
    }

    if (params.plan_json.slides.length === 0) {
      return 'The slides array must contain at least one slide.';
    }

    // Validate each slide has required fields
    for (let i = 0; i < params.plan_json.slides.length; i++) {
      const slide = params.plan_json.slides[i];
      if (!slide.scene_id || typeof slide.scene_id !== 'string') {
        return `Slide ${i + 1} must have a valid scene_id string.`;
      }
      if (!slide.title || typeof slide.title !== 'string') {
        return `Slide ${i + 1} must have a valid title string.`;
      }
      if (!slide.script_text || typeof slide.script_text !== 'string') {
        return `Slide ${i + 1} must have a valid script_text string.`;
      }
      if (!slide.layout_type || typeof slide.layout_type !== 'string') {
        return `Slide ${i + 1} must have a valid layout_type string.`;
      }
      if (!slide.visual_description || typeof slide.visual_description !== 'string') {
        return `Slide ${i + 1} must have a valid visual_description string.`;
      }
    }

    if (!params.output_directory || typeof params.output_directory !== 'string') {
      return 'The output_directory parameter must be a valid string.';
    }

    // Check for duplicate scene_ids
    const sceneIds = params.plan_json.slides.map(slide => slide.scene_id);
    const uniqueSceneIds = new Set(sceneIds);
    if (sceneIds.length !== uniqueSceneIds.size) {
      return 'All scene_ids must be unique.';
    }

    return null;
  }

  getDescription(params: InitiateSlidesParams): string {
    const slideCount = params.plan_json.slides.length;
    const projectTitle = params.plan_json.project_metadata.title;
    return `Creating ${slideCount} slide${slideCount > 1 ? 's' : ''} for "${projectTitle}"`;
  }

  async execute(params: InitiateSlidesParams): Promise<ToolResult> {
    const validationError = this.validateToolParams(params);
    if (validationError) {
      return {
        llmContent: JSON.stringify({ success: false, error: validationError }),
        returnDisplay: `Error: ${validationError}`
      };
    }

    const { plan_json, output_directory, overwrite_existing = true } = params;

    try {
      console.log(
        `[InitiateSlidesTool] Creating ${plan_json.slides.length} slides in ${output_directory}`
      );

      // Create slides directory if it doesn't exist
      const slidesDir = path.join(output_directory, 'slides');
      await fs.mkdir(slidesDir, { recursive: true });

      const createdSlides: string[] = [];
      const overwrittenSlides: string[] = [];
      const errors: string[] = [];

      // Process each slide
      for (const slide of plan_json.slides) {
        try {
          const slideDir = path.join(slidesDir, slide.scene_id);
          const infoJsonPath = path.join(slideDir, 'info.json');

          // Check if slide directory already exists
          let slideExists = false;
          try {
            await fs.access(slideDir);
            slideExists = true;
          } catch (e) {
            // Directory doesn't exist, which is fine
          }

          // Create slide directory
          await fs.mkdir(slideDir, { recursive: true });

          // Create info.json with planning data and default values
          const infoJson = {
            scene_id: slide.scene_id,
            title: slide.title,
            script_text: slide.script_text,
            layout_type: slide.layout_type,
            visual_description: slide.visual_description,
            start_time: null,
            end_time: null,
            word_wise_timings: [],
            image_urls: [],
            generation_metadata: {
              created_at: new Date().toISOString(),
              last_modified: new Date().toISOString(),
              version: '1.0',
              estimated_duration: slide.estimated_duration || null
            }
          };

          // Write info.json file
          await fs.writeFile(
            infoJsonPath,
            JSON.stringify(infoJson, null, 2),
            'utf-8'
          );

          if (slideExists) {
            overwrittenSlides.push(slide.scene_id);
          } else {
            createdSlides.push(slide.scene_id);
          }

          console.log(`[InitiateSlidesTool] ${slideExists ? 'Overwritten' : 'Created'} ${slide.scene_id}`);

        } catch (error) {
          const errorMessage = `Failed to create ${slide.scene_id}: ${error instanceof Error ? error.message : String(error)}`;
          console.error(`[InitiateSlidesTool] ${errorMessage}`);
          errors.push(errorMessage);
        }
      }

      // Save plan.json to the output directory
      try {
        const planJsonPath = path.join(output_directory, 'plan.json');
        await fs.writeFile(
          planJsonPath,
          JSON.stringify(plan_json, null, 2),
          'utf-8'
        );
        console.log(`[InitiateSlidesTool] Saved plan.json to ${planJsonPath}`);
      } catch (error) {
        console.error(`[InitiateSlidesTool] Failed to save plan.json:`, error);
        errors.push(`Failed to save plan.json: ${error instanceof Error ? error.message : String(error)}`);
      }

      // Update state.json if it exists
      try {
        const stateJsonPath = path.join(output_directory, 'state.json');
        let stateJson: any = {};
        
        try {
          const existingState = await fs.readFile(stateJsonPath, 'utf-8');
          stateJson = JSON.parse(existingState);
        } catch (e) {
          // File doesn't exist or is invalid, use empty object
        }

        // Update state with slide initialization info
        stateJson.slides_initiated = {
          timestamp: new Date().toISOString(),
          total_slides: plan_json.slides.length,
          created_slides: createdSlides.length,
          overwritten_slides: overwrittenSlides.length,
          slide_list: plan_json.slides.map(slide => slide.scene_id)
        };
        stateJson.current_stage = 'slides_initiated';
        stateJson.last_modified = new Date().toISOString();

        await fs.writeFile(
          stateJsonPath,
          JSON.stringify(stateJson, null, 2),
          'utf-8'
        );
        console.log(`[InitiateSlidesTool] Updated state.json`);
      } catch (error) {
        console.error(`[InitiateSlidesTool] Failed to update state.json:`, error);
        // Don't add to errors since this is not critical
      }

      const totalProcessed = createdSlides.length + overwrittenSlides.length;
      const successMessage = `Successfully initiated ${totalProcessed} slides`;
      const hasErrors = errors.length > 0;

      return {
        llmContent: JSON.stringify({
          success: !hasErrors || totalProcessed > 0,
          project_title: plan_json.project_metadata.title,
          total_slides: plan_json.slides.length,
          created_slides: createdSlides.length,
          overwritten_slides: overwrittenSlides.length,
          created_slide_list: createdSlides,
          overwritten_slide_list: overwrittenSlides,
          errors: errors,
          slides_directory: slidesDir,
          plan_json_saved: true,
          state_updated: true,
          message: hasErrors ? `${successMessage} with ${errors.length} errors` : successMessage
        }),
        returnDisplay: `✅ ${successMessage}${hasErrors ? ` with ${errors.length} errors` : ''}\n\n📊 Results:\n- Created: ${createdSlides.length} slides\n- Overwritten: ${overwrittenSlides.length} slides\n- Errors: ${errors.length}\n\n📁 Slides Directory: ${slidesDir}\n\n🎬 Slides Created:\n${[...createdSlides, ...overwrittenSlides].map((id, i) => `${i + 1}. ${id}`).join('\n')}${errors.length > 0 ? `\n\n❌ Errors:\n${errors.map((err, i) => `${i + 1}. ${err}`).join('\n')}` : ''}`
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[InitiateSlidesTool] Error in slide initialization:`, errorMessage);

      return {
        llmContent: JSON.stringify({
          success: false,
          error: `Slide initialization failed: ${errorMessage}`
        }),
        returnDisplay: `❌ Error initializing slides: ${errorMessage}`
      };
    }
  }
}