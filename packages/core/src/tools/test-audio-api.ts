#!/usr/bin/env node
/**
 * Test script for the Audio Generator API
 * This script tests various voices and configurations
 */

import { AudioGeneratorTool } from './audio-generator.js';
import { Config } from '../config/config.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

// Get directory name in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load comprehensive voice data
const voicesPath = path.join(__dirname, '../data/voices.json');
const voicesDataFull = JSON.parse(await fs.readFile(voicesPath, 'utf-8'));

// Test configurations
const TEST_TEXTS = {
  en: "Hello! This is a test of the unified audio API. I can speak in different voices and styles.",
  es: "¡Hola! Esta es una prueba de la API de audio unificada. Puedo hablar con diferentes voces y estilos.",
  fr: "Bonjour! Ceci est un test de l'API audio unifiée. Je peux parler avec différentes voix et styles.",
  de: "Hallo! Dies ist ein Test der einheitlichen Audio-API. Ich kann in verschiedenen Stimmen und Stilen sprechen.",
  hi: "नमस्ते! यह एकीकृत ऑडियो एपीआई का परीक्षण है। मैं विभिन्न आवाज़ों और शैलियों में बोल सकता हूं।",
};

const GEMINI_INSTRUCTIONS = [
  "Speak in a professional and confident tone",
  "Use a calm and soothing voice",
  "Speak energetically with enthusiasm",
  "Use a narrative storytelling style",
];

// Color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
};

