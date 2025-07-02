/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { BaseTool, ToolResult } from './tools.js';
import { SchemaValidator } from '../utils/schemaValidator.js';
import { Config } from '../config/config.js';

/**
 * Parameters for the AudioGeneratorTool.
 */
export interface AudioGeneratorParams {
  text: string;
  language_code?: string;
  voice_name?: string;
  conversation_id?: string;
  method?: 'standard' | 'Chirp_gemini';
}

/**
 * Valid voices for standard TTS method by language code
 */
const VALID_VOICES: Record<string, string[]> = {
  'en-US': ['en-US-Journey-D', 'en-US-Journey-F', 'en-US-Journey-O', 'en-US-Neural2-A', 'en-US-Neural2-C'],
  'en-IN': ['en-IN-Chirp-HD-D', 'en-IN-Neural2-A', 'en-IN-Neural2-B', 'en-IN-Neural2-C'],
  'en-GB': ['en-GB-Journey-D', 'en-GB-Journey-F', 'en-GB-Neural2-A', 'en-GB-Neural2-B'],
  'es-ES': ['es-ES-Journey-D', 'es-ES-Journey-F', 'es-ES-Neural2-A'],
  'fr-FR': ['fr-FR-Journey-D', 'fr-FR-Journey-F', 'fr-FR-Neural2-A'],
  'de-DE': ['de-DE-Journey-D', 'de-DE-Journey-F', 'de-DE-Neural2-A'],
  'ja-JP': ['ja-JP-Neural2-B', 'ja-JP-Neural2-C', 'ja-JP-Neural2-D'],
  'ko-KR': ['ko-KR-Neural2-A', 'ko-KR-Neural2-B', 'ko-KR-Neural2-C'],
};

/**
 * Valid Chirp Gemini voices
 */
const CHIRP_GEMINI_VOICES = [
  'Aoede', 'Ariel', 'Charon', 'Fenrir', 'Kore', 'Puck', 'Titan'
];

/**
 * Audio Generator tool that creates audio from text using a FastAPI backend service.
 * Supports both standard Google TTS and Chirp Gemini voices.
 */
export class AudioGeneratorTool extends BaseTool<AudioGeneratorParams, ToolResult> {
  static readonly Name: string = 'generate_audio';
  private backendUrl: string;
  private backendApiKey: string;

  constructor(private readonly config?: Config) {
    super(
      AudioGeneratorTool.Name,
      'Audio Generator',
      'Generates audio from text using Google Text-to-Speech or Chirp Gemini. Provide text to convert to speech. Optionally specify language code, voice name, conversation ID, and method (standard or Chirp_gemini).',
      {
        type: 'object',
        properties: {
          text: {
            type: 'string',
            description: 'The text to convert to speech. Maximum 6000 characters.',
          },
          language_code: {
            type: 'string',
            description: 'Language code for standard TTS (e.g., en-US, en-IN, es-ES). Defaults to en-IN',
            default: 'en-IN',
          },
          voice_name: {
            type: 'string',
            description: 'Voice name. For standard method: depends on language_code. For Chirp_gemini: Aoede, Ariel, Charon, Fenrir, Kore, Puck, or Titan. Defaults to en-IN-Chirp-HD-D',
            default: 'en-IN-Chirp-HD-D',
          },
          conversation_id: {
            type: 'string',
            description: 'Optional conversation ID to associate with the audio generation',
          },
          method: {
            type: 'string',
            enum: ['standard', 'Chirp_gemini'],
            description: 'Audio generation method. "standard" uses Google TTS, "Chirp_gemini" uses advanced Chirp voices. Defaults to standard',
            default: 'standard',
          },
        },
        required: ['text'],
      },
    );
    
    // Get backend configuration from environment or config
    this.backendUrl = process.env.BACKEND_URL || config?.getBackendUrl() || '';
    this.backendApiKey = process.env.BACKEND_API_KEY || config?.getBackendApiKey() || '';
    
    if (!this.backendUrl || !this.backendApiKey) {
      console.warn('[AudioGeneratorTool] Backend URL or API key not configured. Set BACKEND_URL and BACKEND_API_KEY environment variables.');
    }
  }

  validateToolParams(params: AudioGeneratorParams): string | null {
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
      return 'Parameters failed schema validation. Ensure text is a non-empty string.';
    }

