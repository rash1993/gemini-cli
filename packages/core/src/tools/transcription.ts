/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { BaseTool, ToolResult } from './tools.js';
import { SchemaValidator } from '../utils/schemaValidator.js';
import { Config } from '../config/config.js';

/**
 * Parameters for transcribing audio files.
 */
export interface TranscribeAudioParams {
  audio_file: string;
  language?: string;
  enable_punctuation?: boolean;
  enable_word_timing?: boolean;
  enable_diarization?: boolean;
  speaker_count?: number;
}

/**
 * Transcription tool that converts audio to text using the unified AI service.
 * Uses Google Speech-to-Text V2 for high-quality transcription with word-level timing.
 */
export class TranscriptionTool extends BaseTool<
  TranscribeAudioParams,
  ToolResult
> {
  static readonly Name: string = 'transcription';
  private apiUrl: string = 'http://35.238.235.218';
  private apiKey: string = 'videoagent@backend1qaz0okm';

  private static readonly SUPPORTED_LANGUAGES = [
    'en-US',
    'es-ES',
    'fr-FR',
    'de-DE',
    'it-IT',
    'pt-BR',
    'ru-RU',
    'ja-JP',
    'ko-KR',
    'zh-CN',
    'ar-SA',
    'hi-IN',
  ];

  constructor(private readonly config?: Config) {
    super(
      TranscriptionTool.Name,
      'Audio Transcription',
      'Transcribes audio files or URLs to text using Google Speech-to-Text V2. ' +
      'Supports multiple languages, speaker diarization, and word-level timing data. ' +
      'Accepts audio files as URLs (https:// or gs://) or local file paths. ' +
      'Word timing data provides precise timestamps for each word, essential for subtitle generation and audio synchronization. ' +
      'Maximum duration: 480 minutes. Supported formats: MP3, WAV, FLAC, M4A, OGG.',
      {
        type: 'object',
        properties: {
          audio_file: {
            type: 'string',
            description:
              'Path or URL to the audio file. Accepts: ' +
              '1) Public URLs (https://example.com/audio.mp3), ' +
              '2) Google Cloud Storage paths (gs://bucket/audio.wav), ' +
              '3) Local file paths for upload',
          },
          language: {
            type: 'string',
            enum: TranscriptionTool.SUPPORTED_LANGUAGES,
            description:
              'Language code for transcription (e.g., en-US, es-ES). Defaults to en-US',
            default: 'en-US',
          },
          enable_punctuation: {
            type: 'boolean',
            description:
              'Enable automatic punctuation in transcription results. Defaults to true',
            default: true,
          },
          enable_word_timing: {
            type: 'boolean',
            description:
              'Enable word-level timestamps. Provides start/end times for each word. ' +
              'Essential for subtitles, captions, and audio synchronization. Defaults to true',
            default: true,
          },
          enable_diarization: {
            type: 'boolean',
            description:
              'Enable speaker diarization to identify different speakers. Defaults to false',
            default: false,
          },
          speaker_count: {
            type: 'number',
            minimum: 2,
            maximum: 10,
            description:
              'Number of speakers for diarization (2-10). Only used if diarization is enabled',
          },
        },
        required: ['audio_file'],
      },
    );

    // Allow override from environment if needed
    this.apiUrl = process.env.UNIFIED_AI_URL || this.apiUrl;
    this.apiKey = process.env.UNIFIED_AI_KEY || this.apiKey;
  }

  validateParams(params: any): string | null {
    if (!this.apiUrl || !this.apiKey) {
      return 'API URL or key not configured.';
    }

    if (!params || typeof params !== 'object') {
      return 'Parameters must be an object';
    }

    if (!params.audio_file || typeof params.audio_file !== 'string') {
      return 'audio_file must be a non-empty string (URL or file path)';
    }

    if (
      params.language &&
      !TranscriptionTool.SUPPORTED_LANGUAGES.includes(params.language)
    ) {
      return `Unsupported language: ${params.language}. Supported languages: ${TranscriptionTool.SUPPORTED_LANGUAGES.join(', ')}`;
    }

    if (
      params.speaker_count &&
      (params.speaker_count < 2 || params.speaker_count > 10)
    ) {
      return 'speaker_count must be between 2 and 10.';
    }

    return null;
  }

  getDescription(params: any): string {
    const source = params.audio_file.substring(0, 50);
    const language = params.language || 'en-US';
    const features = [];
    
    if (params.enable_word_timing) features.push('word timing');
    if (params.enable_diarization) features.push('speaker diarization');
    if (params.enable_punctuation) features.push('punctuation');
    
    const featuresStr = features.length > 0 ? ` with ${features.join(', ')}` : '';
    return `Transcribing audio: ${source}... (${language}${featuresStr})`;
  }

  async execute(params: any, signal: AbortSignal): Promise<ToolResult> {
    const validationError = this.validateParams(params);
    if (validationError) {
      return {
        llmContent: JSON.stringify({ success: false, error: validationError }),
        returnDisplay: `Error: ${validationError}`,
      };
    }

    const {
      audio_file,
      language = 'en-US',
      enable_punctuation = true,
      enable_word_timing = true,
      enable_diarization = false,
      speaker_count,
    } = params;

    try {
      if (signal.aborted) {
        throw new Error('Transcription operation was cancelled');
      }

      console.log(
        `[TranscriptionTool] Starting transcription for: "${audio_file.substring(0, 50)}..."`,
      );

      // Step 1: Initiate transcription
      const taskId = await this.initiateTranscription({
        audio_file,
        language,
        enable_punctuation,
        enable_word_timing,
        enable_diarization,
        speaker_count,
      });

      console.log(
        `[TranscriptionTool] Transcription task created: ${taskId}`,
      );

      // Step 2: Poll for completion
      const result = await this.pollForCompletion(taskId, signal);

      if (result.success && result.transcript_text) {
        const successMessage = `Successfully transcribed audio`;

        const response: any = {
          success: true,
          task_id: taskId,
          transcript_text: result.transcript_text,
          transcript_url: result.transcript_url,
          language: result.language || language,
          word_count: result.word_count,
          duration_seconds: result.duration_seconds,
          message: successMessage,
        };

        // Add word timing URL if available
        if (result.word_timing_url) {
          response.word_timing_url = result.word_timing_url;
          response.word_timing_info = 'Word-level timestamps available for subtitle generation and synchronization';
        }

        // Format display output
        let displayOutput = `✅ ${successMessage}\n\n`;
        displayOutput += `📝 Transcript:\n"${result.transcript_text}"\n\n`;
        displayOutput += `🗣️ Language: ${result.language || language}\n`;
        displayOutput += `📊 Word Count: ${result.word_count || 'N/A'}\n`;
        displayOutput += `⏱️ Duration: ${result.duration_seconds ? `${result.duration_seconds}s` : 'N/A'}\n`;
        
        if (result.transcript_url) {
          displayOutput += `\n📄 Full Transcript: ${result.transcript_url}`;
        }
        
        if (result.word_timing_url) {
          displayOutput += `\n⏰ Word Timing Data: ${result.word_timing_url}`;
          displayOutput += `\n💡 Word timing data includes start/end timestamps for each word`;
        }
        
        displayOutput += `\n\n💾 Task ID: ${taskId}`;

        return {
          llmContent: JSON.stringify(response),
          returnDisplay: displayOutput,
        };
      } else {
        const errorMessage =
          result.error || 'Transcription failed with unknown error';
        throw new Error(errorMessage);
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(
        `[TranscriptionTool] Error during transcription:`,
        errorMessage,
      );
      return {
        llmContent: JSON.stringify({
          success: false,
          error: `Transcription failed: ${errorMessage}`,
        }),
        returnDisplay: `❌ Error: Transcription failed: ${errorMessage}`,
      };
    }
  }

  /**
   * Initiate transcription by calling the unified AI service.
   */
  private async initiateTranscription(params: {
    audio_file: string;
    language: string;
    enable_punctuation: boolean;
    enable_word_timing: boolean;
    enable_diarization: boolean;
    speaker_count?: number;
  }): Promise<string> {
    const response = await fetch(`${this.apiUrl}/api/v1/transcription/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': this.apiKey,
      },
      body: JSON.stringify({
        audio_file: params.audio_file,
        language: params.language,
        enable_punctuation: params.enable_punctuation,
        enable_word_timing: params.enable_word_timing,
        enable_diarization: params.enable_diarization,
        speaker_count: params.speaker_count,
        provider: 'google_speech_v2',
        priority: 'normal',
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Failed to initiate transcription: ${response.status} ${errorText}`,
      );
    }

    const result = await response.json();
    if (!result.task_id) {
      throw new Error('No task ID returned from transcription service');
    }

    return result.task_id;
  }

  /**
   * Poll for transcription completion.
   */
  private async pollForCompletion(
    taskId: string,
    signal: AbortSignal,
  ): Promise<{
    success: boolean;
    transcript_text?: string;
    transcript_url?: string;
    word_timing_url?: string;
    language?: string;
    word_count?: number;
    duration_seconds?: number;
    error?: string;
  }> {
    const maxAttempts = 60; // 5 minutes with 5-second intervals
    const pollInterval = 5000; // 5 seconds

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (signal.aborted) {
        throw new Error('Transcription was cancelled');
      }

      try {
        const response = await fetch(
          `${this.apiUrl}/api/v1/transcription/task/${taskId}`,
          {
            headers: {
              'X-API-Key': this.apiKey,
            },
          },
        );

        if (!response.ok) {
          throw new Error(
            `Failed to check transcription status: ${response.status}`,
          );
        }

        const status = await response.json();

        console.log(
          `[TranscriptionTool] Task ${taskId} status: ${status.status}`,
        );

        if (status.status === 'completed') {
          return {
            success: true,
            transcript_text: status.transcript_text,
            transcript_url: status.transcript_url,
            word_timing_url: status.word_timing_url,
            language: status.language,
            word_count: status.word_count,
            duration_seconds: status.duration_seconds,
          };
        } else if (status.status === 'failed') {
          return {
            success: false,
            error: status.error || 'Transcription failed',
          };
        }

        // Still processing, wait before next poll
        await new Promise((resolve) => setTimeout(resolve, pollInterval));
      } catch (error) {
        console.error(
          `[TranscriptionTool] Error polling task ${taskId}:`,
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
      `Transcription timed out after ${(maxAttempts * pollInterval) / 1000} seconds`,
    );
  }
}