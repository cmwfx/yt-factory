import { generateSpeech, generateScriptAudio, generateSceneBasedAudio, VOICES, UsageMetadata } from '@/ai/geminiTTS';
import {
  updateVideoStatus,
  createStep,
  startStep,
  completeStep,
  failStep,
  getStepByName,
  createAsset,
  getAssetsByType,
} from '@/lib/db';
import { getFilePath, fileExists, ensureJobDir, saveJson } from '@/utils/fileStore';
import { concatenateAudioFiles } from '@/utils/ffmpeg';
import type { Scene } from '@/types';
import fs from 'fs/promises';
import path from 'path';

export interface AudioWorkerInput {
  videoId: string;
  script: string;  // Not used in new approach (kept for backwards compatibility)
  scenes: Scene[];
}

export interface AudioWorkerOutput {
  audioPath: string;
  duration: number;
  sceneDurations: number[];
  sceneAudioPaths: string[];
  usageMetadata?: UsageMetadata;
}

/**
 * Generate audio per scene, then concatenate into a single file.
 */
export async function runAudioWorker(input: AudioWorkerInput): Promise<AudioWorkerOutput> {
  const { videoId, scenes } = input;

  // Check if already done
  const existingStep = await getStepByName(videoId, 'audio');
  if (existingStep?.status === 'success') {
    console.log('Audio already generated, loading from file...');
    const existingAssets = await getAssetsByType(videoId, 'audio');
    if (existingAssets.length > 0) {
      const metadata = existingAssets[0].metadata as { duration?: number; sceneDurations?: number[]; sceneAudioPaths?: string[] };
      // Try to load persisted sceneDurations; fall back to empty (triggers transcription-based alignment)
      const sceneDurations = metadata?.sceneDurations
        ?? (await loadSceneDurations(videoId))
        ?? [];
      const sceneAudioPaths = metadata?.sceneAudioPaths
        ?? (await loadSceneAudioPaths(videoId))
        ?? [];
      return {
        audioPath: existingAssets[0].path,
        duration: metadata?.duration || 0,
        sceneDurations,
        sceneAudioPaths,
      };
    }
  }

  // Check if audio file exists (resume case — no scene durations available)
  const audioFilename = 'audio.wav';
  if (await fileExists(videoId, audioFilename)) {
    console.log('Audio file exists, skipping generation...');
    const audioPath = getFilePath(videoId, audioFilename);
    const sceneDurations = await loadSceneDurations(videoId) ?? [];
    const sceneAudioPaths = await loadSceneAudioPaths(videoId) ?? [];
    return {
      audioPath,
      duration: 0,
      sceneDurations,
      sceneAudioPaths,
    };
  }

  // Create or get step
  let step = existingStep;
  if (!step) {
    step = await createStep(videoId, 'audio');
  }

  try {
    await startStep(step.id);
    await updateVideoStatus(videoId, 'audio');

    const audioPath = getFilePath(videoId, audioFilename);

    // Generate audio using scene-based chunking (50 scenes per chunk)
    const result = await generateSceneBasedAudio(scenes, audioPath, VOICES.CHARON);

    const totalDuration = result.duration;

    // Create asset record (no sceneDurations in this approach - alignment uses transcription)
    await createAsset(videoId, 'audio', audioFilename, audioPath, {
      duration: totalDuration,
      voice: VOICES.CHARON,
    });

    await completeStep(step.id);

    return {
      audioPath,
      duration: totalDuration,
      sceneDurations: [],  // Not used in sequential matching approach
      sceneAudioPaths: [],
      usageMetadata: result.usageMetadata,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    await failStep(step.id, errorMessage);
    await updateVideoStatus(videoId, 'failed');
    throw error;
  }
}

/**
 * Try to load persisted scene durations (used during resume).
 */
async function loadSceneDurations(videoId: string): Promise<number[] | null> {
  const { loadJson } = await import('@/utils/fileStore');
  return loadJson<number[]>(videoId, 'scene_durations.json');
}

/**
 * Try to load persisted scene audio paths (used during resume).
 */
async function loadSceneAudioPaths(videoId: string): Promise<string[] | null> {
  const { loadJson } = await import('@/utils/fileStore');
  return loadJson<string[]>(videoId, 'scene_audio_paths.json');
}
