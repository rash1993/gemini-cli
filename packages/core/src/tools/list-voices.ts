#!/usr/bin/env node
/**
 * Script to list all available voices from the audio API
 * This calls the /audio/voices endpoint to get the current voice list
 */

// Use native fetch (available in Node.js 18+)

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

async function listVoices() {
  // Check environment variables
  if (!process.env.BACKEND_URL || !process.env.BACKEND_API_KEY) {
    log('❌ Missing required environment variables:', colors.red);
    log('Please set BACKEND_URL and BACKEND_API_KEY', colors.red);
    log('\nExample:', colors.yellow);
    log('export BACKEND_URL=http://localhost:8080', colors.cyan);
    log('export BACKEND_API_KEY=your-api-key', colors.cyan);
    process.exit(1);
  }

  const backendUrl = process.env.BACKEND_URL;
  const apiKey = process.env.BACKEND_API_KEY;

  log(`${colors.bright}=== Available Voices from Audio API ===${colors.reset}`, colors.cyan);
  log(`Backend URL: ${backendUrl}`, colors.blue);

  try {
    // Call the voices endpoint
    const response = await fetch(`${backendUrl}/audio/voices`, {
      method: 'GET',
      headers: {
        'BACKEND-API-KEY': apiKey,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch voices: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const voices = data.voices || [];
    
    log(`\nTotal voices available: ${voices.length}`, colors.yellow);

    // Group voices by provider
    const voicesByProvider: Record<string, any[]> = {};
    voices.forEach((voice: any) => {
      const provider = voice.provider || 'unknown';
      if (!voicesByProvider[provider]) {
        voicesByProvider[provider] = [];
      }
      voicesByProvider[provider].push(voice);
    });

    // Display voices by provider
    Object.entries(voicesByProvider).forEach(([provider, providerVoices]) => {
      log(`\n${colors.bright}${provider.toUpperCase()} Voices (${providerVoices.length}):${colors.reset}`, colors.blue);
      
      providerVoices.forEach((voice) => {
        const languages = Array.isArray(voice.languages) 
          ? voice.languages.join(', ') 
          : voice.language || 'unknown';
        
        log(`\n  ${colors.bright}${voice.id}${colors.reset}`, colors.green);
        log(`    Name: ${voice.name || voice.display_name}`, colors.yellow);
        log(`    Gender: ${voice.gender}`, colors.cyan);
        log(`    Languages: ${languages}`, colors.cyan);
        
        if (voice.quality) {
          log(`    Quality: ${voice.quality}`, colors.cyan);
        }
        
        if (voice.description) {
          log(`    Description: ${voice.description.substring(0, 80)}${voice.description.length > 80 ? '...' : ''}`, colors.magenta);
        }
        
        if (provider === 'gemini' || voice.supports_instructions) {
          log(`    ✓ Supports instructions`, colors.green);
        }
      });
    });

    // Show example usage
    log(`\n${colors.bright}Example Usage:${colors.reset}`, colors.yellow);
    log('npx tsx test-audio-simple.ts <voice_id> "Your text here" <language> [instructions]', colors.cyan);
    
    if (voices.length > 0) {
      const exampleVoice = voices[0];
      const exampleLang = Array.isArray(exampleVoice.languages) 
        ? exampleVoice.languages[0].split('-')[0] 
        : 'en';
      log(`\nExample with first voice:`, colors.yellow);
      log(`npx tsx test-audio-simple.ts ${exampleVoice.id} "Hello world" ${exampleLang}`, colors.green);
    }

  } catch (error) {
    log(`\n❌ Error fetching voices: ${error}`, colors.red);
    log('\nNote: Make sure the backend server is running and accessible.', colors.yellow);
  }
}

// Run the script
listVoices().catch(console.error);