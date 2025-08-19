/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash';
export const DEFAULT_GEMINI_FLASH_MODEL = 'gemini-2.5-flash';
export const DEFAULT_GEMINI_EMBEDDING_MODEL = 'gemini-embedding-001';

export const AVAILABLE_GEMINI_MODELS = [
  'gemini-2.5-pro',
  'gemini-2.5-flash'
] as const;

export type GeminiModel = typeof AVAILABLE_GEMINI_MODELS[number];

export const MODEL_DESCRIPTIONS = {
  'gemini-2.5-pro': 'Advanced model for complex reasoning and deep analysis',
  'gemini-2.5-flash': 'Fast, efficient model for quick responses'
} as const;
