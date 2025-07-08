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
  file_path: string;
  language_code?: string;
  enable_automatic_punctuation?: boolean;
  enable_speaker_diarization?: boolean;
  diarization_speaker_count?: number;
  enable_word_time_offsets?: boolean;
}

/**
 * Parameters for uploading and transcribing audio data.
 */
export interface TranscribeAudioDataParams {
  audio_data: string; // base64 encoded audio data
  language_code?: string;
  enable_automatic_punctuation?: boolean;
  enable_speaker_diarization?: boolean;
  diarization_speaker_count?: number;
  enable_word_time_offsets?: boolean;
}

/**
 * Parameters for listing supported languages.
 */
export interface ListLanguagesParams {
  // No parameters needed
}

/**
 * Union type for all transcription operation parameters.
 */
export type TranscriptionParams =
  | TranscribeAudioParams
  | TranscribeAudioDataParams
  | ListLanguagesParams;

/**
 * Transcription tool that converts audio to text using a FastAPI backend service.
 * Integrates with existing MediaLoop.AI transcription infrastructure.
 */
export class TranscriptionTool extends BaseTool<
  TranscriptionParams,
  ToolResult
> {
  static readonly Name: string = 'transcription';
  private backendUrl: string;
  private backendApiKey: string;

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
      'Transcribes audio files or audio data to text using Google Speech-to-Text. Supports multiple languages, speaker diarization, and various transcription features. Use "transcribe_audio" for files, "transcribe_audio_data" for base64 data, or "list_supported_languages" to see available languages.',
      {
        type: 'object',
        properties: {
          operation: {
            type: 'string',
            enum: [
              'transcribe_audio',
              'transcribe_audio_data',
              'list_supported_languages',
            ],
            description: 'The transcription operation to perform',
          },
          file_path: {
            type: 'string',
            description:
              'Path to the audio file to transcribe (required for transcribe_audio)',
          },
          audio_data: {
            type: 'string',
            description:
              'Base64 encoded audio data (required for transcribe_audio_data)',
          },
          language_code: {
            type: 'string',
            enum: TranscriptionTool.SUPPORTED_LANGUAGES,
            description:
              'Language code for transcription (e.g., en-US, es-ES). Defaults to en-US',
            default: 'en-US',
          },
          enable_automatic_punctuation: {
            type: 'boolean',
            description:
              'Enable automatic punctuation in transcription results. Defaults to true',
            default: true,
          },
          enable_speaker_diarization: {
            type: 'boolean',
            description:
              'Enable speaker diarization to identify different speakers. Defaults to false',
            default: false,
          },
          diarization_speaker_count: {
            type: 'number',
            minimum: 2,
            maximum: 10,
            description:
              'Number of speakers for diarization (2-10). Only used if speaker diarization is enabled',
          },
          enable_word_time_offsets: {
            type: 'boolean',
            description:
              'Enable word-level time offsets in transcription results. Defaults to false',
            default: false,
          },
        },
        required: ['operation'],
      },
    );

    // Get backend configuration from environment or config
    this.backendUrl = process.env.BACKEND_URL || config?.getBackendUrl() || '';
    this.backendApiKey =
      process.env.BACKEND_API_KEY || config?.getBackendApiKey() || '';

    if (!this.backendUrl || !this.backendApiKey) {
      console.warn(
        '[TranscriptionTool] Backend URL or API key not configured. Set BACKEND_URL and BACKEND_API_KEY environment variables.',
      );
    }
  }

  validateParams(params: any): string | null {
    if (!this.backendUrl || !this.backendApiKey) {
      return 'Backend URL or API key not configured. Please set BACKEND_URL and BACKEND_API_KEY environment variables.';
    }

    if (!params || typeof params !== 'object') {
      return 'Parameters must be an object';
    }

    const { operation } = params;
    if (!operation || typeof operation !== 'string') {
      return 'Operation must be specified as a string';
    }

    switch (operation) {
      case 'transcribe_audio':
        if (!params.file_path || typeof params.file_path !== 'string') {
          return 'For transcribe_audio operation, file_path must be a non-empty string';
        }
        break;
      case 'transcribe_audio_data':
        if (!params.audio_data || typeof params.audio_data !== 'string') {
          return 'For transcribe_audio_data operation, audio_data must be a non-empty string';
        }
        break;
      case 'list_supported_languages':
        // No additional validation needed
        break;
      default:
        return `Unsupported operation: ${operation}. Supported operations are: transcribe_audio, transcribe_audio_data, list_supported_languages`;
    }

    if (
      params.language_code &&
      !TranscriptionTool.SUPPORTED_LANGUAGES.includes(params.language_code)
    ) {
      return `Unsupported language: ${params.language_code}. Supported languages: ${TranscriptionTool.SUPPORTED_LANGUAGES.join(', ')}`;
    }

    if (
      params.diarization_speaker_count &&
      (params.diarization_speaker_count < 2 ||
        params.diarization_speaker_count > 10)
    ) {
      return 'diarization_speaker_count must be between 2 and 10.';
    }

    return null;
  }

  getDescription(params: any): string {
    const { operation } = params;
    switch (operation) {
      case 'transcribe_audio':
        return `Transcribing audio file: ${params.file_path}`;
      case 'transcribe_audio_data':
        return 'Transcribing provided audio data';
      case 'list_supported_languages':
        return 'Listing supported transcription languages';
      default:
        return `Performing transcription operation: ${operation}`;
    }
  }

  async execute(params: any, signal: AbortSignal): Promise<ToolResult> {
    const validationError = this.validateParams(params);
    if (validationError) {
      return {
        llmContent: JSON.stringify({ success: false, error: validationError }),
        returnDisplay: `Error: ${validationError}`,
      };
    }

    const { operation } = params;

    try {
      if (signal.aborted) {
        throw new Error('Transcription operation was cancelled');
      }

      let result: any;
      let message: string;

      switch (operation) {
        case 'transcribe_audio':
          result = await this.transcribeAudioFile(params, signal);
          message = `Audio file transcribed successfully: ${params.file_path}`;
          break;
        case 'transcribe_audio_data':
          result = await this.transcribeAudioData(params, signal);
          message = 'Audio data transcribed successfully';
          break;
        case 'list_supported_languages':
          result = this.listSupportedLanguages();
          message = 'Retrieved list of supported languages';
          break;
        default:
          throw new Error(`Unsupported operation: ${operation}`);
      }

      return {
        llmContent: JSON.stringify({
          success: true,
          operation,
          result,
          message,
        }),
        returnDisplay: this.formatOutput(result, operation, params),
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(
        `[TranscriptionTool] Error executing ${operation}:`,
        errorMessage,
      );
      return {
        llmContent: JSON.stringify({
          success: false,
          error: `Transcription operation failed: ${errorMessage}`,
        }),
        returnDisplay: `❌ Error: Transcription operation failed: ${errorMessage}`,
      };
    }
  }

  private async transcribeAudioFile(
    params: TranscribeAudioParams,
    signal: AbortSignal,
  ): Promise<any> {
    const {
      file_path,
      language_code = 'en-US',
      enable_automatic_punctuation = true,
      enable_speaker_diarization = false,
      diarization_speaker_count,
      enable_word_time_offsets = false,
    } = params;

    console.log(
      `[TranscriptionTool] Starting transcription for file: "${file_path}"`,
    );

    // Step 1: Create transcription session
    const sessionId = await this.createTranscriptionSession({
      audio_file_path: file_path,
      language_code,
      enable_automatic_punctuation,
      enable_speaker_diarization,
      diarization_speaker_count,
      enable_word_time_offsets,
    });

    console.log(
      `[TranscriptionTool] Transcription session created: ${sessionId}`,
    );

    // Step 2: Start transcription
    await this.startTranscription(sessionId);

    // Step 3: Poll for completion
    const result = await this.pollForTranscriptionCompletion(sessionId, signal);

    if (result.success && result.transcript_text) {
      const successMessage = `Successfully transcribed audio file: ${file_path}`;

      return {
        session_id: sessionId,
        status: result.status,
        transcript_text: result.transcript_text,
        gcs_transcript_path: result.gcs_transcript_path,
        language_code,
        file_path,
        message: successMessage,
      };
    } else {
      const errorMessage =
        result.error || 'Transcription failed with unknown error';
      throw new Error(errorMessage);
    }
  }

  private async transcribeAudioData(
    params: TranscribeAudioDataParams,
    signal: AbortSignal,
  ): Promise<any> {
    const {
      audio_data,
      language_code = 'en-US',
      enable_automatic_punctuation = true,
      enable_speaker_diarization = false,
      diarization_speaker_count,
      enable_word_time_offsets = false,
    } = params;

    // Basic validation of base64 data
    if (!audio_data.match(/^[A-Za-z0-9+/=]+$/)) {
      throw new Error('Invalid base64 audio data format');
    }

    console.log(
      `[TranscriptionTool] Starting transcription for uploaded audio data`,
    );

    // Step 1: Create transcription session with audio data upload
    const sessionId = await this.createTranscriptionSessionWithUpload({
      audio_data,
      language_code,
      enable_automatic_punctuation,
      enable_speaker_diarization,
      diarization_speaker_count,
      enable_word_time_offsets,
    });

    console.log(
      `[TranscriptionTool] Transcription session created: ${sessionId}`,
    );

    // Step 2: Start transcription
    await this.startTranscription(sessionId);

    // Step 3: Poll for completion
    const result = await this.pollForTranscriptionCompletion(sessionId, signal);

    if (result.success && result.transcript_text) {
      const successMessage = `Successfully transcribed uploaded audio data`;

      return {
        session_id: sessionId,
        status: result.status,
        transcript_text: result.transcript_text,
        gcs_transcript_path: result.gcs_transcript_path,
        language_code,
        message: successMessage,
      };
    } else {
      const errorMessage =
        result.error || 'Transcription failed with unknown error';
      throw new Error(errorMessage);
    }
  }

  private listSupportedLanguages(): any {
    return {
      languages: TranscriptionTool.SUPPORTED_LANGUAGES,
      count: TranscriptionTool.SUPPORTED_LANGUAGES.length,
      note: 'Language codes in format like en-US, es-ES, etc.',
    };
  }

  /**
   * Create a transcription session by calling the FastAPI service.
   */
  private async createTranscriptionSession(params: {
    audio_file_path: string;
    language_code: string;
    enable_automatic_punctuation: boolean;
    enable_speaker_diarization: boolean;
    diarization_speaker_count?: number;
    enable_word_time_offsets: boolean;
  }): Promise<string> {
    const response = await fetch(`${this.backendUrl}/transcription/sessions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'BACKEND-API-KEY': this.backendApiKey,
      },
      body: new URLSearchParams({
        audio_file_path: params.audio_file_path,
        language_code: params.language_code,
        enable_automatic_punctuation:
          params.enable_automatic_punctuation.toString(),
        enable_speaker_diarization:
          params.enable_speaker_diarization.toString(),
        enable_word_time_offsets: params.enable_word_time_offsets.toString(),
        store_type: 'mongodb',
        ...(params.diarization_speaker_count && {
          diarization_speaker_count:
            params.diarization_speaker_count.toString(),
        }),
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Failed to create transcription session: ${response.status} ${errorText}`,
      );
    }

    const result = await response.json();
    if (!result.session_id) {
      throw new Error('No session ID returned from transcription service');
    }

    return result.session_id;
  }

  /**
   * Create a transcription session with file upload by calling the FastAPI service.
   */
  private async createTranscriptionSessionWithUpload(params: {
    audio_data: string;
    language_code: string;
    enable_automatic_punctuation: boolean;
    enable_speaker_diarization: boolean;
    diarization_speaker_count?: number;
    enable_word_time_offsets: boolean;
  }): Promise<string> {
    // Convert base64 to blob for upload
    const audioBlob = new Blob([Buffer.from(params.audio_data, 'base64')], {
      type: 'audio/wav',
    });

    const formData = new FormData();
    formData.append('audio_file', audioBlob, 'uploaded_audio.wav');
    formData.append('language_code', params.language_code);
    formData.append(
      'enable_automatic_punctuation',
      params.enable_automatic_punctuation.toString(),
    );
    formData.append(
      'enable_speaker_diarization',
      params.enable_speaker_diarization.toString(),
    );
    formData.append(
      'enable_word_time_offsets',
      params.enable_word_time_offsets.toString(),
    );
    formData.append('store_type', 'mongodb');

    if (params.diarization_speaker_count) {
      formData.append(
        'diarization_speaker_count',
        params.diarization_speaker_count.toString(),
      );
    }

    const response = await fetch(`${this.backendUrl}/transcription/sessions`, {
      method: 'POST',
      headers: {
        'BACKEND-API-KEY': this.backendApiKey,
      },
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Failed to create transcription session with upload: ${response.status} ${errorText}`,
      );
    }

    const result = await response.json();
    if (!result.session_id) {
      throw new Error('No session ID returned from transcription service');
    }

    return result.session_id;
  }

  /**
   * Start transcription for a session.
   */
  private async startTranscription(sessionId: string): Promise<void> {
    const response = await fetch(
      `${this.backendUrl}/transcription/sessions/${sessionId}/transcribe`,
      {
        method: 'POST',
        headers: {
          'BACKEND-API-KEY': this.backendApiKey,
        },
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Failed to start transcription: ${response.status} ${errorText}`,
      );
    }
  }

  /**
   * Poll for transcription completion.
   */
  private async pollForTranscriptionCompletion(
    sessionId: string,
    signal: AbortSignal,
  ): Promise<{
    success: boolean;
    transcript_text?: string;
    gcs_transcript_path?: string;
    status?: string;
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
          `${this.backendUrl}/transcription/sessions/${sessionId}`,
          {
            headers: {
              'BACKEND-API-KEY': this.backendApiKey,
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
          `[TranscriptionTool] Session ${sessionId} status: ${status.stage} - ${status.status}`,
        );

        if (status.stage === 'completed' && status.status === 'success') {
          return {
            success: true,
            transcript_text: status.transcript_text,
            gcs_transcript_path: status.gcs_transcript_path,
            status: status.status,
          };
        } else if (status.stage === 'error' || status.status === 'failed') {
          return {
            success: false,
            error: status.error || 'Transcription failed',
          };
        }

        // Still processing, wait before next poll
        await new Promise((resolve) => setTimeout(resolve, pollInterval));
      } catch (error) {
        console.error(
          `[TranscriptionTool] Error polling session ${sessionId}:`,
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

  private formatOutput(result: any, operation: string, params: any): string {
    switch (operation) {
      case 'transcribe_audio':
      case 'transcribe_audio_data':
        const transcriptText = result.transcript_text;
        const languageCode =
          result.language_code || params.language_code || 'en-US';
        const source = result.file_path || 'uploaded audio';
        const sessionId = result.session_id;
        const gcsPath = result.gcs_transcript_path;

        return `✅ Transcription completed:\n\n"${transcriptText}"\n\n🗣️ Language: ${languageCode}\n📁 Source: ${source}\n🆔 Session ID: ${sessionId}${gcsPath ? `\n💾 GCS Path: ${gcsPath}` : ''}`;
      case 'list_supported_languages':
        return `📋 Supported Languages (${result.count}):\n\n${result.languages.join(', ')}\n\n💡 ${result.note}`;
      default:
        return JSON.stringify(result, null, 2);
    }
  }
}
