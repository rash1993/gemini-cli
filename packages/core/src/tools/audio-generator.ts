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
  voice: string;
  language?: string;
  instructions?: string;
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
 * Audio Generator tool that creates audio from text using the unified AI service.
 * Uses Gemini Chirp for high-quality text-to-speech synthesis.
 */
export class AudioGeneratorTool extends BaseTool<
  AudioGeneratorParams,
  ToolResult
> {
  static readonly Name: string = 'generate_audio';
  private apiUrl: string = 'http://35.238.235.218';
  private apiKey: string = 'videoagent@backend1qaz0okm';

  constructor(private readonly config?: Config) {
    super(
      AudioGeneratorTool.Name,
      'Audio Generator',
      'Generates high-quality audio from text using Gemini Chirp TTS with 30 professional voices ' +
      'supporting 20 languages. Features voice style instructions for controlling emotion, tone, and delivery ' +
      '(cheerful, calm, professional, dramatic, angry, sad, etc.). Includes 6 English-only voices optimized ' +
      'for specific use cases (narration, marketing, meditation, podcasts, business, kids content) and ' +
      '24 multilingual voices covering European, Asian, Middle Eastern, and Romance languages. ' +
      'Perfect for audiobooks, podcasts, presentations, educational content, and international applications.',
      {
        type: 'object',
        properties: {
          text: {
            type: 'string',
            description:
              'The text to convert to speech. Maximum 6000 characters.',
          },
          voice: {
            type: 'string',
            description:
              'Voice ID from Gemini Chirp (30 voices available). ' +
              'ENGLISH-ONLY (6): zephyr (male, smooth narration), aoede (female, expressive marketing), ' +
              'charon (male, calm meditation), fenrir (male, warm podcasts), kore (female, professional business), ' +
              'puck (male, energetic kids content). ' +
              'MULTILINGUAL (24): achernar (male, en/de/es/fr/it/pt), achird (female, en/de/es/fr/it/pt), ' +
              'algenib (male, en/es/fr/it/pt), algieba (female, en/de/es/fr/it), alnilam (male, en/es/fr/hi/ja), ' +
              'autonoe (female, en/de/es/fr), callirrhoe (female, en/es/fr/it), despina (female, en/es/fr/pt), ' +
              'enceladus (male, en/de/es/fr), erinome (female, en/es/fr/it), gacrux (male, en/de/es/fr), ' +
              'iapetus (male, en/es/fr/it), laomedeia (female, en/de/es/fr), leda (female, en/es/fr/it), ' +
              'orus (male, en/de/es/fr), pulcherrima (female, en/es/fr/it/pt), rasalgethi (male, en/ar/hi/ur), ' +
              'sadachbia (female, en/ar/fa/ur), sadaltager (male, en/de/nl/sv), schedar (female, en/ru/pl/uk), ' +
              'sulafat (female, en/es/pt/ca), umbriel (male, en/fr/it/ro), vindemiatrix (female, en/de/fr/it), ' +
              'zubenelgenubi (male, en/ja/ko/cmn)',
          },
          language: {
            type: 'string',
            description:
              'Language code for speech synthesis. Supported: en (English), es (Spanish), fr (French), ' +
              'de (German), it (Italian), pt (Portuguese), ja (Japanese), ko (Korean), cmn (Mandarin), ' +
              'ar (Arabic), hi (Hindi), ur (Urdu), fa (Farsi), ru (Russian), pl (Polish), uk (Ukrainian), ' +
              'nl (Dutch), sv (Swedish), ca (Catalan), ro (Romanian). Defaults to en. ' +
              'Note: Voice must support the selected language.',
            default: 'en',
          },
          instructions: {
            type: 'string',
            description:
              'Optional voice style instructions to modify delivery. Examples: ' +
              '"Speak cheerfully and enthusiastically", "Use a calm and soothing tone", ' +
              '"Sound professional and authoritative", "Speak slowly and clearly", ' +
              '"Add excitement and energy", "Use a dramatic storytelling voice", ' +
              '"Sound friendly and conversational", "Speak with empathy and warmth", ' +
              '"Deliver with anger/frustration", "Sound sad or melancholic". ' +
              'This allows fine control over emotion, pace, and tone of the generated speech.',
          },
        },
        required: ['text', 'voice'],
      },
    );

    // Allow override from environment if needed
    this.apiUrl = process.env.UNIFIED_AI_URL || this.apiUrl;
    this.apiKey = process.env.UNIFIED_AI_KEY || this.apiKey;
  }

  validateToolParams(params: AudioGeneratorParams): string | null {
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
      return 'Parameters failed schema validation. Ensure text and voice are provided.';
    }

    if (!params.text || params.text.trim() === '') {
      return 'The text parameter cannot be empty.';
    }

    if (params.text.length > 6000) {
      return 'The text is too long. Please keep it under 6000 characters.';
    }

    if (!params.voice) {
      return 'The voice parameter is required.';
    }

    if (!VALID_VOICE_IDS.includes(params.voice)) {
      return `Invalid voice "${params.voice}". Must be a valid voice ID from the Gemini Chirp service. Examples: zephyr, aoede, achernar`;
    }

    // Validate language
    const language = params.language || 'en';
    if (!SUPPORTED_LANGUAGES.includes(language)) {
      return `Invalid language "${language}". Must be one of: ${SUPPORTED_LANGUAGES.join(', ')}`;
    }

    // Check if voice supports the requested language
    const voice = voicesData.voices.find((v: any) => v.id === params.voice);
    if (voice && !voice.languages.includes(language)) {
      return `Voice "${params.voice}" does not support language "${language}". Supported languages for this voice: ${voice.languages.join(', ')}`;
    }

    return null;
  }

  getDescription(params: AudioGeneratorParams): string {
    const text =
      params.text.length > 50
        ? `${params.text.substring(0, 50)}...`
        : params.text;

    const voice = voicesData.voices.find((v: any) => v.id === params.voice);
    const voiceName = voice ? voice.name : params.voice;
    const language = params.language || 'en';
    const instructionsInfo = params.instructions 
      ? `, instructions: "${params.instructions.substring(0, 30)}${params.instructions.length > 30 ? '...' : ''}"`
      : '';
    
    return `Generating audio using Gemini Chirp: "${text}" (voice: ${voiceName}, language: ${language}${instructionsInfo})`;
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
      voice,
      language = 'en',
      instructions,
    } = params;

    try {
      // Check if operation was cancelled
      if (signal.aborted) {
        throw new Error('Audio generation was cancelled');
      }

      console.log(
        `[AudioGeneratorTool] Starting audio generation for text: "${text.substring(0, 50)}..." with voice: ${voice}`,
      );

      // Step 1: Initiate audio generation
      const taskId = await this.initiateAudioGeneration({
        text,
        voice,
        language,
        instructions,
      });

      console.log(`[AudioGeneratorTool] Audio generation task created: ${taskId}`);

      // Step 2: Poll for completion
      const result = await this.pollForCompletion(taskId, signal);

      if (result.success && result.audio_url) {
        const voiceInfo = voicesData.voices.find((v: any) => v.id === voice);
        const voiceName = voiceInfo ? voiceInfo.name : voice;
        const successMessage = `Successfully generated audio using Gemini Chirp`;

        return {
          llmContent: JSON.stringify({
            success: true,
            task_id: taskId,
            text,
            voice,
            voice_name: voiceName,
            language,
            ...(instructions && { instructions }),
            audio_url: result.audio_url,
            duration: result.duration,
            message: successMessage,
          }),
          returnDisplay: `✅ ${successMessage}\n\n🗣️ Text: ${text}\n🎭 Voice: ${voiceName} (${voice})\n🌍 Language: ${language}${instructions ? `\n🎯 Instructions: ${instructions}` : ''}\n⏱️ Duration: ${result.duration ? `${result.duration}s` : 'N/A'}\n\n<audio controls style="width: 100%; margin: 10px 0;">\n  <source src="${result.audio_url}" type="audio/wav">\n  Your browser does not support the audio element.\n</audio>\n\n🔗 [Download Audio File](${result.audio_url})\n💾 Task ID: ${taskId}`,
        };
      } else {
        const errorMessage = result.error || 'Audio generation failed with unknown error';
        throw new Error(errorMessage);
      }

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

  /**
   * Initiate audio generation by calling the unified AI service.
   */
  private async initiateAudioGeneration(params: {
    text: string;
    voice: string;
    language: string;
    instructions?: string;
  }): Promise<string> {
    const response = await fetch(`${this.apiUrl}/api/v1/audio/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': this.apiKey,
      },
      body: JSON.stringify({
        text: params.text,
        voice: params.voice,
        provider: 'gemini_chirp',
        language: params.language,
        ...(params.instructions && { instructions: params.instructions }),
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to initiate audio generation: ${response.status} ${errorText}`);
    }

    const result = await response.json();
    if (!result.task_id) {
      throw new Error('No task ID returned from audio generation service');
    }

    return result.task_id;
  }

  /**
   * Poll for audio generation completion.
   */
  private async pollForCompletion(taskId: string, signal: AbortSignal): Promise<{
    success: boolean;
    audio_url?: string;
    duration?: number;
    error?: string;
  }> {
    const maxAttempts = 150; // ~5 minutes with 2-second intervals
    const pollInterval = 2000; // 2 seconds

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (signal.aborted) {
        throw new Error('Audio generation was cancelled');
      }

      try {
        const response = await fetch(`${this.apiUrl}/api/v1/audio/task/${taskId}`, {
          headers: {
            'X-API-Key': this.apiKey,
          },
        });

        if (!response.ok) {
          throw new Error(`Failed to check status: ${response.status}`);
        }

        const status = await response.json();
        
        console.log(`[AudioGeneratorTool] Task ${taskId} status: ${status.status}`);

        if (status.status === 'completed') {
          return {
            success: true,
            audio_url: status.audio_url,
            duration: status.duration,
          };
        } else if (status.status === 'failed') {
          return {
            success: false,
            error: status.error || 'Audio generation failed',
          };
        }

        // Still processing, wait before next poll
        await new Promise(resolve => setTimeout(resolve, pollInterval));

      } catch (error) {
        console.error(`[AudioGeneratorTool] Error polling task ${taskId}:`, error);
        
        // On the last attempt, throw the error
        if (attempt === maxAttempts - 1) {
          throw error;
        }
        
        // Otherwise, wait and retry
        await new Promise(resolve => setTimeout(resolve, pollInterval));
      }
    }

    throw new Error(`Audio generation timed out after ${maxAttempts * pollInterval / 1000} seconds`);
  }
}