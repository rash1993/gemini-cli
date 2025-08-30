/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { Config } from '../config/config.js';
import { SchemaValidator } from '../utils/schemaValidator.js';
import { BaseTool, ToolResult } from './tools.js';

/**
 * Input for a single scene
 */
export interface SceneInput {
  scene_id: string;
  text: string;
}

/**
 * Parameters for the SceneTimingTool
 */
export interface SceneTimingParams {
  scenes: SceneInput[];
  audio_url: string;
  similarity_threshold?: number;
  language_code?: string;
  output_directory?: string;
}

/**
 * Scene Timing tool that maps scenes with narration text to audio timings using a FastAPI backend service.
 * Takes a list of scenes and an audio URL, then determines the timing for each scene.
 */
export class SceneTimingTool extends BaseTool<SceneTimingParams, ToolResult> {
  static readonly Name: string = 'map_scenes_to_audio';
  private apiUrl: string = 'http://35.238.235.218';
  private apiKey: string = 'videoagent@backend1qaz0okm';

  constructor(private readonly config?: Config) {
    super(
      SceneTimingTool.Name,
      'Scene Timing Mapper',
      'Maps scenes with narration text to audio timings. Provide a list of scenes (each with scene_id and text) and an audio URL to get precise timing information for each scene based on audio transcription.',
      {
        type: 'object',
        properties: {
          scenes: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                scene_id: {
                  type: 'string',
                  description: 'Unique identifier for the scene',
                },
                text: {
                  type: 'string',
                  description: 'Narration text for the scene',
                },
              },
              required: ['scene_id', 'text'],
            },
            description: 'List of scenes with their narration text',
            minItems: 1,
          },
          audio_url: {
            type: 'string',
            description:
              'URL of the audio file (GCS URL or public URL) to map scenes against',
          },
          similarity_threshold: {
            type: 'number',
            minimum: 0,
            maximum: 1,
            description:
              'Threshold for scene-to-word matching (0.0-1.0). Higher values require more exact matches. Defaults to 0.7',
            default: 0.7,
          },
          language_code: {
            type: 'string',
            description:
              'Language code for transcription (e.g., en-US, es-ES, fr-FR). Defaults to en-US',
            default: 'en-US',
          },
          output_directory: {
            type: 'string',
            description:
              'Video project root directory (will save timing data to slides/slide-XXX/info.json). If not provided, timings are only returned in the output.',
          },
        },
        required: ['scenes', 'audio_url'],
      },
    );

    // Allow override from environment if needed
    this.apiUrl = process.env.UNIFIED_AI_URL || this.apiUrl;
    this.apiKey = process.env.UNIFIED_AI_KEY || this.apiKey;

    if (!this.apiUrl || !this.apiKey) {
      console.warn(
        '[SceneTimingTool] API URL or key not configured. Set UNIFIED_AI_URL and UNIFIED_AI_KEY environment variables.',
      );
    }
  }

  validateToolParams(params: SceneTimingParams): string | null {
    if (!this.apiUrl || !this.apiKey) {
      return 'API URL or key not configured. Please set UNIFIED_AI_URL and UNIFIED_AI_KEY environment variables.';
    }

    if (
      this.schema.parameters &&
      !SchemaValidator.validate(
        this.schema.parameters as Record<string, unknown>,
        params,
      )
    ) {
      return 'Parameters failed schema validation. Check scenes array and audio_url.';
    }

    if (
      !params.scenes ||
      !Array.isArray(params.scenes) ||
      params.scenes.length === 0
    ) {
      return 'The scenes parameter must be a non-empty array.';
    }

    for (let i = 0; i < params.scenes.length; i++) {
      const scene = params.scenes[i];
      if (!scene.scene_id || typeof scene.scene_id !== 'string') {
        return `Scene ${i + 1} must have a valid scene_id string.`;
      }
      if (
        !scene.text ||
        typeof scene.text !== 'string' ||
        scene.text.trim() === ''
      ) {
        return `Scene ${i + 1} must have non-empty text.`;
      }
    }

    if (!params.audio_url || typeof params.audio_url !== 'string') {
      return 'The audio_url parameter must be a valid string.';
    }

    if (
      params.similarity_threshold !== undefined &&
      (typeof params.similarity_threshold !== 'number' ||
        params.similarity_threshold < 0 ||
        params.similarity_threshold > 1)
    ) {
      return 'The similarity_threshold must be a number between 0 and 1.';
    }

    if (
      params.language_code !== undefined &&
      typeof params.language_code !== 'string'
    ) {
      return 'The language_code must be a string.';
    }

    if (
      params.output_directory !== undefined &&
      typeof params.output_directory !== 'string'
    ) {
      return 'The output_directory must be a string.';
    }

    return null;
  }

  getDescription(params: SceneTimingParams): string {
    const sceneCount = params.scenes.length;
    const threshold = params.similarity_threshold || 0.7;
    const language = params.language_code || 'en-US';
    return `Mapping ${sceneCount} scene${sceneCount > 1 ? 's' : ''} to audio timings (threshold: ${threshold}, language: ${language})`;
  }

  async execute(
    params: SceneTimingParams,
    signal: AbortSignal,
  ): Promise<ToolResult> {
    const validationError = this.validateToolParams(params);
    if (validationError) {
      return {
        llmContent: JSON.stringify({ success: false, error: validationError }),
        returnDisplay: `Error: ${validationError}`,
      };
    }

    const {
      scenes,
      audio_url,
      similarity_threshold = 0.7,
      language_code = 'en-US',
      output_directory,
    } = params;

    try {
      // Check if operation was cancelled
      if (signal.aborted) {
        throw new Error('Scene timing mapping was cancelled');
      }

      console.log(
        `[SceneTimingTool] Starting scene timing mapping for ${scenes.length} scenes`,
      );

      // Step 1: Initiate scene timing task
      const initResult = await this.initiateSceneTiming({
        scenes,
        audio_url,
        similarity_threshold,
        language_code,
      });

      // Check if the result is already complete
      let result;
      if (initResult.isComplete) {
        console.log(`[SceneTimingTool] Scene timing completed immediately`);
        result = initResult.result;
      } else {
        console.log(`[SceneTimingTool] Scene timing task created: ${initResult.taskId}`);
        // Step 2: Poll for completion
        result = await this.pollForCompletion(initResult.taskId!, signal);
      }

      if (
        result.success &&
        result.scenes &&
        result.scenes.length > 0
      ) {
        const mappedCount = result.mapped_scenes || result.scenes.length;
        const unmappedCount = result.unmapped_scenes?.length || 0;
        const processingTime = result.processing_time || 0;

        let successMessage = `Successfully mapped ${mappedCount} scene${mappedCount > 1 ? 's' : ''} to audio timings`;

        if (output_directory) {
          try {
            // Create slides directory if it doesn't exist
            const slidesDir = path.join(output_directory, 'slides');
            await fs.mkdir(slidesDir, { recursive: true });
            
            for (const scene of result.scenes) {
              // Create slide directory
              const slideDir = path.join(slidesDir, scene.scene_id);
              await fs.mkdir(slideDir, { recursive: true });
              
              // Check if info.json already exists
              const infoJsonPath = path.join(slideDir, 'info.json');
              let existingInfo: any = {};
              
              try {
                const existingContent = await fs.readFile(infoJsonPath, 'utf-8');
                existingInfo = JSON.parse(existingContent);
              } catch (e) {
                // File doesn't exist or is invalid, use empty object
              }
              
              // Update info.json with timing data
              const updatedInfo = {
                ...existingInfo,
                scene_id: scene.scene_id,
                title: scene.title || existingInfo.title || `Scene ${scene.scene_id}`,
                script_text: scene.content || existingInfo.script_text,
                start_time: scene.start_time,
                end_time: scene.end_time,
                duration: scene.duration,
                confidence: scene.confidence,
                word_wise_timings: scene.words ? scene.words.map((w: any) => ({
                  word: w.word,
                  start_time: w.start_time,
                  end_time: w.end_time
                })) : [],
                generation_metadata: {
                  ...existingInfo.generation_metadata,
                  last_modified: new Date().toISOString(),
                  timing_updated: new Date().toISOString()
                }
              };
              
              await fs.writeFile(
                infoJsonPath,
                JSON.stringify(updatedInfo, null, 2),
              );
            }
            successMessage += `
Timing data updated in slide directories: ${slidesDir}`;
          } catch (e) {
            console.error(`[SceneTimingTool] Error writing timing files:`, e);
            successMessage += `
Warning: Could not write timing files to ${output_directory}.`;
          }
        }

        return {
          llmContent: JSON.stringify({
            success: true,
            task_id: initResult.taskId || 'immediate',
            scenes_mapped: mappedCount,
            scenes_unmapped: unmappedCount,
            processing_time: processingTime,
            scenes: result.scenes,
            unmapped_scenes: result.unmapped_scenes || [],
            message: successMessage,
          }),
          returnDisplay: `✅ ${successMessage}\n\n📊 Results:\n- Mapped: ${mappedCount} scenes\n- Unmapped: ${unmappedCount} scenes\n- Audio Duration: ${result.audio_duration ? result.audio_duration.toFixed(2) + 's' : 'N/A'}\n\n🎬 Scene Timings:\n${result.scenes.map((scene: any, i: number) => `${i + 1}. ${scene.scene_id}: ${scene.start_time.toFixed(2)}s - ${scene.end_time.toFixed(2)}s (${scene.duration.toFixed(2)}s)`).join('\n')}\n\n💾 Task ID: ${initResult.taskId || 'immediate'}`,
        };
      } else {
        const errorMessage =
          result.error || 'Scene timing mapping failed with unknown error';
        throw new Error(errorMessage);
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(
        `[SceneTimingTool] Error in scene timing mapping:`,
        errorMessage,
      );

      return {
        llmContent: JSON.stringify({
          success: false,
          error: `Scene timing mapping failed: ${errorMessage}`,
        }),
        returnDisplay: `❌ Error mapping scenes to audio: ${errorMessage}`,
      };
    }
  }

  /**
   * Initiate scene timing task by calling the unified AI service
   * Returns either a task ID for polling or the complete result if processing was immediate
   */
  private async initiateSceneTiming(params: {
    scenes: SceneInput[];
    audio_url: string;
    similarity_threshold: number;
    language_code: string;
  }): Promise<{ isComplete: boolean; taskId?: string; result?: any }> {
    const response = await fetch(
      `${this.apiUrl}/api/v1/scene-timing/map`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': this.apiKey,
        },
        body: JSON.stringify({
          scenes: params.scenes,
          audio_url: params.audio_url,
          language_code: params.language_code,
          similarity_threshold: params.similarity_threshold,
        }),
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Failed to initiate scene timing: ${response.status} ${errorText}`,
      );
    }

    const result = await response.json();
    
    // Check if we got a task_id
    if (!result.task_id) {
      throw new Error('No task ID returned from scene timing service');
    }
    
    // If status is "completed", the results are ready to fetch immediately
    // But they're not included in this response - we need to fetch them
    if (result.status === 'completed') {
      console.log('[SceneTimingTool] Task completed immediately, fetching results...');
      
      // Fetch the results right away
      const resultResponse = await fetch(
        `${this.apiUrl}/api/v1/scene-timing/result/${result.task_id}`,
        {
          headers: {
            'X-API-Key': this.apiKey,
          },
        },
      );
      
      if (resultResponse.ok) {
        const resultData = await resultResponse.json();
        
        // Check if we have successful results
        if (resultData.success === true && resultData.scene_mappings) {
          return {
            isComplete: true,
            result: {
              success: true,
              audio_duration: resultData.transcription?.duration_seconds,
              total_scenes: resultData.scene_mappings?.length,
              mapped_scenes: resultData.scene_mappings?.length,
              scenes: resultData.scene_mappings || [],
              unmapped_scenes: resultData.unmapped_scenes || [],
              processing_time: resultData.processing_time || 0,
            }
          };
        }
      }
    }

    // Status is not "completed" or fetch failed, need to poll
    return {
      isComplete: false,
      taskId: result.task_id
    };
  }

  /**
   * Poll for scene timing completion
   */
  private async pollForCompletion(
    taskId: string,
    signal: AbortSignal,
  ): Promise<{
    success: boolean;
    audio_duration?: number;
    total_scenes?: number;
    mapped_scenes?: number;
    scenes?: Array<{
      scene_id: string;
      title?: string;
      start_time: number;
      end_time: number;
      duration: number;
      confidence: number;
      content?: string;
      words?: Array<{
        word: string;
        start_time: number;
        end_time: number;
      }>;
    }>;
    unmapped_scenes?: string[];
    processing_time?: number;
    error?: string;
  }> {
    const maxAttempts = 300; // 15 minutes with 3-second intervals
    const pollInterval = 3000; // 3 seconds

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (signal.aborted) {
        throw new Error('Scene timing mapping was cancelled');
      }

      try {
        const response = await fetch(
          `${this.apiUrl}/api/v1/scene-timing/result/${taskId}`,
          {
            headers: {
              'X-API-Key': this.apiKey,
            },
          },
        );

        if (!response.ok) {
          // Handle 400 errors gracefully - task might still be initializing
          if (response.status === 400) {
            console.log(
              `[SceneTimingTool] Task ${taskId} not ready yet (HTTP 400), continuing to poll...`,
            );
            // Wait before next poll
            await new Promise((resolve) => setTimeout(resolve, pollInterval));
            continue;
          }
          
          // Handle gateway/server errors (502, 503, 504) - these are temporary
          if (response.status === 502 || response.status === 503 || response.status === 504) {
            console.log(
              `[SceneTimingTool] Server error ${response.status} for task ${taskId}, will retry...`,
            );
            // Wait longer for server errors
            await new Promise((resolve) => setTimeout(resolve, pollInterval * 2));
            continue;
          }
          
          // For other errors, log but continue polling for a few attempts
          console.error(
            `[SceneTimingTool] Error checking task ${taskId}: HTTP ${response.status}`,
          );
          
          // Don't throw immediately - continue polling
          // Wait before next poll
          await new Promise((resolve) => setTimeout(resolve, pollInterval));
          continue;
        }

        const result = await response.json();

        // Check if we have a successful response with scene_mappings
        // The API returns {success: true, scene_mappings: [...]} when complete
        if (result.success === true && result.scene_mappings) {
          console.log(
            `[SceneTimingTool] Task ${taskId} completed successfully`,
          );
          return {
            success: true,
            audio_duration: result.transcription?.duration_seconds,
            total_scenes: result.scene_mappings?.length,
            mapped_scenes: result.scene_mappings?.length,
            scenes: result.scene_mappings || [],
            unmapped_scenes: result.unmapped_scenes || [],
            processing_time: result.processing_time || 0,
          };
        } else if (result.success === false || result.error) {
          console.log(
            `[SceneTimingTool] Task ${taskId} failed: ${result.error}`,
          );
          return {
            success: false,
            error: result.error || 'Scene timing mapping failed',
          };
        } else if (result.status) {
          // Handle status-based responses if they exist
          console.log(
            `[SceneTimingTool] Task ${taskId} status: ${result.status}`,
          );
          if (result.status === 'completed') {
            return {
              success: true,
              audio_duration: result.audio_duration,
              total_scenes: result.total_scenes,
              mapped_scenes: result.mapped_scenes,
              scenes: result.scenes || [],
              unmapped_scenes: result.unmapped_scenes || [],
              processing_time: result.processing_time || 0,
            };
          } else if (result.status === 'failed') {
            return {
              success: false,
              error: result.error || 'Scene timing mapping failed',
            };
          }
        } else {
          // Still processing
          console.log(
            `[SceneTimingTool] Task ${taskId} still processing...`,
          );
        }

        // Still processing, wait before next poll
        await new Promise((resolve) => setTimeout(resolve, pollInterval));
      } catch (error) {
        console.error(
          `[SceneTimingTool] Error polling task ${taskId}:`,
          error,
        );

        // On the last attempt, throw the error
        if (attempt === maxAttempts - 1) {
          throw error;
        }

        // Otherwise, wait and retry
        await new Promise((resolve) => setTimeout(resolve, pollInterval));
      }
    }

    throw new Error(
      `Scene timing mapping timed out after ${(maxAttempts * pollInterval) / 1000} seconds`,
    );
  }
}
