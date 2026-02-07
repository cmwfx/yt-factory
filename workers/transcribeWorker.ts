import { transcribeAudio } from '@/ai/assemblyAI';
import {
  createStep,
  startStep,
  completeStep,
  failStep,
  getStepByName,
  createAsset,
  getAssetsByType,
} from '@/lib/db';
import { saveJson, loadJson, getFilePath } from '@/utils/fileStore';
import type { TranscriptionResult } from '@/types';

export interface TranscribeWorkerInput {
  videoId: string;
  audioPath: string;
}

export interface TranscribeWorkerOutput {
  transcription: TranscriptionResult;
  captionsPath: string;
  audioDuration: number; // Duration in seconds for cost tracking
}

/**
 * Transcribe audio to get word-level timestamps.
 */
export async function runTranscribeWorker(input: TranscribeWorkerInput): Promise<TranscribeWorkerOutput> {
  const { videoId, audioPath } = input;

  // Check if already done
  const existingStep = await getStepByName(videoId, 'transcribe');
  if (existingStep?.status === 'success') {
    console.log('Transcription already done, loading from file...');
    const transcription = await loadJson<TranscriptionResult & { audioDuration?: number }>(videoId, 'captions.json');
    if (transcription) {
      return {
        transcription,
        captionsPath: getFilePath(videoId, 'captions.json'),
        audioDuration: transcription.audioDuration || 0,
      };
    }
  }

  // Create or get step
  let step = existingStep;
  if (!step) {
    step = await createStep(videoId, 'transcribe');
  }

  try {
    await startStep(step.id);

    console.log('Transcribing audio...');

    // Transcribe
    const transcription = await transcribeAudio(audioPath);

    console.log(`Transcription complete: ${transcription.words.length} words`);

    // Save to file
    const captionsPath = await saveJson(videoId, 'captions.json', transcription);

    // Create asset record
    await createAsset(videoId, 'captions', 'captions.json', captionsPath, {
      wordCount: transcription.words.length,
    });

    await completeStep(step.id);

    return {
      transcription,
      captionsPath,
      audioDuration: transcription.audioDuration,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    await failStep(step.id, errorMessage);
    throw error;
  }
}
