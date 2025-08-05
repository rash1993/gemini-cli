/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { BaseTool, ToolResult } from './tools.js';
import { SchemaValidator } from '../utils/schemaValidator.js';
import { Config } from '../config/config.js';
import voicesData from '../data/voices.json' with { type: 'json' };

/**
 * Parameters for the AudioGeneratorTool.
 */
export interface AudioGeneratorParams {
  text: string;
  voice_id: string;
  language?: string;
  instructions?: string;
  conversation_id?: string;
}

/**
 * Valid voice IDs from the unified audio API (loaded from JSON)
 */
const VALID_VOICE_IDS = voicesData.voices.map((voice: any) => voice.id);

/**
 * Supported languages (loaded from JSON)
 */
const SUPPORTED_LANGUAGES = voicesData.summary.languages_supported;

/**
 * Map short language codes to full language codes
 */
function mapLanguageCode(language: string): string {
  // Map common short codes to full codes
  const languageMap: Record<string, string> = {
    'en': 'en-US',
    'es': 'es-US', 
    'fr': 'fr-FR',
    'de': 'de-DE',
    'it': 'it-IT',
    'pt': 'pt-BR',
    'ja': 'ja-JP',
    'ko': 'ko-KR',
    'hi': 'hi-IN',
    'ar': 'ar-EG',
    'ru': 'ru-RU',
    'th': 'th-TH',
    'vi': 'vi-VN',
    'tr': 'tr-TR',
    'nl': 'nl-NL',
    'pl': 'pl-PL',
    'cs': 'cs-CZ',
    'el': 'el-GR',
    'ro': 'ro-RO',
    'uk': 'uk-UA',
    'id': 'id-ID',
    'bn': 'bn-BD',
    'mr': 'mr-IN',
    'ta': 'ta-IN',
    'te': 'te-IN'
  };
  
  // If it's already a full code, return as is
  if (language.includes('-')) {
    return language;
  }
  
  // Map short code to full code, default to en-US
  return languageMap[language] || 'en-US';
}

/**
 * Audio Generator tool that creates audio from text using a FastAPI backend service.
 * Supports both standard Google TTS and Chirp Gemini voices.
 */
export class AudioGeneratorTool extends BaseTool<
  AudioGeneratorParams,
  ToolResult