    if (!params.text || params.text.trim() === '') {
      return 'The text parameter cannot be empty.';
    }

    if (params.text.length > 6000) {
      return 'The text is too long. Please keep it under 6000 characters.';
    }

    const method = params.method || 'standard';
    if (!['standard', 'Chirp_gemini'].includes(method)) {
      return 'Invalid method. Must be either "standard" or "Chirp_gemini".';
    }

    if (method === 'Chirp_gemini') {
      const voiceName = params.voice_name || 'Aoede';
      if (!CHIRP_GEMINI_VOICES.includes(voiceName)) {
        return `Invalid Chirp_gemini voice "${voiceName}". Must be one of: ${CHIRP_GEMINI_VOICES.join(', ')}`;
      }
    } else {
      // Standard method validation
      const languageCode = params.language_code || 'en-IN';
      if (!(languageCode in VALID_VOICES)) {
        return `Invalid language code "${languageCode}". Must be one of: ${Object.keys(VALID_VOICES).join(', ')}`;
      }

      const voiceName = params.voice_name || 'en-IN-Chirp-HD-D';
      if (!VALID_VOICES[languageCode].includes(voiceName)) {
        return `Invalid voice name "${voiceName}" for language ${languageCode}. Must be one of: ${VALID_VOICES[languageCode].join(', ')}`;
      }
    }

    return null;
  }

  getDescription(params: AudioGeneratorParams): string {
    const method = params.method || 'standard';
    const text = params.text.length > 50 ? `${params.text.substring(0, 50)}...` : params.text;
    
    if (method === 'Chirp_gemini') {
      const voiceName = params.voice_name || 'Aoede';
      return `Generating audio using Chirp_gemini: "${text}" (voice: ${voiceName})`;
    } else {
      const languageCode = params.language_code || 'en-IN';
      const voiceName = params.voice_name || 'en-IN-Chirp-HD-D';
      return `Generating audio using standard TTS: "${text}" (${languageCode}, ${voiceName})`;
    }
  }

  async execute(params: AudioGeneratorParams, signal: AbortSignal): Promise<ToolResult> {
    const validationError = this.validateToolParams(params);
    if (validationError) {
      return {
        llmContent: JSON.stringify({ success: false, error: validationError }),
        returnDisplay: `Error: ${validationError}`,
      };
    }

    const { 
      text, 
      language_code = 'en-IN', 
      voice_name = 'en-IN-Chirp-HD-D',
      conversation_id,
      method = 'standard'
    } = params;

    try {
      // Check if operation was cancelled
      if (signal.aborted) {
        throw new Error('Audio generation was cancelled');
      }

      console.log(`[AudioGeneratorTool] Starting audio generation for text: "${text.substring(0, 50)}..."`);
      
      const response = await fetch(`${this.backendUrl}/generate_audio`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'BACKEND-API-KEY': this.backendApiKey,
        },
        body: JSON.stringify({
          text,
          language_code,
          voice_name,
          conversation_id,
          method,
        }),
        signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to generate audio: ${response.status} ${errorText}`);
      }

      const result = await response.json();
      
      if (result.status === 'success') {
        const successMessage = `Successfully generated audio using ${method === 'Chirp_gemini' ? 'Chirp Gemini' : 'Google TTS'}`;
        
        return {
          llmContent: JSON.stringify({
            success: true,
            text,
            language_code,
            voice_name,
            conversation_id: result.conversation_id,
            method,
            gcs_file_path: result.gcs_file_path,
            message: successMessage,
          }),
          returnDisplay: `✅ ${successMessage}\n\n🗣️ Text: ${text}\n${method === 'Chirp_gemini' ? `🎭 Voice: ${voice_name}` : `🌍 Language: ${language_code}\n🎭 Voice: ${voice_name}`}\n🔗 Audio File: ${result.gcs_file_path}${result.conversation_id ? `\n💾 Conversation ID: ${result.conversation_id}` : ''}`,
        };
      } else {
        const errorMessage = result.error || 'Audio generation failed with unknown error';
        throw new Error(errorMessage);
      }
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[AudioGeneratorTool] Error generating audio:`, errorMessage);
      
      return {
        llmContent: JSON.stringify({
          success: false,
          error: `Audio generation failed: ${errorMessage}`,
        }),
        returnDisplay: `❌ Error generating audio: ${errorMessage}`,
      };
    }
  }
}