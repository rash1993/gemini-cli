/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { BaseTool, ToolResult } from './tools.js';
import { SchemaValidator } from '../utils/schemaValidator.js';
import { Config } from '../config/config.js';
import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * Parameters for transcribing audio files.
 */
export interface TranscribeAudioParams {
  file_path: string;
  language?: string;
  output_format?: string;
}

/**
 * Parameters for transcribing audio data.
 */
export interface TranscribeAudioDataParams {
  audio_data: string; // base64 encoded audio data
  language?: string;
  output_format?: string;
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
export type TranscriptionParams = TranscribeAudioParams | TranscribeAudioDataParams | ListLanguagesParams;

/**
 * Transcription tool that converts audio to text.
 * Supports multiple languages and output formats.
 */
export class TranscriptionTool extends BaseTool<TranscriptionParams, ToolResult> {
  static readonly Name: string = 'transcription';

  private static readonly SUPPORTED_LANGUAGES = [
    'en', 'es', 'fr', 'de', 'it', 'pt', 'ru', 'ja', 'ko', 'zh', 'ar', 'hi', 'auto'
  ];

  private static readonly SUPPORTED_FORMATS = ['text', 'json', 'srt', 'vtt'];
  private static readonly SUPPORTED_AUDIO_FORMATS = ['.mp3', '.wav', '.m4a', '.mp4', '.ogg', '.flac'];

  constructor(private readonly config?: Config) {
    super(
      TranscriptionTool.Name,
      'Audio Transcription',
      'Transcribes audio files or audio data to text. Supports multiple languages and output formats. Use "transcribe_audio" for files, "transcribe_audio_data" for base64 data, or "list_supported_languages" to see available languages.',
      {
        type: 'object',
        properties: {
          operation: {
            type: 'string',
            enum: ['transcribe_audio', 'transcribe_audio_data', 'list_supported_languages'],
            description: 'The transcription operation to perform',
          },
          file_path: {
            type: 'string',
            description: 'Path to the audio file to transcribe (required for transcribe_audio)',
          },
          audio_data: {
            type: 'string',
            description: 'Base64 encoded audio data (required for transcribe_audio_data)',
          },
          language: {
            type: 'string',
            enum: TranscriptionTool.SUPPORTED_LANGUAGES,
            description: 'Language code for transcription (auto for automatic detection)',
          },
          output_format: {
            type: 'string',
            enum: TranscriptionTool.SUPPORTED_FORMATS,
            description: 'Output format for transcription results',
          },
        },
        required: ['operation'],
      },
    );
  }

  validateParams(params: any): string | null {
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

    if (params.language && !TranscriptionTool.SUPPORTED_LANGUAGES.includes(params.language)) {
      return `Unsupported language: ${params.language}. Supported languages: ${TranscriptionTool.SUPPORTED_LANGUAGES.join(', ')}`;
    }

    if (params.output_format && !TranscriptionTool.SUPPORTED_FORMATS.includes(params.output_format)) {
      return `Unsupported output format: ${params.output_format}. Supported formats: ${TranscriptionTool.SUPPORTED_FORMATS.join(', ')}`;
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
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[TranscriptionTool] Error executing ${operation}:`, errorMessage);
      return {
        llmContent: JSON.stringify({
          success: false,
          error: `Transcription operation failed: ${errorMessage}`,
        }),
        returnDisplay: `❌ Error: Transcription operation failed: ${errorMessage}`,
      };
    }
  }

  private async transcribeAudioFile(params: TranscribeAudioParams, signal: AbortSignal): Promise<any> {
    const { file_path, language = 'auto', output_format = 'text' } = params;

    // Check if file exists
    try {
      await fs.access(file_path);
    } catch (error) {
      throw new Error(`Audio file not found: ${file_path}`);
    }

    // Check file extension
    const ext = path.extname(file_path).toLowerCase();
    if (!TranscriptionTool.SUPPORTED_AUDIO_FORMATS.includes(ext)) {
      throw new Error(`Unsupported audio format: ${ext}. Supported formats: ${TranscriptionTool.SUPPORTED_AUDIO_FORMATS.join(', ')}`);
    }

    // Mock transcription - in a real implementation, this would use a transcription service
    await this.simulateProcessing(signal);

    return this.generateMockTranscription(path.basename(file_path), language, output_format);
  }

  private async transcribeAudioData(params: TranscribeAudioDataParams, signal: AbortSignal): Promise<any> {
    const { audio_data, language = 'auto', output_format = 'text' } = params;

    // Basic validation of base64 data
    if (!audio_data.match(/^[A-Za-z0-9+/=]+$/)) {
      throw new Error('Invalid base64 audio data format');
    }

    // Mock transcription - in a real implementation, this would use a transcription service
    await this.simulateProcessing(signal);

    return this.generateMockTranscription('audio_data', language, output_format);
  }

  private listSupportedLanguages(): any {
    return {
      languages: TranscriptionTool.SUPPORTED_LANGUAGES,
      count: TranscriptionTool.SUPPORTED_LANGUAGES.length,
      note: 'Use "auto" for automatic language detection',
    };
  }

  private async simulateProcessing(signal: AbortSignal): Promise<void> {
    // Simulate transcription processing time
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(resolve, 2000);
      signal.addEventListener('abort', () => {
        clearTimeout(timeout);
        reject(new Error('Operation cancelled'));
      });
    });
  }

  private generateMockTranscription(source: string, language: string, format: string): any {
    const mockText = "This is a mock transcription result. In a production environment, this would contain the actual transcribed text from the audio file.";
    
    switch (format) {
      case 'text':
        return { text: mockText, language, source };
      case 'json':
        return {
          transcription: mockText,
          language,
          source,
          confidence: 0.95,
          duration: 10.5,
          words: [
            { word: "This", start: 0.0, end: 0.5, confidence: 0.98 },
            { word: "is", start: 0.5, end: 0.7, confidence: 0.97 },
            { word: "a", start: 0.7, end: 0.8, confidence: 0.99 },
            // ... more words would be here
          ],
        };
      case 'srt':
        return `1\n00:00:00,000 --> 00:00:10,000\n${mockText}\n\n`;
      case 'vtt':
        return `WEBVTT\n\n00:00:00.000 --> 00:00:10.000\n${mockText}\n\n`;
      default:
        return { text: mockText, language, source };
    }
  }

  private formatOutput(result: any, operation: string, params: any): string {
    switch (operation) {
      case 'transcribe_audio':
      case 'transcribe_audio_data':
        const format = params.output_format || 'text';
        if (format === 'text') {
          return `✅ Transcription completed:\n\n"${result.text}"\n\n🗣️ Language: ${result.language}\n📁 Source: ${result.source}`;
        } else {
          return `✅ Transcription completed in ${format} format\n\n🗣️ Language: ${result.language || params.language || 'auto'}\n\n💡 Note: This is a mock implementation. In production, this would contain actual transcription results.`;
        }
      case 'list_supported_languages':
        return `📋 Supported Languages (${result.count}):\n\n${result.languages.join(', ')}\n\n💡 ${result.note}`;
      default:
        return JSON.stringify(result, null, 2);
    }
  }
}