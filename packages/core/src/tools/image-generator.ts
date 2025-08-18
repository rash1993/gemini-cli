/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { BaseTool, ToolResult } from './tools.js';
import { SchemaValidator } from '../utils/schemaValidator.js';
import { Config } from '../config/config.js';

/**
 * Parameters for the ImageGeneratorTool.
 */
export interface ImageGeneratorParams {
  prompt: string;
  aspect_ratio?: string;
  negative_prompt?: string;
  number_of_images?: number;
}

/**
 * Image Generator tool that creates images from text prompts using a unified AI service.
 * Uses Imagen3 for high-quality image generation.
 */
export class ImageGeneratorTool extends BaseTool<ImageGeneratorParams, ToolResult> {
  static readonly Name: string = 'generate_image';
  private apiUrl: string = 'http://35.238.235.218';
  private apiKey: string = 'videoagent@backend1qaz0okm';

  constructor(private readonly config?: Config) {
    super(
      ImageGeneratorTool.Name,
      'Image Generator',
      'Generates images from text descriptions using Imagen3. Provide a detailed text prompt describing the image you want to create. Optionally specify aspect ratio, negative prompt, and number of images.',
      {
        type: 'object',
        properties: {
          prompt: {
            type: 'string',
            description: 'A detailed description of the image to generate. Be specific about style, content, colors, composition, etc.',
          },
          aspect_ratio: {
            type: 'string',
            enum: ['1:1', '16:9', '9:16', '4:3', '3:4'],
            description: 'The aspect ratio for the generated image. Defaults to 16:9',
            default: '16:9',
          },
          negative_prompt: {
            type: 'string',
            description: 'Text to discourage in generation (optional)',
          },
          number_of_images: {
            type: 'number',
            minimum: 1,
            maximum: 4,
            description: 'Number of images to generate (1-4). Defaults to 1',
            default: 1,
          },
        },
        required: ['prompt'],
      },
    );
    
    // Allow override from environment if needed
    this.apiUrl = process.env.UNIFIED_AI_URL || this.apiUrl;
    this.apiKey = process.env.UNIFIED_AI_KEY || this.apiKey;
  }

  validateParams(params: ImageGeneratorParams): string | null {
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
      return 'Parameters failed schema validation. Ensure prompt is a non-empty string.';
    }

    if (!params.prompt || params.prompt.trim() === '') {
      return 'The prompt parameter cannot be empty.';
    }

    if (params.prompt.length > 1000) {
      return 'The prompt is too long. Please keep it under 1000 characters.';
    }

    const validAspectRatios = ['1:1', '16:9', '9:16', '4:3', '3:4'];
    if (params.aspect_ratio && !validAspectRatios.includes(params.aspect_ratio)) {
      return `Invalid aspect ratio. Must be one of: ${validAspectRatios.join(', ')}`;
    }

    if (params.number_of_images && (params.number_of_images < 1 || params.number_of_images > 4)) {
      return 'Number of images must be between 1 and 4.';
    }

