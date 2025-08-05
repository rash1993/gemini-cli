# Audio API Testing Guide

This directory contains test scripts for the unified audio generation API that supports both ElevenLabs and Google Gemini voices.

## Prerequisites

Before running any tests, you need to set the following environment variables:

```bash
export BACKEND_URL=http://localhost:8080  # Your backend URL
export BACKEND_API_KEY=your-api-key        # Your API key
```

## Available Test Scripts

### 1. List Available Voices

To see all voices available from the API:

```bash
npm run list:voices
```

This will show:
- Total number of available voices
- Voices grouped by provider (ElevenLabs, Gemini)
- Voice details including ID, name, gender, languages, and features

### 2. Test a Single Voice

To test a specific voice:

```bash
npm run test:audio <voice_id> [text] [language] [instructions]
```

Examples:
```bash
# Test an ElevenLabs voice
npm run test:audio 9BWtsMINqrJLrRacOk9x

# Test a Gemini voice with custom text
npm run test:audio gemini_zephyr "Hello from the audio API!" en

# Test a Gemini voice with instructions
npm run test:audio gemini_puck "Tell me a story" en "Speak in a narrative, storytelling style"
```

### 3. Run Comprehensive Tests

To run a full test suite:

```bash
npm run test:audio:all
```

This will:
- Test multiple voices from both providers
- Test Gemini voices with different instructions
- Test multi-language support
- Provide a summary of success/failure rates

## API Details

### How the Audio Generation Works

The audio generator uses a two-step async process:

1. **Create Task**: POST to `/audio/generate`
   ```json
   {
     "text": "Your text here",
     "voice_id": "voice_id_here",
     "language": "en",
     "instructions": "Optional instructions for Gemini voices",
     "priority": "normal"
   }
   ```
   Returns: `{ "task_id": "uuid" }`

2. **Poll for Completion**: GET to `/audio/task/{task_id}`
   - Polls every 2 seconds
   - Times out after 2 minutes
   - Returns audio URL when complete

### Voice ID Formats

- **ElevenLabs**: Original voice IDs (e.g., `9BWtsMINqrJLrRacOk9x`)
- **Gemini**: Prefixed with `gemini_` (e.g., `gemini_zephyr`, `gemini_puck`)

### Language Support

Languages should be specified as ISO 639-1 codes:
- `en` - English
- `es` - Spanish
- `fr` - French
- `de` - German
- `hi` - Hindi
- etc.

Note: The API may accept full locale codes (e.g., `en-US`) but the tool currently uses the base language code.

### Instructions (Gemini Only)

Google Gemini voices support custom instructions to control speaking style:
- "Speak in a professional and confident tone"
- "Use a calm and soothing voice"
- "Speak energetically with enthusiasm"
- "Use a narrative storytelling style"

Instructions are ignored for ElevenLabs voices.

## Troubleshooting

### Common Issues

1. **"Backend URL or API key not configured"**
   - Make sure environment variables are set
   - Check that the backend server is running

2. **"Invalid voice_id"**
   - Run `npm run list:voices` to see available voice IDs
   - Ensure you're using the correct format

3. **"Instructions parameter is only supported for Google Gemini voices"**
   - Instructions only work with voices starting with `gemini_`

4. **Timeout errors**
   - The API has a 2-minute timeout for audio generation
   - Longer texts may take more time
   - Check backend logs for processing issues

## Voice Selection Tips

### ElevenLabs Voices
- Best for: Non-English languages, natural-sounding speech
- Features: Multiple accents, age groups, and speaking styles
- Limitations: No custom instructions

### Google Gemini Voices
- Best for: English content, custom speaking styles
- Features: Instruction support, multi-language capability
- Limitations: Fewer voice options

## Example Test Workflow

1. First, list available voices:
   ```bash
   npm run list:voices
   ```

2. Pick a voice and test it:
   ```bash
   npm run test:audio gemini_zephyr "Testing audio generation"
   ```

3. Try different languages (for multi-language voices):
   ```bash
   npm run test:audio gemini_zephyr "Bonjour le monde" fr
   ```

4. Experiment with instructions (Gemini only):
   ```bash
   npm run test:audio gemini_kore "Market update" en "Professional news anchor style"
   ```

5. Run the full test suite:
   ```bash
   npm run test:audio:all
   ```