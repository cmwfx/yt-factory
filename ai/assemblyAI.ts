import { env } from '@/lib/env';
import { withRetry, sleep } from '@/utils/retry';
import fs from 'fs/promises';
import type { TranscriptionResult, WordTimestamp } from '@/types';

const ASSEMBLYAI_API_URL = 'https://api.assemblyai.com/v2';

interface AssemblyAIWord {
  text: string;
  start: number;
  end: number;
  confidence: number;
}

interface AssemblyAITranscript {
  id: string;
  status: 'queued' | 'processing' | 'completed' | 'error';
  text: string | null;
  words: AssemblyAIWord[] | null;
  error: string | null;
  audio_duration: number | null; // Duration in seconds for cost tracking
}

/**
 * Upload an audio file to AssemblyAI.
 */
async function uploadAudio(audioPath: string): Promise<string> {
  const audioData = await fs.readFile(audioPath);

  const response = await fetch(`${ASSEMBLYAI_API_URL}/upload`, {
    method: 'POST',
    headers: {
      Authorization: env.ASSEMBLYAI_API_KEY,
      'Content-Type': 'application/octet-stream',
    },
    body: audioData,
  });

  if (!response.ok) {
    throw new Error(`Upload failed: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  return data.upload_url;
}

/**
 * Request a transcription from AssemblyAI.
 */
async function requestTranscription(audioUrl: string): Promise<string> {
  const response = await fetch(`${ASSEMBLYAI_API_URL}/transcript`, {
    method: 'POST',
    headers: {
      Authorization: env.ASSEMBLYAI_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      audio_url: audioUrl,
      word_boost: [],
      boost_param: 'default',
    }),
  });

  if (!response.ok) {
    throw new Error(`Transcription request failed: ${response.status}`);
  }

  const data = await response.json();
  return data.id;
}

/**
 * Poll for transcription completion.
 */
async function pollTranscription(transcriptId: string): Promise<AssemblyAITranscript> {
  const maxAttempts = 60; // 5 minutes max
  const pollInterval = 5000; // 5 seconds

  for (let i = 0; i < maxAttempts; i++) {
    const response = await fetch(`${ASSEMBLYAI_API_URL}/transcript/${transcriptId}`, {
      headers: {
        Authorization: env.ASSEMBLYAI_API_KEY,
      },
    });

    if (!response.ok) {
      throw new Error(`Poll failed: ${response.status}`);
    }

    const data: AssemblyAITranscript = await response.json();

    if (data.status === 'completed') {
      return data;
    }

    if (data.status === 'error') {
      throw new Error(`Transcription error: ${data.error}`);
    }

    console.log(`Transcription status: ${data.status} (attempt ${i + 1}/${maxAttempts})`);
    await sleep(pollInterval);
  }

  throw new Error('Transcription timed out');
}

/**
 * Transcribe an audio file with word-level timestamps.
 */
export async function transcribeAudio(audioPath: string): Promise<TranscriptionResult & { audioDuration: number }> {
  console.log(`Transcribing audio: ${audioPath}`);

  // Step 1: Upload audio
  const uploadUrl = await withRetry(
    () => uploadAudio(audioPath),
    {
      maxAttempts: 3,
      onRetry: (error, attempt) => {
        console.log(`Upload retry ${attempt}: ${error.message}`);
      },
    }
  );
  console.log('Audio uploaded successfully');

  // Step 2: Request transcription
  const transcriptId = await withRetry(
    () => requestTranscription(uploadUrl),
    { maxAttempts: 3 }
  );
  console.log(`Transcription started: ${transcriptId}`);

  // Step 3: Poll for completion
  const transcript = await pollTranscription(transcriptId);

  if (!transcript.words || !transcript.text) {
    throw new Error('Transcription completed but no words/text returned');
  }

  // Convert to our format
  const words: WordTimestamp[] = transcript.words.map(w => ({
    word: w.text,
    start: w.start,
    end: w.end,
    confidence: w.confidence,
  }));

  console.log(`Transcription complete: ${words.length} words, duration: ${transcript.audio_duration}s`);

  return {
    words,
    text: transcript.text,
    audioDuration: transcript.audio_duration || 0,
  };
}

/**
 * Check if AssemblyAI API key is valid.
 */
export async function checkApiKey(): Promise<boolean> {
  try {
    const response = await fetch(`${ASSEMBLYAI_API_URL}/transcript`, {
      method: 'GET',
      headers: {
        Authorization: env.ASSEMBLYAI_API_KEY,
      },
    });
    return response.status !== 401;
  } catch {
    return false;
  }
}