    return null;
  }

  getDescription(params: ImageGeneratorParams): string {
    const aspectRatio = params.aspect_ratio || '16:9';
    const numImages = params.number_of_images || 1;
    const description = `Generating ${numImages} image${numImages > 1 ? 's' : ''}: "${params.prompt}" (${aspectRatio})`;
    return params.negative_prompt ? `${description} [avoiding: ${params.negative_prompt}]` : description;
  }

  async execute(params: ImageGeneratorParams, signal: AbortSignal): Promise<ToolResult> {
    const validationError = this.validateParams(params);
    if (validationError) {
      return {
        llmContent: JSON.stringify({ success: false, error: validationError }),
        returnDisplay: `Error: ${validationError}`,
      };
    }

    const { 
      prompt, 
      aspect_ratio = '16:9', 
      negative_prompt,
      number_of_images = 1 
    } = params;

    try {
      // Check if operation was cancelled
      if (signal.aborted) {
        throw new Error('Image generation was cancelled');
      }

      console.log(`[ImageGeneratorTool] Starting image generation for prompt: "${prompt.substring(0, 50)}..."`);
      
      // Step 1: Initiate image generation
      const taskId = await this.initiateImageGeneration({
        prompt,
        aspect_ratio,
        negative_prompt,
        number_of_images
      });
      
      console.log(`[ImageGeneratorTool] Image generation task created: ${taskId}`);
      
      // Step 2: Poll for completion
      const result = await this.pollForCompletion(taskId, signal);
      
      if (result.success && result.images && result.images.length > 0) {
        const imageCount = result.images.length;
        const successMessage = `Successfully generated ${imageCount} image${imageCount > 1 ? 's' : ''} using Imagen3`;
        
        return {
          llmContent: JSON.stringify({
            success: true,
            task_id: taskId,
            prompt,
            aspect_ratio,
            negative_prompt,
            number_of_images,
            image_urls: result.images,
            message: successMessage,
          }),
          returnDisplay: `✅ ${successMessage}\n\n🎨 Prompt: ${prompt}\n📐 Aspect Ratio: ${aspect_ratio}${negative_prompt ? `\n🚫 Negative Prompt: ${negative_prompt}` : ''}\n\n🔗 Generated Images:\n${result.images.map((url, i) => `${i + 1}. ${url}`).join('\n')}\n\n💾 Task ID: ${taskId}`,
        };
      } else {
        const errorMessage = result.error || 'Image generation failed with unknown error';
        throw new Error(errorMessage);
      }
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[ImageGeneratorTool] Error generating image:`, errorMessage);
      
      return {
        llmContent: JSON.stringify({
          success: false,
          error: `Image generation failed: ${errorMessage}`,
        }),
        returnDisplay: `❌ Error generating image: ${errorMessage}`,
      };
    }
  }

  /**
   * Initiate image generation by calling the unified AI service.
   */
  private async initiateImageGeneration(params: {
    prompt: string;
    aspect_ratio: string;
    negative_prompt?: string;
    number_of_images: number;
  }): Promise<string> {
    const response = await fetch(`${this.apiUrl}/api/v1/image/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': this.apiKey,
      },
      body: JSON.stringify({
        prompt: params.prompt,
        provider: 'imagen3',
        aspect_ratio: params.aspect_ratio,
        negative_prompt: params.negative_prompt,
        number_of_images: params.number_of_images,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to initiate image generation: ${response.status} ${errorText}`);
    }

    const result = await response.json();
    if (!result.task_id) {
      throw new Error('No task ID returned from image generation service');
    }

    return result.task_id;
  }

  /**
   * Poll for image generation completion.
   */
  private async pollForCompletion(taskId: string, signal: AbortSignal): Promise<{
    success: boolean;
    images?: string[];
    error?: string;
  }> {
    const maxAttempts = 40; // ~2 minutes with 3-second intervals
    const pollInterval = 3000; // 3 seconds

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (signal.aborted) {
        throw new Error('Image generation was cancelled');
      }

      try {
        const response = await fetch(`${this.apiUrl}/api/v1/image/task/${taskId}`, {
          headers: {
            'X-API-Key': this.apiKey,
          },
        });

        if (!response.ok) {
          throw new Error(`Failed to check status: ${response.status}`);
        }

        const status = await response.json();
        
        console.log(`[ImageGeneratorTool] Task ${taskId} status: ${status.status}`);

        if (status.status === 'completed') {
          return {
            success: true,
            images: status.images || [],
          };
        } else if (status.status === 'failed') {
          return {
            success: false,
            error: status.error || 'Image generation failed',
          };
        }

        // Still processing, wait before next poll
        await new Promise(resolve => setTimeout(resolve, pollInterval));

      } catch (error) {
        console.error(`[ImageGeneratorTool] Error polling task ${taskId}:`, error);
        
        // On the last attempt, throw the error
        if (attempt === maxAttempts - 1) {
          throw error;
        }
        
        // Otherwise, wait and retry
        await new Promise(resolve => setTimeout(resolve, pollInterval));
      }
    }

    throw new Error(`Image generation timed out after ${maxAttempts * pollInterval / 1000} seconds`);
  }
}