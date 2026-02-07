import { GoogleGenerativeAI } from '@google/generative-ai';
import { env } from '@/lib/env';
import { withRetry } from '@/utils/retry';
import { createWavBuffer, calculateAudioDuration } from '@/utils/wav';
import type { Scene } from '@/types';
import fs from 'fs/promises';

const genAI = new GoogleGenerativeAI(env.GOOGLE_GENAI_API_KEY || '');

// TTS model
const MODEL_NAME = 'gemini-2.5-pro-preview-tts';

// Available voices (Charon is informative/analytical)
export const VOICES = {
  CHARON: 'Charon', // Informative, calm, analytical
  KORE: 'Kore', // Bright, engaging
  FENRIR: 'Fenrir', // Deep, authoritative
  ALGENIB: 'Algenib', // Warm, friendly
  PUCK: 'Puck', // Playful, energetic
} as const;

interface TTSConfig {
  responseModalities: string[];
  speechConfig: {
    voiceConfig: {
      prebuiltVoiceConfig: {
        voiceName: string;
      };
    };
  };
}

export interface UsageMetadata {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  totalTokenCount?: number;
  thoughtsTokenCount?: number;
}

/**
 * Generate speech audio from text using Gemini TTS.
 */
export async function generateSpeech(
  text: string,
  outputPath: string,
  voice: string = VOICES.ALGENIB
): Promise<{ audioPath: string; duration: number; usageMetadata?: UsageMetadata }> {
  // Note: TTS config is passed via generationConfig extension
  // The SDK types don't include TTS-specific options yet
  const model = genAI.getGenerativeModel({
    model: MODEL_NAME,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    generationConfig: {
      responseModalities: ['AUDIO'],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: {
            voiceName: voice,
          },
        },
      },
    } as any,
  });

  // Clean up text for TTS
  const cleanText = text
    .replace(/\[SCENE_BREAK\]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const result = await withRetry(
    async () => {
      const response = await model.generateContent({
        contents: [
          {
            role: 'user',
            parts: [{ text: `Read the following as part of an ongoing narration. Speak naturally and continuously as if this is a segment in the middle of a longer monologue. Do not add pauses at the beginning or end. Use a calm, analytical tone:\n\n${cleanText}` }],
          },
        ],
      });

      const responseData = response.response;

      // Capture usage metadata for cost tracking
      const usageMetadata = responseData.usageMetadata as UsageMetadata | undefined;

      // Extract audio from response
      for (const candidate of responseData.candidates || []) {
        for (const part of candidate.content?.parts || []) {
          if ('inlineData' in part && part.inlineData?.data) {
            const mimeType = part.inlineData.mimeType || '';
            if (mimeType.includes('audio') || mimeType.includes('pcm')) {
              return {
                data: part.inlineData.data,
                mimeType,
                usageMetadata,
              };
            }
          }
        }
      }

      throw new Error('No audio data in response');
    },
    {
      maxAttempts: 3,
      baseDelayMs: 2000,
      onRetry: (error, attempt) => {
        console.log(`TTS retry ${attempt}: ${error.message}`);
      },
    }
  );

  // Convert base64 to buffer
  const audioBuffer = Buffer.from(result.data, 'base64');

  // Wrap PCM data with WAV header (24kHz, mono, 16-bit)
  const wavBuffer = createWavBuffer(audioBuffer);

  // Save the audio file
  await fs.writeFile(outputPath, wavBuffer);

  // Calculate duration
  const duration = calculateAudioDuration(wavBuffer);

  console.log(`Generated audio: ${outputPath} (${duration.toFixed(2)}s)`);

  return {
    audioPath: outputPath,
    duration,
    usageMetadata: result.usageMetadata,
  };
}

/**
 * Generate speech for a script, splitting into chunks if needed.
 * Gemini TTS has a limit on input length.
 */