> {
  static readonly Name: string = 'generate_audio';
  private backendUrl: string;
  private backendApiKey: string;

  constructor(private readonly config?: Config) {
    super(
      AudioGeneratorTool.Name,
      'Audio Generator',
'Generates audio from text using the unified audio service with ElevenLabs and Google Gemini providers. Provide text and voice_id to convert to speech.',
      {
        type: 'object',
        properties: {
          text: {
            type: 'string',
            description:
              'The text to convert to speech. Maximum 6000 characters.',
          },
          voice_id: {
            type: 'string',
            description:
              'Voice ID from the unified audio service (e.g., 9BWtsMINqrJLrRacOk9x for ElevenLabs, gemini_zephyr for Gemini)',
          },
          language: {
            type: 'string',
            description:
              'Language code (e.g., en-US, es-US, de-DE, hi-IN). Short codes like "en" are automatically mapped to "en-US". Defaults to en-US',
            default: 'en-US',
          },
          instructions: {
            type: 'string',
            description:
              'Optional instructions for voice tone and style (only supported by Gemini voices with IDs starting with "gemini_")',
          },
          conversation_id: {
            type: 'string',
            description:
              'Optional conversation ID to associate with the audio generation',
          },
        },
        required: ['text', 'voice_id'],
      },
    );

    // Get backend configuration from environment or config
    this.backendUrl = process.env.BACKEND_URL || config?.getBackendUrl() || '';
    this.backendApiKey =
      process.env.BACKEND_API_KEY || config?.getBackendApiKey() || '';

    if (!this.backendUrl || !this.backendApiKey) {
      console.warn(
        '[AudioGeneratorTool] Backend URL or API key not configured. Set BACKEND_URL and BACKEND_API_KEY environment variables.',
      );
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
      return 'Parameters failed schema validation. Ensure text and voice_id are provided.';
    }

    if (!params.text || params.text.trim() === '') {
      return 'The text parameter cannot be empty.';
    }

    if (params.text.length > 6000) {
      return 'The text is too long. Please keep it under 6000 characters.';
    }

    if (!params.voice_id) {
      return 'The voice_id parameter is required.';
    }

    if (!VALID_VOICE_IDS.includes(params.voice_id)) {
      return `Invalid voice_id "${params.voice_id}". Must be a valid voice ID from the unified audio service.`;
    }

    // Map language code and validate
    const mappedLanguage = mapLanguageCode(params.language || 'en');
    if (!SUPPORTED_LANGUAGES.includes(mappedLanguage)) {
      return `Invalid language "${params.language}" (mapped to "${mappedLanguage}"). Must be one of: ${SUPPORTED_LANGUAGES.join(', ')}`;
    }

    // Instructions are only supported for Gemini voices
    if (params.instructions && !params.voice_id.startsWith('gemini_')) {
      return 'Instructions parameter is only supported for Google Gemini voices (voice_id starting with "gemini_")';
    }

    return null;
  }

  getDescription(params: AudioGeneratorParams): string {
    const text =
      params.text.length > 50
        ? `${params.text.substring(0, 50)}...`
        : params.text;

    const provider = params.voice_id.startsWith('gemini_') ? 'Google Gemini' : 'ElevenLabs';
    const language = mapLanguageCode(params.language || 'en');
    
    let description = `Generating audio using ${provider}: "${text}" (voice: ${params.voice_id}, language: ${language})`;
    
    if (params.instructions) {
      description += ` with instructions: "${params.instructions}"`;
    }
    
    return description;
  }

  async execute(
    params: AudioGeneratorParams,
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
      text,
      voice_id,
      language = 'en-US',
      instructions,
      conversation_id,
    } = params;
    
    // Map language code to full format
    const mappedLanguage = mapLanguageCode(language);

    try {
      // Check if operation was cancelled
      if (signal.aborted) {
        throw new Error('Audio generation was cancelled');
      }

      console.log(
        `[AudioGeneratorTool] Starting audio generation for text: "${text.substring(0, 50)}..." with voice: ${voice_id}`,
      );

      // Call the unified endpoint directly (no polling needed)
      const response = await fetch(`${this.backendUrl}/generate_audio/unified`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'BACKEND-API-KEY': this.backendApiKey,
        },
        body: JSON.stringify({
          text,
          voice_id,
          language: mappedLanguage,
          instructions,
          conversation_id,
        }),
        signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Failed to generate audio: ${response.status} ${errorText}`,
        );
      }

      const result = await response.json();
      
      if (result.status !== 'success') {
        throw new Error(result.detail || 'Audio generation failed');
      }

      const provider = voice_id.startsWith('gemini_') ? 'Google Gemini' : 'ElevenLabs';
      const successMessage = `Successfully generated audio using ${provider}`;

      return {
        llmContent: JSON.stringify({
          success: true,
          text,
          voice_id,
          language: mappedLanguage,
          instructions,
          conversation_id: result.conversation_id,
          audio_url: result.gcs_file_path,
          duration_seconds: result.duration_seconds,
          provider: result.provider,
          voice_name: result.voice_name,
          message: successMessage,
        }),
        returnDisplay: `✅ ${successMessage}\n\n🗣️ Text: ${text}\n🎭 Voice: ${result.voice_name} (${voice_id})\n🌍 Language: ${mappedLanguage}${instructions ? `\n📝 Instructions: ${instructions}` : ''}\n⏱️ Duration: ${result.duration_seconds?.toFixed(1)}s\n\n<audio controls style="width: 100%; margin: 10px 0;">\n  <source src="${result.gcs_file_path}" type="audio/mpeg">\n  Your browser does not support the audio element.\n</audio>\n\n🔗 [Download Audio File](${result.gcs_file_path})${result.conversation_id ? `\n💾 Conversation ID: ${result.conversation_id}` : ''}`,
      };

    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(
        `[AudioGeneratorTool] Error generating audio:`,
        errorMessage,
      );

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
