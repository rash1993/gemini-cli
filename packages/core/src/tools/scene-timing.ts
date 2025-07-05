/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { BaseTool, ToolResult } from './tools.js';
import { SchemaValidator } from '../utils/schemaValidator.js';
import { Config } from '../config/config.js';

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
}

/**
 * Scene Timing tool that maps scenes with narration text to audio timings using a FastAPI backend service.
 * Takes a list of scenes and an audio URL, then determines the timing for each scene.
 */
export class SceneTimingTool extends BaseTool<SceneTimingParams, ToolResult> {
  static readonly Name: string = 'map_scenes_to_audio';
  private backendUrl: string;
  private backendApiKey: string;

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
                  description: 'Unique identifier for the scene'
                },
                text: {
                  type: 'string',
                  description: 'Narration text for the scene'
                }
              },
              required: ['scene_id', 'text']
            },
            description: 'List of scenes with their narration text',
            minItems: 1
          },
          audio_url: {
            type: 'string',
            description: 'URL of the audio file (GCS URL or public URL) to map scenes against'
          },
          similarity_threshold: {
            type: 'number',
            minimum: 0,
            maximum: 1,
            description: 'Threshold for scene-to-word matching (0.0-1.0). Higher values require more exact matches. Defaults to 0.9',
            default: 0.9
          },
          language_code: {
            type: 'string',
            description: 'Language code for transcription (e.g., en-US, es-ES, fr-FR). Defaults to en-US',
            default: 'en-US'
          }
        },
        required: ['scenes', 'audio_url']
      }
    );
    
    // Get backend configuration from environment or config
    this.backendUrl = process.env.BACKEND_URL || config?.getBackendUrl() || '';
    this.backendApiKey = process.env.BACKEND_API_KEY || config?.getBackendApiKey() || '';
    
    if (!this.backendUrl || !this.backendApiKey) {
      console.warn('[SceneTimingTool] Backend URL or API key not configured. Set BACKEND_URL and BACKEND_API_KEY environment variables.');
    }
  }

  validateToolParams(params: SceneTimingParams): string | null {
    if (!this.backendUrl || !this.backendApiKey) {
      return 'Backend URL or API key not configured. Please set BACKEND_URL and BACKEND_API_KEY environment variables.';
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

    if (!params.scenes || !Array.isArray(params.scenes) || params.scenes.length === 0) {
      return 'The scenes parameter must be a non-empty array.';
    }

    for (let i = 0; i < params.scenes.length; i++) {
      const scene = params.scenes[i];
      if (!scene.scene_id || typeof scene.scene_id !== 'string') {
        return `Scene ${i + 1} must have a valid scene_id string.`;
      }
      if (!scene.text || typeof scene.text !== 'string' || scene.text.trim() === '') {
        return `Scene ${i + 1} must have non-empty text.`;
      }
    }

    if (!params.audio_url || typeof params.audio_url !== 'string') {
      return 'The audio_url parameter must be a valid string.';
    }

    if (params.similarity_threshold !== undefined && 
        (typeof params.similarity_threshold !== 'number' || 
         params.similarity_threshold < 0 || 
         params.similarity_threshold > 1)) {
      return 'The similarity_threshold must be a number between 0 and 1.';
    }

    if (params.language_code !== undefined && typeof params.language_code !== 'string') {
      return 'The language_code must be a string.';
    }

    return null;
  }

  getDescription(params: SceneTimingParams): string {
    const sceneCount = params.scenes.length;
    const threshold = params.similarity_threshold || 0.9;
    const language = params.language_code || 'en-US';
    return `Mapping ${sceneCount} scene${sceneCount > 1 ? 's' : ''} to audio timings (threshold: ${threshold}, language: ${language})`;
  }

  async execute(params: SceneTimingParams, signal: AbortSignal): Promise<ToolResult> {
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
      similarity_threshold = 0.9,
      language_code = 'en-US'
    } = params;

    try {
      // Check if operation was cancelled
      if (signal.aborted) {
        throw new Error('Scene timing mapping was cancelled');
      }

      console.log(`[SceneTimingTool] Starting scene timing mapping for ${scenes.length} scenes`);
      
      // Step 1: Create session
      const sessionId = await this.createSession({
        scenes,
        audio_url,
        similarity_threshold,
        language_code
      });
      
      console.log(`[SceneTimingTool] Session created: ${sessionId}`);
      
      // Step 2: Start processing
      await this.startProcessing(sessionId);
      
      // Step 3: Poll for completion
      const result = await this.pollForCompletion(sessionId, signal);
      
      if (result.success && result.scene_mappings && result.scene_mappings.length > 0) {
        const mappedCount = result.scene_mappings.length;
        const unmappedCount = result.unmapped_scenes?.length || 0;
        const processingTime = result.processing_time || 0;
        
        const successMessage = `Successfully mapped ${mappedCount} scene${mappedCount > 1 ? 's' : ''} to audio timings`;
        
        return {
          llmContent: JSON.stringify({
            success: true,
            session_id: sessionId,
            scenes_mapped: mappedCount,
            scenes_unmapped: unmappedCount,
            processing_time: processingTime,
            scene_mappings: result.scene_mappings,
            unmapped_scenes: result.unmapped_scenes || [],
            message: successMessage,
          }),
          returnDisplay: `✅ ${successMessage}\\n\\n📊 Results:\\n- Mapped: ${mappedCount} scenes\\n- Unmapped: ${unmappedCount} scenes\\n- Processing time: ${processingTime.toFixed(2)}s\\n\\n🎬 Scene Timings:\\n${result.scene_mappings.map((scene, i) => `${i + 1}. ${scene.scene_id}: ${scene.start_time.toFixed(2)}s - ${scene.end_time.toFixed(2)}s`).join('\\n')}\\n\\n💾 Session ID: ${sessionId}`,
        };
      } else {
        const errorMessage = result.error || 'Scene timing mapping failed with unknown error';
        throw new Error(errorMessage);
      }
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[SceneTimingTool] Error in scene timing mapping:`, errorMessage);
      
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
   * Create a new scene text mapping session
   */
  private async createSession(params: {
    scenes: SceneInput[];
    audio_url: string;
    similarity_threshold: number;
    language_code: string;
  }): Promise<string> {
    const response = await fetch(`${this.backendUrl}/scene_segment/map_scenes_to_audio/sessions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'BACKEND-API-KEY': this.backendApiKey,
      },
      body: JSON.stringify({
        audio_gcs_url: params.audio_url,
        scenes: params.scenes,
        similarity_threshold: params.similarity_threshold,
        language_code: params.language_code,
        store_type: 'mongodb'
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to create session: ${response.status} ${errorText}`);
    }

    const result = await response.json();
    if (!result.session_id) {
      throw new Error('No session ID returned from scene timing service');
    }

    return result.session_id;
  }

  /**
   * Start processing a session
   */
  private async startProcessing(sessionId: string): Promise<void> {
    const response = await fetch(`${this.backendUrl}/scene_segment/map_scenes_to_audio/sessions/${sessionId}/process`, {
      method: 'POST',
      headers: {
        'BACKEND-API-KEY': this.backendApiKey,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to start processing: ${response.status} ${errorText}`);
    }
  }

  /**
   * Poll for scene timing completion
   */
  private async pollForCompletion(sessionId: string, signal: AbortSignal): Promise<{
    success: boolean;
    scene_mappings?: Array<{
      scene_id: string;
      start_time: number;
      end_time: number;
      content: string;
      words: Array<{
        word: string;
        start_time: number;
        end_time: number;
        confidence: number;
      }>;
    }>;
    unmapped_scenes?: string[];
    processing_time?: number;
    error?: string;
  }> {
    const maxAttempts = 120; // 10 minutes with 5-second intervals
    const pollInterval = 5000; // 5 seconds

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (signal.aborted) {
        throw new Error('Scene timing mapping was cancelled');
      }

      try {
        const response = await fetch(`${this.backendUrl}/scene_segment/map_scenes_to_audio/sessions/${sessionId}`, {
          headers: {
            'BACKEND-API-KEY': this.backendApiKey,
          },
        });

        if (!response.ok) {
          throw new Error(`Failed to check status: ${response.status}`);
        }

        const sessionData = await response.json();
        
        console.log(`[SceneTimingTool] Session ${sessionId} status: ${sessionData.stage} (${sessionData.status})`);

        if (sessionData.stage === 'completed') {
          return {
            success: true,
            scene_mappings: sessionData.scene_mappings || [],
            unmapped_scenes: sessionData.unmapped_scenes || [],
            processing_time: sessionData.processing_time || 0
          };
        } else if (sessionData.stage === 'error') {
          return {
            success: false,
            error: sessionData.error || 'Scene timing mapping failed'
          };
        }

        // Still processing, wait before next poll
        await new Promise(resolve => setTimeout(resolve, pollInterval));

      } catch (error) {
        console.error(`[SceneTimingTool] Error polling session ${sessionId}:`, error);
        
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