export async function generateScriptAudio(
  script: string,
  outputPath: string,
  voice: string = VOICES.ALGENIB
): Promise<{ audioPath: string; duration: number; usageMetadata?: UsageMetadata }> {
  // Clean the script
  const cleanScript = script
    .replace(/\[SCENE_BREAK\]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Check if script is short enough for single request
  const MAX_CHARS = 5000; // Conservative limit

  if (cleanScript.length <= MAX_CHARS) {
    return generateSpeech(cleanScript, outputPath, voice);
  }

  // Split into chunks at sentence boundaries
  const sentences = cleanScript.match(/[^.!?]+[.!?]+/g) || [cleanScript];
  const chunks: string[] = [];
  let currentChunk = '';

  for (const sentence of sentences) {
    if ((currentChunk + sentence).length > MAX_CHARS && currentChunk) {
      chunks.push(currentChunk.trim());
      currentChunk = sentence;
    } else {
      currentChunk += sentence;
    }
  }
  if (currentChunk) {
    chunks.push(currentChunk.trim());
  }

  // Generate audio for each chunk
  const audioBuffers: Buffer[] = [];
  let totalDuration = 0;
  // Accumulate usage metadata across chunks
  const accumulatedUsage: UsageMetadata = {
    promptTokenCount: 0,
    candidatesTokenCount: 0,
    totalTokenCount: 0,
  };

  for (let i = 0; i < chunks.length; i++) {
    const chunkPath = outputPath.replace('.wav', `_chunk${i}.wav`);
    const result = await generateSpeech(chunks[i], chunkPath, voice);
    const chunkBuffer = await fs.readFile(chunkPath);
    audioBuffers.push(chunkBuffer);
    totalDuration += result.duration;

    // Accumulate usage
    if (result.usageMetadata) {
      accumulatedUsage.promptTokenCount! += result.usageMetadata.promptTokenCount || 0;
      accumulatedUsage.candidatesTokenCount! += result.usageMetadata.candidatesTokenCount || 0;
      accumulatedUsage.totalTokenCount! += result.usageMetadata.totalTokenCount || 0;
    }

    // Clean up chunk file
    await fs.unlink(chunkPath);
  }

  // Concatenate audio (skip headers for all but first)
  const combinedPcm = Buffer.concat(
    audioBuffers.map((buf, i) => (i === 0 ? buf.slice(44) : buf.slice(44)))
  );

  // Create new WAV with combined PCM
  const firstBuffer = audioBuffers[0];
  const header = firstBuffer.slice(0, 44);
  // Update data size in header
  header.writeUInt32LE(combinedPcm.length, 40);
  header.writeUInt32LE(36 + combinedPcm.length, 4);

  const finalBuffer = Buffer.concat([header, combinedPcm]);
  await fs.writeFile(outputPath, finalBuffer);

  return {
    audioPath: outputPath,
    duration: totalDuration,
    usageMetadata: accumulatedUsage,
  };
}

// Scene-based chunking constant
const SCENES_PER_CHUNK = 50;

/**
 * Generate speech for scenes using scene-based chunking.
 * Chunks by scene count (50 scenes per chunk) instead of character count.
 * Provides predictable chunking and maintains semantic integrity.
 */
export async function generateSceneBasedAudio(
  scenes: Scene[],
  outputPath: string,
  voice: string = VOICES.ALGENIB
): Promise<{ audioPath: string; duration: number; usageMetadata?: UsageMetadata }> {
  // Validate input
  if (!scenes || scenes.length === 0) {
    throw new Error('Scenes array is empty');
  }

  console.log(`\nGenerating audio from scenes with scene-based chunking...`);
  console.log(`Total scenes: ${scenes.length}`);
  console.log(`Total words: ${scenes.reduce((sum, s) => sum + s.wordCount, 0)}`);
  console.log(`Chunks: ${Math.ceil(scenes.length / SCENES_PER_CHUNK)}`);

  // Optimization: If 50 scenes or fewer, use single TTS call
  if (scenes.length <= SCENES_PER_CHUNK) {
    const combinedText = scenes.map(s => s.text).join(' ');
    console.log(`Single chunk: all ${scenes.length} scenes (${combinedText.length} chars)`);
    return generateSpeech(combinedText, outputPath, voice);
  }

  // Multiple chunks needed - process in groups of 50 scenes
  const audioBuffers: Buffer[] = [];
  let totalDuration = 0;
  const accumulatedUsage: UsageMetadata = {
    promptTokenCount: 0,
    candidatesTokenCount: 0,
    totalTokenCount: 0,
  };

  const numChunks = Math.ceil(scenes.length / SCENES_PER_CHUNK);

  for (let i = 0; i < scenes.length; i += SCENES_PER_CHUNK) {
    const chunkIndex = Math.floor(i / SCENES_PER_CHUNK);
    const endIndex = Math.min(i + SCENES_PER_CHUNK, scenes.length);
    const sceneChunk = scenes.slice(i, endIndex);

    // Combine scene text
    const chunkText = sceneChunk.map(s => s.text).join(' ');

    console.log(`Chunk ${chunkIndex + 1}/${numChunks}: scenes ${i}-${endIndex - 1} (${chunkText.length} chars)`);

    // Safety check: warn if chunk exceeds character limit
    if (chunkText.length > 5000) {
      console.warn(`⚠️  Warning: Chunk ${chunkIndex + 1} exceeds 5000 chars (${chunkText.length} chars)`);
    }

    // Generate audio for this chunk
    const chunkPath = outputPath.replace('.wav', `_chunk${chunkIndex}.wav`);
    const result = await generateSpeech(chunkText, chunkPath, voice);

    console.log(`Generated audio: ${chunkPath} (${result.duration.toFixed(2)}s)`);

    // Read chunk buffer
    const chunkBuffer = await fs.readFile(chunkPath);
    audioBuffers.push(chunkBuffer);
    totalDuration += result.duration;

    // Accumulate usage metadata
    if (result.usageMetadata) {
      accumulatedUsage.promptTokenCount! += result.usageMetadata.promptTokenCount || 0;
      accumulatedUsage.candidatesTokenCount! += result.usageMetadata.candidatesTokenCount || 0;
      accumulatedUsage.totalTokenCount! += result.usageMetadata.totalTokenCount || 0;
    }

    // Clean up temporary chunk file
    await fs.unlink(chunkPath);
  }

  // Concatenate audio buffers
  // Skip 44-byte WAV headers for all chunks, combine PCM data
  const combinedPcm = Buffer.concat(
    audioBuffers.map(buf => buf.slice(44))
  );

  // Create new WAV with combined PCM
  const firstBuffer = audioBuffers[0];
  const header = firstBuffer.slice(0, 44);

  // Update data size fields in header
  header.writeUInt32LE(combinedPcm.length, 40); // data chunk size
  header.writeUInt32LE(36 + combinedPcm.length, 4); // file size - 8

  const finalBuffer = Buffer.concat([header, combinedPcm]);
  await fs.writeFile(outputPath, finalBuffer);

  console.log(`Audio generated: ${totalDuration.toFixed(2)}s\n`);

  return {
    audioPath: outputPath,
    duration: totalDuration,
    usageMetadata: accumulatedUsage,
  };
}
