import { alignScenes, mergeShortScenes, alignFromDurations, alignScenesSequential } from '@/utils/alignScenes';
import {
  updateVideoStatus,
  createStep,
  startStep,
  completeStep,
  failStep,
  getStepByName,
} from '@/lib/db';
import { saveJson, loadJson } from '@/utils/fileStore';
import type { Scene, TranscriptionResult, AlignedScene } from '@/types';

export interface AlignWorkerInput {
  videoId: string;
  scenes: Scene[];
  transcription: TranscriptionResult;
  imagePaths: string[];
  sceneDurations?: number[];
  sceneAudioPaths?: string[];
}

export interface AlignWorkerOutput {
  alignedScenes: AlignedScene[];
  totalDuration: number;
  alignedMetaPath: string;
  averageMatchScore?: number;
  failedScenes?: number[];
}

/**
 * Align scenes with audio timing.
 * If sceneDurations is provided (per-scene TTS path), uses direct duration sums.
 * Otherwise falls back to transcription word-matching (legacy / resume path).
 */
export async function runAlignWorker(input: AlignWorkerInput): Promise<AlignWorkerOutput> {
  const { videoId, scenes, transcription, imagePaths, sceneDurations, sceneAudioPaths } = input;

  // Check if already done
  const existingStep = await getStepByName(videoId, 'align');
  if (existingStep?.status === 'success') {
    console.log('Alignment already done, loading from file...');
    const alignedScenes = await loadJson<AlignedScene[]>(videoId, 'scene_meta_aligned.json');
    if (alignedScenes) {
      const totalDuration = alignedScenes.length > 0
        ? alignedScenes[alignedScenes.length - 1].endTime
        : 0;
      return {
        alignedScenes,
        totalDuration,
        alignedMetaPath: `./public/jobs/${videoId}/scene_meta_aligned.json`,
      };
    }
  }

  // Create or get step
  let step = existingStep;
  if (!step) {
    step = await createStep(videoId, 'align');
  }

  try {
    await startStep(step.id);
    await updateVideoStatus(videoId, 'align');

    let alignedScenes: AlignedScene[];
    let averageMatchScore: number | undefined;
    let failedScenes: number[] | undefined;

    if (sceneDurations && sceneDurations.length > 0) {
      // PRIORITY 1: Use measured durations if available (most accurate)
      console.log('Aligning scenes from measured per-scene durations...');
      alignedScenes = alignFromDurations(scenes, sceneDurations, imagePaths);
      console.log(`Duration-based alignment: ${alignedScenes.length} scenes`);
    } else {
      // PRIORITY 2: Use sequential word consumption with fuzzy matching
      console.log('Using sequential word consumption with fuzzy matching...');
      const result = alignScenesSequential(scenes, transcription, imagePaths, 75);

      alignedScenes = result.alignedScenes;
      averageMatchScore = result.averageMatchScore;
      failedScenes = result.failedScenes;

      console.log(`Average match score: ${result.averageMatchScore.toFixed(1)}%`);

      if (result.failedScenes.length > 0) {
        console.warn(
          `${result.failedScenes.length} scenes had low match scores: ${result.failedScenes.join(', ')}`
        );
      }

      // If too many scenes failed, warn user
      if (result.failedScenes.length > scenes.length * 0.2) {
        console.error(
          `WARNING: ${((result.failedScenes.length / scenes.length) * 100).toFixed(0)}% ` +
          `of scenes had poor matches. Alignment may be inaccurate.`
        );
      }
    }

    // Add audio paths to aligned scenes if available
    if (sceneAudioPaths && sceneAudioPaths.length > 0) {
      alignedScenes = alignedScenes.map((scene, i) => ({
        ...scene,
        audioPath: sceneAudioPaths[i] ?? sceneAudioPaths[sceneAudioPaths.length - 1],
      }));
    }

    // Calculate total duration
    const totalDuration = alignedScenes.length > 0
      ? alignedScenes[alignedScenes.length - 1].endTime
      : 0;

    console.log(`Total video duration: ${totalDuration.toFixed(2)}s`);

    // Save to file
    const alignedMetaPath = await saveJson(videoId, 'scene_meta_aligned.json', alignedScenes);

    await completeStep(step.id);

    return {
      alignedScenes,
      totalDuration,
      alignedMetaPath,
      averageMatchScore,
      failedScenes,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    await failStep(step.id, errorMessage);
    await updateVideoStatus(videoId, 'failed');
    throw error;
  }
}
