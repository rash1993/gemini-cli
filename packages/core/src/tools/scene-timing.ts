/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { BaseTool, ToolResult } from './tools.js';
import { SchemaValidator } from '../utils/schemaValidator.js';
import { Config } from '../config/config.js';

/**
 * Parameters for the SceneTimingTool.
 */
export interface SceneTimingParams {
  scenes: Array<{
    scene_id: string;
    text: string;
  }>;
  audio_url: string;
  language_code?: string;
  similarity_threshold?: number;
}

/**
 * Scene Timing tool that maps scene narration text to precise timestamps in an audio file.
 * This is essential for synchronizing visual scenes with their corresponding audio narration in video production.
 */
export class SceneTimingTool extends BaseTool<SceneTimingParams, ToolResult> {
  static readonly Name: string = 'map_scene_timing';
  private apiUrl: string = 'http://35.238.235.218';
  private apiKey: string = 'videoagent@backend1qaz0okm';

  constructor(private readonly config?: Config) {
    super(
      SceneTimingTool.Name,
      'Scene Timing Mapper',
      'Maps scene narration text to precise timestamps in an audio file for video synchronization. Provide scenes with their narration text and an audio URL.',
      {
        type: 'object',
        properties: {
          scenes: {
            type: 'array',
            description: 'Array of scenes with scene_id and narration text',
            items: {
              type: 'object',
              properties: {
                scene_id: {
                  type: 'string',
                  description: 'Unique identifier for the scene',
                },
                text: {
                  type: 'string',
                  description: 'The narration text that should be spoken in the audio',
                },
              },
              required: ['scene_id', 'text'],
            },
          },
          audio_url: {
            type: 'string',
            description: 'URL of the audio file to map scenes to',
          },
          language_code: {
            type: 'string',
            description: 'Language code for transcription (e.g., "en-US"). Defaults to "en-US"',
            default: 'en-US',
          },
          similarity_threshold: {
            type: 'number',
            description: 'Matching threshold for text similarity (0.5-1.0). Defaults to 0.7',
            minimum: 0.5,
            maximum: 1.0,
            default: 0.7,
          },
        },
        required: ['scenes', 'audio_url'],
      },
    );
    
    // Allow override from environment if needed
    this.apiUrl = process.env.UNIFIED_AI_URL || this.apiUrl;
    this.apiKey = process.env.UNIFIED_AI_KEY || this.apiKey;
  }

  validateParams(params: SceneTimingParams): string | null {
    if (!this.apiUrl || !this.apiKey) {
      return 'API URL or key not configured.';
    }

    if (
      this.schema.parameters &&
      !SchemaValidator.validate(
        this.schema.parameters as Record<string, unknown>,
        params,
      )
    ) {
      return 'Parameters failed schema validation. Ensure scenes array and audio_url are provided.';
    }

    if (!params.scenes || params.scenes.length === 0) {
      return 'At least one scene must be provided.';
    }

    for (const scene of params.scenes) {
      if (!scene.scene_id || !scene.text) {
        return 'Each scene must have both scene_id and text.';
      }
      if (scene.text.trim() === '') {
        return `Scene ${scene.scene_id} has empty text.`;
      }
    }

    if (!params.audio_url || params.audio_url.trim() === '') {
      return 'Audio URL cannot be empty.';
    }

    if (!params.audio_url.startsWith('http://') && !params.audio_url.startsWith('https://')) {
      return 'Audio URL must be a valid HTTP or HTTPS URL.';
    }

    if (params.similarity_threshold !== undefined) {
      if (params.similarity_threshold < 0.5 || params.similarity_threshold > 1.0) {
        return 'Similarity threshold must be between 0.5 and 1.0.';
      }
    }

    return null;
  }

  getDescription(params: SceneTimingParams): string {
    const sceneCount = params.scenes.length;
    return `Mapping ${sceneCount} scene${sceneCount > 1 ? 's' : ''} to audio timestamps`;
  }

