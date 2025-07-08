/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AudioGeneratorTool, AudioGeneratorParams } from './audio-generator.js';
import { Config } from '../config/config.js';

// Mock fetch
global.fetch = vi.fn();

describe('AudioGeneratorTool', () => {
  let tool: AudioGeneratorTool;
  let mockConfig: Config;
  let mockFetch: any;

  beforeEach(() => {
    mockFetch = vi.mocked(fetch);
    mockConfig = {
      getBackendUrl: () => 'https://test-backend.com',
      getBackendSecretKey: () => 'test-secret-key',
    } as Config;

    tool = new AudioGeneratorTool(mockConfig);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with correct name and description', () => {
      expect(tool.name).toBe('generate_audio');
      expect(tool.description).toContain('Generates audio');
    });

    it('should use environment variables when config is not provided', () => {
      process.env.BACKEND_URL = 'https://env-backend.com';
      process.env.BACKEND_SECRET_KEY = 'env-secret';

      const envTool = new AudioGeneratorTool();
      expect(envTool).toBeDefined();

      delete process.env.BACKEND_URL;
      delete process.env.BACKEND_SECRET_KEY;
    });
  });

  describe('validateParams', () => {
    it('should return null for valid parameters', () => {
      const params: AudioGeneratorParams = {
        text: 'Hello world',
        language_code: 'en-US',
        voice_name: 'en-US-Journey-D',
      };

      expect(tool.validateToolParams(params)).toBeNull();
    });

    it('should return error for empty text', () => {
      const params: AudioGeneratorParams = {
        text: '',
        language_code: 'en-US',
        voice_name: 'en-US-Journey-D',
      };

      const error = tool.validateToolParams(params);
      expect(error).toContain('text parameter cannot be empty');
    });

    it('should return error for text that is too long', () => {
      const params: AudioGeneratorParams = {
        text: 'a'.repeat(6001),
        language_code: 'en-US',
        voice_name: 'en-US-Journey-D',
      };

      const error = tool.validateToolParams(params);
      expect(error).toContain('text is too long');
    });

    it('should return error for invalid method', () => {
      const params: AudioGeneratorParams = {
        text: 'Hello world',
        language_code: 'en-US',
        voice_name: 'en-US-Journey-D',
        method: 'invalid_method' as any,
      };

      const error = tool.validateToolParams(params);
      expect(error).toContain('Invalid method');
    });

    it('should validate Chirp_gemini voices correctly', () => {
      const params: AudioGeneratorParams = {
        text: 'Hello world',
        voice_name: 'Aoede',
        method: 'Chirp_gemini',
      };

      expect(tool.validateToolParams(params)).toBeNull();
    });

    it('should return error for invalid Chirp_gemini voice', () => {
      const params: AudioGeneratorParams = {
        text: 'Hello world',
        voice_name: 'invalid-voice',
        method: 'Chirp_gemini',
      };

      const error = tool.validateToolParams(params);
      expect(error).toContain('Invalid Chirp_gemini voice');
    });

    it('should return error when backend is not configured', () => {
      const unconfiguredTool = new AudioGeneratorTool();
      const params: AudioGeneratorParams = {
        text: 'Hello world',
        language_code: 'en-US',
        voice_name: 'en-US-Journey-D',
      };

      const error = unconfiguredTool.validateToolParams(params);
      expect(error).toContain('Backend URL or secret key not configured');
    });
  });

  describe('getDescription', () => {
    it('should return correct description for standard method', () => {
      const params: AudioGeneratorParams = {
        text: 'Hello world',
        language_code: 'en-US',
        voice_name: 'en-US-Journey-D',
      };

      const description = tool.getDescription(params);
      expect(description).toContain('Hello world');
      expect(description).toContain('en-US');
      expect(description).toContain('en-US-Journey-D');
    });

    it('should return correct description for Chirp_gemini method', () => {
      const params: AudioGeneratorParams = {
        text: 'Hello world',
        voice_name: 'Aoede',
        method: 'Chirp_gemini',
      };

      const description = tool.getDescription(params);
      expect(description).toContain('Hello world');
      expect(description).toContain('Aoede');
      expect(description).toContain('Chirp_gemini');
    });
  });

  describe('execute', () => {
    it('should return error for invalid parameters', async () => {
      const params: AudioGeneratorParams = {
        text: '',
        language_code: 'en-US',
        voice_name: 'en-US-Journey-D',
      };

      const signal = new AbortController().signal;
      const result = await tool.execute(params, signal);

      expect(result.llmContent).toContain('"success":false');
      expect(result.returnDisplay).toContain('Error:');
    });

    it('should successfully generate audio', async () => {
      const params: AudioGeneratorParams = {
        text: 'Hello world',
        language_code: 'en-US',
        voice_name: 'en-US-Journey-D',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: 'success',
          gcs_file_path: 'gs://bucket/audio.wav',
          conversation_id: 'test-conversation-id',
        }),
      });

      const signal = new AbortController().signal;
      const result = await tool.execute(params, signal);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://test-backend.com/generate_audio',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer test-secret-key',
          },
          body: JSON.stringify({
            text: 'Hello world',
            language_code: 'en-US',
            voice_name: 'en-US-Journey-D',
            conversation_id: undefined,
            method: 'standard',
          }),
        }),
      );

      expect(result.llmContent).toContain('"success":true');
      expect(result.returnDisplay).toContain('Successfully generated audio');
      expect(result.returnDisplay).toContain('gs://bucket/audio.wav');
    });

    it('should handle API errors gracefully', async () => {
      const params: AudioGeneratorParams = {
        text: 'Hello world',
        language_code: 'en-US',
        voice_name: 'en-US-Journey-D',
      };

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () => 'Bad request',
      });

      const signal = new AbortController().signal;
      const result = await tool.execute(params, signal);

      expect(result.llmContent).toContain('"success":false');
      expect(result.returnDisplay).toContain('Error generating audio');
    });

    it('should handle abort signal', async () => {
      const params: AudioGeneratorParams = {
        text: 'Hello world',
        language_code: 'en-US',
        voice_name: 'en-US-Journey-D',
      };

      const controller = new AbortController();
      controller.abort();

      const result = await tool.execute(params, controller.signal);

      expect(result.llmContent).toContain('"success":false');
      expect(result.returnDisplay).toContain('cancelled');
    });

    it('should pass conversation_id when provided', async () => {
      const params: AudioGeneratorParams = {
        text: 'Hello world',
        language_code: 'en-US',
        voice_name: 'en-US-Journey-D',
        conversation_id: 'test-conv-id',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: 'success',
          gcs_file_path: 'gs://bucket/audio.wav',
          conversation_id: 'test-conv-id',
        }),
      });

      const signal = new AbortController().signal;
      await tool.execute(params, signal);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('"conversation_id":"test-conv-id"'),
        }),
      );
    });

    it('should use Chirp_gemini method when specified', async () => {
      const params: AudioGeneratorParams = {
        text: 'Hello world',
        voice_name: 'Aoede',
        method: 'Chirp_gemini',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: 'success',
          gcs_file_path: 'gs://bucket/audio.wav',
          conversation_id: null,
        }),
      });

      const signal = new AbortController().signal;
      await tool.execute(params, signal);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('"method":"Chirp_gemini"'),
        }),
      );
    });
  });
});