function log(message: string, color: string = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

async function testVoice(
  tool: AudioGeneratorTool,
  voiceId: string,
  voiceName: string,
  provider: string,
  languages: string[],
  text?: string,
  language?: string,
  instructions?: string
) {
  log(`\n${colors.bright}Testing ${provider} voice: ${voiceName} (${voiceId})${colors.reset}`, colors.cyan);
  
  // Select appropriate text and language
  const selectedLang = language || (languages.includes('en-US') ? 'en-US' : languages[0]);
  const langCode = selectedLang.split('-')[0] as keyof typeof TEST_TEXTS;
  const testText = text || TEST_TEXTS[langCode] || TEST_TEXTS.en;
  
  log(`Language: ${selectedLang}`, colors.blue);
  if (instructions) {
    log(`Instructions: ${instructions}`, colors.magenta);
  }

  const params = {
    text: testText,
    voice: voiceId,
    language: langCode,
    ...(instructions && provider === 'gemini' ? { instructions } : {}),
  };

  try {
    const startTime = Date.now();
    const result = await tool.execute(params, new AbortController().signal);
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    
    if (result.llmContent) {
      const response = JSON.parse(result.llmContent as string);
      if (response.success) {
        log(`✅ Success! Generated in ${duration}s`, colors.green);
        log(`Audio URL: ${response.audio_url}`, colors.green);
        log(`Audio Duration: ${response.duration_seconds?.toFixed(1)}s`, colors.green);
        return { success: true, voiceId, duration, audioUrl: response.audio_url };
      } else {
        log(`❌ Failed: ${response.error}`, colors.red);
        return { success: false, voiceId, error: response.error };
      }
    }
  } catch (error) {
    log(`❌ Error: ${error}`, colors.red);
    return { success: false, voiceId, error: String(error) };
  }
}

async function main() {
  log(`${colors.bright}=== Audio API Test Suite ===${colors.reset}`, colors.cyan);
  log(`Testing with ${voicesDataFull.voices.length} voices from voices_for_ui.json\n`, colors.yellow);

  // Check environment variables
  if (!process.env.BACKEND_URL || !process.env.BACKEND_API_KEY) {
    log('❌ Missing required environment variables:', colors.red);
    log('Please set BACKEND_URL and BACKEND_API_KEY', colors.red);
    process.exit(1);
  }

  log(`Backend URL: ${process.env.BACKEND_URL}`, colors.blue);
  
  // Initialize tool
  const config = new Config({
    sessionId: 'test-session',
    targetDir: process.cwd(),
    debugMode: true,
    cwd: process.cwd(),
    model: 'gemini-1.5-flash-latest'
  });
  const tool = new AudioGeneratorTool(config);
  
  const results = {
    total: 0,
    successful: 0,
    failed: 0,
    byProvider: {
      elevenlabs: { success: 0, failed: 0 },
      gemini: { success: 0, failed: 0 },
    },
  };

  // Test 1: Quick test with a few voices
  log(`\n${colors.bright}=== Quick Test (5 voices) ===${colors.reset}`, colors.yellow);
  const quickTestVoices = voicesDataFull.voices.slice(0, 5);
  
  for (const voice of quickTestVoices) {
    results.total++;
    const result = await testVoice(
      tool,
      voice.id,
      voice.name,
      voice.provider,
      voice.languages
    );
    
    if (result && result.success) {
      results.successful++;
      results.byProvider[voice.provider as 'elevenlabs' | 'gemini'].success++;
    } else {
      results.failed++;
      results.byProvider[voice.provider as 'elevenlabs' | 'gemini'].failed++;
    }
  }

  // Test 2: Test Gemini voices with instructions
  log(`\n${colors.bright}=== Testing Gemini Voices with Instructions ===${colors.reset}`, colors.yellow);
  const geminiVoices = voicesDataFull.voices.filter((v: any) => v.provider === 'gemini').slice(0, 3);
  
  for (const voice of geminiVoices) {
    for (const instruction of GEMINI_INSTRUCTIONS.slice(0, 2)) {
      results.total++;
      const result = await testVoice(
        tool,
        voice.id,
        voice.name,
        voice.provider,
        voice.languages,
        undefined,
        undefined,
        instruction
      );
      
      if (result && result.success) {
        results.successful++;
        results.byProvider.gemini.success++;
      } else {
        results.failed++;
        results.byProvider.gemini.failed++;
      }
    }
  }

  // Test 3: Test multi-language support
  log(`\n${colors.bright}=== Testing Multi-Language Support ===${colors.reset}`, colors.yellow);
  const multiLangVoice = voicesDataFull.voices.find((v: any) => 
    v.languages.length > 3 && v.provider === 'gemini'
  );
  
  if (multiLangVoice) {
    const testLangs = ['en-US', 'es-US', 'fr-FR', 'de-DE', 'hi-IN'];
    for (const lang of testLangs) {
      if (multiLangVoice.languages.includes(lang)) {
        results.total++;
        const result = await testVoice(
          tool,
          multiLangVoice.id,
          multiLangVoice.name,
          multiLangVoice.provider,
          multiLangVoice.languages,
          undefined,
          lang
        );
        
        if (result && result.success) {
          results.successful++;
          results.byProvider.gemini.success++;
        } else {
          results.failed++;
          results.byProvider.gemini.failed++;
        }
      }
    }
  }

  // Print summary
  log(`\n${colors.bright}=== Test Summary ===${colors.reset}`, colors.cyan);
  log(`Total tests: ${results.total}`, colors.yellow);
  log(`Successful: ${results.successful} (${((results.successful / results.total) * 100).toFixed(1)}%)`, colors.green);
  log(`Failed: ${results.failed} (${((results.failed / results.total) * 100).toFixed(1)}%)`, colors.red);
  log(`\nBy Provider:`, colors.yellow);
  log(`ElevenLabs - Success: ${results.byProvider.elevenlabs.success}, Failed: ${results.byProvider.elevenlabs.failed}`, colors.blue);
  log(`Gemini - Success: ${results.byProvider.gemini.success}, Failed: ${results.byProvider.gemini.failed}`, colors.blue);

  // List all available voices
  log(`\n${colors.bright}=== Available Voices ===${colors.reset}`, colors.cyan);
  log(`\nElevenLabs Voices (${voicesDataFull.voices.filter((v: any) => v.provider === 'elevenlabs').length}):`, colors.blue);
  voicesDataFull.voices
    .filter((v: any) => v.provider === 'elevenlabs')
    .forEach((v: any) => {
      log(`  ${v.id} - ${v.name} (${v.gender}, ${v.languages.join(', ')})`, colors.yellow);
    });
  
  log(`\nGemini Voices (${voicesDataFull.voices.filter((v: any) => v.provider === 'gemini').length}):`, colors.blue);
  voicesDataFull.voices
    .filter((v: any) => v.provider === 'gemini')
    .forEach((v: any) => {
      log(`  ${v.id} - ${v.name} (${v.gender}, ${v.languages.length} languages)`, colors.yellow);
    });
}

// Run the test
main().catch(console.error);