/**
 * Test script to examine API responses for cost/usage data.
 * Run with: npx tsx scripts/test-api-costs.ts
 */

import * as fs from 'fs';
import * as path from 'path';

// Load .env file manually BEFORE importing modules that use env
const envPath = path.join(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const eqIndex = trimmed.indexOf('=');
      if (eqIndex > 0) {
        const key = trimmed.slice(0, eqIndex);
        let value = trimmed.slice(eqIndex + 1);
        // Remove quotes if present
        if ((value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        process.env[key] = value;
      }
    }
  }
  console.log('[DEBUG] Loaded .env from:', envPath);
} else {
  console.log('[DEBUG] No .env file found at:', envPath);
}

// Dynamic imports after env is loaded
async function run() {
  const { GoogleGenerativeAI } = await import('@google/generative-ai');
  const { env } = await import('../lib/env');

  async function testGeminiText() {
    console.log('\n=== GEMINI TEXT GENERATION ===');
    try {
      const genAI = new GoogleGenerativeAI(env.GOOGLE_GENAI_API_KEY || '');
      const model = genAI.getGenerativeModel({ model: 'gemini-3-pro-preview' });

      const result = await model.generateContent('Say hello in exactly 5 words.');

      console.log('Response text:', result.response.text());
      console.log('\nusageMetadata:', JSON.stringify(result.response.usageMetadata, null, 2));

      // Check for any other properties on the response
      const responseKeys = Object.keys(result.response);
      console.log('\nResponse object keys:', responseKeys);

      // Log the full result object structure (without circular refs)
      console.log('\nFull result keys:', Object.keys(result));
    } catch (error) {
      console.error('Gemini Text error:', error);
    }
  }

  async function testGeminiTTS() {
    console.log('\n=== GEMINI TTS ===');
    try {
      const genAI = new GoogleGenerativeAI(env.GOOGLE_GENAI_API_KEY || '');
      const model = genAI.getGenerativeModel({
        model: 'gemini-2.5-pro-preview-tts',
        generationConfig: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: 'Kore',
              },
            },
          },
        } as any,
      });

      const result = await model.generateContent('Hello world.');

      console.log('usageMetadata:', JSON.stringify(result.response.usageMetadata, null, 2));

      // Check if there's audio data
      const candidates = result.response.candidates;
      if (candidates && candidates[0]?.content?.parts) {
        const parts = candidates[0].content.parts;
        console.log('Response parts count:', parts.length);
        if (parts[0]?.inlineData) {
          console.log('Audio data mimeType:', parts[0].inlineData.mimeType);
          console.log('Audio data length:', parts[0].inlineData.data?.length || 0, 'chars (base64)');
        }
      }
    } catch (error) {
      console.error('Gemini TTS error:', error);
    }
  }

  async function testGeminiImageGen() {
    console.log('\n=== GEMINI IMAGE GENERATION ===');
    try {
      const genAI = new GoogleGenerativeAI(env.GOOGLE_GENAI_API_KEY || '');
      const model = genAI.getGenerativeModel({
        model: 'gemini-2.5-flash-image',
        generationConfig: {
          responseModalities: ['TEXT', 'IMAGE'],
        } as any,
      });

      const result = await model.generateContent('Generate a simple stick figure.');

      console.log('usageMetadata:', JSON.stringify(result.response.usageMetadata, null, 2));

      // Check for image data
      const candidates = result.response.candidates;
      if (candidates && candidates[0]?.content?.parts) {
        const parts = candidates[0].content.parts;
        console.log('Response parts count:', parts.length);
        for (const part of parts) {
          if (part.inlineData) {
            console.log('Image data mimeType:', part.inlineData.mimeType);
            console.log('Image data length:', part.inlineData.data?.length || 0, 'chars (base64)');
          }
          if (part.text) {
            console.log('Text response:', part.text.slice(0, 100));
          }
        }
      }
    } catch (error) {
      console.error('Gemini Image error:', error);
    }
  }

  async function testAssemblyAI() {
    console.log('\n=== ASSEMBLY AI ===');
    try {
      // List recent transcripts to see response structure
      const response = await fetch('https://api.assemblyai.com/v2/transcript?limit=1', {
        method: 'GET',
        headers: {
          Authorization: env.ASSEMBLYAI_API_KEY,
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json();
      console.log('List transcripts response:', JSON.stringify(data, null, 2));

      // If there's a transcript, get its details
      if (data.transcripts && data.transcripts.length > 0) {
        const transcriptId = data.transcripts[0].id;
        console.log('\nFetching details for transcript:', transcriptId);

        const detailResponse = await fetch(`https://api.assemblyai.com/v2/transcript/${transcriptId}`, {
          method: 'GET',
          headers: {
            Authorization: env.ASSEMBLYAI_API_KEY,
            'Content-Type': 'application/json',
          },
        });

        const detailData = await detailResponse.json();

        // Log interesting fields that might contain cost/usage info
        console.log('\nTranscript details (selected fields):');
        console.log('- status:', detailData.status);
        console.log('- audio_duration:', detailData.audio_duration);
        console.log('- confidence:', detailData.confidence);
        console.log('- words count:', detailData.words?.length);

        // Check for any billing/cost related fields
        const allKeys = Object.keys(detailData);
        const potentialCostKeys = allKeys.filter(k =>
          k.includes('cost') || k.includes('price') || k.includes('credit') ||
          k.includes('usage') || k.includes('billing') || k.includes('charge')
        );
        console.log('\nPotential cost-related keys:', potentialCostKeys);
        console.log('All response keys:', allKeys);
      }
    } catch (error) {
      console.error('AssemblyAI error:', error);
    }
  }

  console.log('========================================');
  console.log('API Cost/Usage Data Test');
  console.log('========================================');

  await testGeminiText();
  await testGeminiTTS();
  await testGeminiImageGen();
  await testAssemblyAI();

  console.log('\n========================================');
  console.log('Test Complete');
  console.log('========================================');
  console.log('\nSummary:');
  console.log('- Gemini APIs return usageMetadata with token counts');
  console.log('- Check above output for specific fields available');
  console.log('- AssemblyAI may require separate billing API for cost data');
}

run().catch(console.error);