  async execute(params: SceneTimingParams, signal: AbortSignal): Promise<ToolResult> {
    const validationError = this.validateParams(params);
    if (validationError) {
      return {
        llmContent: JSON.stringify({ success: false, error: validationError }),
        returnDisplay: `Error: ${validationError}`,
      };
    }

    const { 
      scenes,
      audio_url,
      language_code = 'en-US',
      similarity_threshold = 0.7
    } = params;

    try {
      // Check if operation was cancelled
      if (signal.aborted) {
        throw new Error('Scene timing mapping was cancelled');
      }

      console.log(`[SceneTimingTool] Starting scene timing for ${scenes.length} scenes`);
      
      // Step 1: Initiate scene timing mapping
      const taskId = await this.initiateSceneTiming({
        scenes,
        audio_url,
        language_code,
        similarity_threshold
      });
      
      console.log(`[SceneTimingTool] Scene timing task created: ${taskId}`);
      
      // Step 2: Poll for completion
      const result = await this.pollForCompletion(taskId, signal);
      
      if (result.success && result.scenes) {
        const mappedCount = result.mapped_scenes || result.scenes.length;
        const unmappedCount = result.unmapped_scenes?.length || 0;
        const successMessage = `Successfully mapped ${mappedCount} scene${mappedCount !== 1 ? 's' : ''} to audio timestamps`;
        
        // Format scene timings for display
        const sceneTimings = result.scenes.map((scene: any) => {
          const duration = scene.duration !== null && scene.duration !== undefined 
            ? scene.duration 
            : (scene.end_time - scene.start_time);
          const confidence = scene.confidence || 0;
          return `  📍 ${scene.scene_id}: ${scene.start_time.toFixed(2)}s - ${scene.end_time.toFixed(2)}s (duration: ${duration.toFixed(2)}s, confidence: ${(confidence * 100).toFixed(0)}%)`;
        }).join('\n');
        
        return {
          llmContent: JSON.stringify({
            success: true,
            task_id: taskId,
            audio_duration: result.audio_duration,
            total_scenes: result.total_scenes,
            mapped_scenes: mappedCount,
            unmapped_scenes: result.unmapped_scenes || [],
            scenes: result.scenes,
            transcript_url: result.transcript_url,
            word_timing_url: result.word_timing_url,
            message: successMessage,
          }),
          returnDisplay: `✅ ${successMessage}\n\n🎵 Audio Duration: ${result.audio_duration?.toFixed(2)}s\n📊 Mapped: ${mappedCount}/${result.total_scenes} scenes${unmappedCount > 0 ? ` (${unmappedCount} unmapped)` : ''}\n\n📍 Scene Timings:\n${sceneTimings}\n\n💾 Task ID: ${taskId}`,
        };
      } else {
        const errorMessage = result.error || 'Scene timing mapping failed with unknown error';
        throw new Error(errorMessage);
      }
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[SceneTimingTool] Error mapping scene timings:`, errorMessage);
      
      return {
        llmContent: JSON.stringify({
          success: false,
          error: `Scene timing mapping failed: ${errorMessage}`,
        }),
        returnDisplay: `❌ Error mapping scene timings: ${errorMessage}`,
      };
    }
  }

  /**
   * Initiate scene timing mapping by calling the unified AI service.
   * Simplified to match image-generator.ts pattern - no timeout, just simple fetch.
   */
  private async initiateSceneTiming(params: {
    scenes: Array<{ scene_id: string; text: string }>;
    audio_url: string;
    language_code: string;
    similarity_threshold: number;
  }): Promise<string> {
    const response = await fetch(`${this.apiUrl}/api/v1/scene-timing/map`, {
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
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to initiate scene timing: ${response.status} ${errorText}`);
    }

    const result = await response.json();
    if (!result.task_id) {
      throw new Error('No task ID returned from scene timing service');
    }

    return result.task_id;
  }

  /**
   * Poll for scene timing completion using the result endpoint.
   * Simplified to match image-generator.ts pattern.
   */
  private async pollForCompletion(taskId: string, signal: AbortSignal): Promise<any> {
    const maxAttempts = 300; // 15 minutes with 3-second intervals (300 * 3s = 900s = 15min)
    const pollInterval = 3000; // 3 seconds

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (signal.aborted) {
        throw new Error('Scene timing mapping was cancelled');
      }

      try {
        // Use the result endpoint for polling
        const response = await fetch(`${this.apiUrl}/api/v1/scene-timing/result/${taskId}`, {
          headers: {
            'X-API-Key': this.apiKey,
          },
        });

        if (!response.ok) {
          // 400 means not ready yet, continue polling
          if (response.status === 400) {
            console.log(`[SceneTimingTool] Task ${taskId} still processing (attempt ${attempt + 1}/${maxAttempts})`);
            await new Promise(resolve => setTimeout(resolve, pollInterval));
            continue;
          }
          throw new Error(`Failed to check result: ${response.status}`);
        }

        const result = await response.json();
        
        console.log(`[SceneTimingTool] Task ${taskId} status: ${result.status || (result.success ? 'completed' : 'processing')}`);

        // Check if we have the actual results
        if (result.success === true && result.scene_mappings) {
          // Transform scene_mappings to scenes for consistency
          // Add calculated duration for each scene if missing
          const scenes = result.scene_mappings.map((scene: any) => ({
            ...scene,
            duration: scene.duration !== null && scene.duration !== undefined 
              ? scene.duration 
              : (scene.end_time - scene.start_time),
            confidence: scene.confidence || 0
          }));
          
          return {
            success: true,
            audio_duration: result.transcription?.duration_seconds,
            total_scenes: scenes.length,
            mapped_scenes: scenes.length,
            scenes: scenes,
            unmapped_scenes: result.unmapped_scenes || [],
            transcript_url: result.transcript_url || result.transcription?.transcript_url,
            word_timing_url: result.word_timing_url || result.transcription?.word_timing_url,
          };
        } else if (result.success === false) {
          return {
            success: false,
            error: result.error || 'Scene timing mapping failed',
          };
        }

        // Still processing, wait before next poll
        await new Promise(resolve => setTimeout(resolve, pollInterval));

      } catch (error) {
        console.error(`[SceneTimingTool] Error polling task ${taskId}:`, error);
        
        // On the last attempt, throw the error
        if (attempt === maxAttempts - 1) {
          throw error;
        }
        
        // Otherwise, wait and retry
        await new Promise(resolve => setTimeout(resolve, pollInterval));
      }
    }

    throw new Error(`Scene timing mapping timed out after ${maxAttempts * pollInterval / 1000} seconds`);
  }
}