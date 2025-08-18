#!/usr/bin/env node
/**
 * Simple test script for testing specific voices with the Audio API
 * Usage: npx tsx test-audio-simple.ts <voice_id> [text] [language] [instructions]
 */

import { AudioGeneratorTool } from './audio-generator.js';
import { Config } from '../config/config.js';

// Color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message: string, color: string = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

async function testSingleVoice() {
  // Parse command line arguments
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    log('Usage: npx tsx test-audio-simple.ts <voice_id> [text] [language] [instructions]', colors.yellow);
    log('\nExamples:', colors.yellow);
    log('  npx tsx test-audio-simple.ts 9BWtsMINqrJLrRacOk9x', colors.cyan);
    log('  npx tsx test-audio-simple.ts gemini_zephyr "Hello world" en', colors.cyan);
    log('  npx tsx test-audio-simple.ts gemini_puck "Test message" en "Speak professionally"', colors.cyan);
    log('\nAvailable voice IDs:', colors.yellow);
    log('  ElevenLabs: 9BWtsMINqrJLrRacOk9x, EXAVITQu4vr4xnSDxMaL, FGY2WhTYpPnrIDTdsKH5, ...', colors.blue);
    log('  Gemini: gemini_zephyr, gemini_puck, gemini_charon, gemini_kore, ...', colors.blue);
    process.exit(0);
  }

  const voiceId = args[0];
  const text = args[1] || "Hello! This is a test of the audio generation API. The quick brown fox jumps over the lazy dog.";
  const language = args[2] || 'en';
  const instructions = args[3];

  // Check environment variables
  if (!process.env.BACKEND_URL || !process.env.BACKEND_API_KEY) {
    log('❌ Missing required environment variables:', colors.red);
    log('Please set BACKEND_URL and BACKEND_API_KEY', colors.red);
    log('\nExample:', colors.yellow);
    log('export BACKEND_URL=http://localhost:8080', colors.cyan);
    log('export BACKEND_API_KEY=your-api-key', colors.cyan);
    process.exit(1);
  }

  log(`${colors.bright}=== Audio API Test ===${colors.reset}`, colors.cyan);
  log(`Backend URL: ${process.env.BACKEND_URL}`, colors.blue);
  log(`Voice ID: ${voiceId}`, colors.blue);
  log(`Language: ${language}`, colors.blue);
  log(`Text: "${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"`, colors.blue);
  
  if (instructions && voiceId.startsWith('gemini_')) {
    log(`Instructions: "${instructions}"`, colors.yellow);
  } else if (instructions && !voiceId.startsWith('gemini_')) {
    log('⚠️  Instructions are only supported for Gemini voices', colors.yellow);
  }

  // Initialize tool
  const config = new Config({
    sessionId: 'test-session',
    targetDir: process.cwd(),
    debugMode: true,
    cwd: process.cwd(),
    model: 'gemini-1.5-flash-latest'
  });
  const tool = new AudioGeneratorTool(config);

  // Prepare parameters
  const params = {
    text,
    voice: voiceId,
    language,
    ...(instructions && voiceId.startsWith('gemini_') ? { instructions } : {}),
  };

  log('\nGenerating audio...', colors.yellow);
  const startTime = Date.now();

  try {
    const result = await tool.execute(params, new AbortController().signal);
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    
    if (result.llmContent) {
      const response = JSON.parse(result.llmContent as string);
      
      if (response.success) {
        log(`\n✅ Success! Audio generated in ${duration}s`, colors.green);
        log(`\nDetails:`, colors.yellow);
        log(`  Provider: ${voiceId.startsWith('gemini_') ? 'Google Gemini' : 'ElevenLabs'}`, colors.blue);
        log(`  Audio Duration: ${response.duration_seconds?.toFixed(1)}s`, colors.blue);
        log(`  Task ID: ${response.task_id}`, colors.blue);
        log(`  Audio URL: ${response.audio_url}`, colors.green);
        
        if (response.conversation_id) {
          log(`  Conversation ID: ${response.conversation_id}`, colors.blue);
        }

        log(`\n🎵 You can listen to the audio at:`, colors.cyan);
        log(response.audio_url, colors.bright);
      } else {
        log(`\n❌ Failed: ${response.error}`, colors.red);
      }
    }
  } catch (error) {
    log(`\n❌ Error: ${error}`, colors.red);
  }
}

// Run the test
testSingleVoice().catch(console.error);