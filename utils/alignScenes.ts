import type { Scene, AlignedScene, WordTimestamp, TranscriptionResult } from '@/types';
import { calculateWordMatchPercentage, findBestWordCount } from './fuzzyMatch';

const MIN_SCENE_DURATION = 1.0; // seconds
const MAX_SCENE_DURATION = 6.0; // seconds

export const ALIGNMENT_CONFIG = {
  MATCH_THRESHOLD: 75,          // Minimum fuzzy match % to accept (75-90 recommended)
  MIN_SCENE_DURATION: 0.5,      // Minimum scene duration in seconds
  WORD_COUNT_TOLERANCE: 0.2,    // Allow 20% deviation in word count
};

/**
 * Normalize text for comparison by removing punctuation and converting to lowercase.
 */
function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Split text into normalized words.
 */
function getWords(text: string): string[] {
  return normalizeText(text).split(' ').filter(Boolean);
}

/**
 * Find the index in the words array where a scene's text starts.
 * Uses fuzzy matching to handle transcription differences.
 */
function findSceneStartIndex(
  sceneWords: string[],
  transcriptWords: string[],
  searchStartIndex: number
): number {
  if (sceneWords.length === 0) return searchStartIndex;

  const firstWord = sceneWords[0];
  const searchWindow = Math.min(50, transcriptWords.length - searchStartIndex);

  for (let i = 0; i < searchWindow; i++) {
    const idx = searchStartIndex + i;
    if (idx >= transcriptWords.length) break;

    if (transcriptWords[idx] === firstWord) {
      // Verify next few words match as well
      let matches = 1;
      for (let j = 1; j < Math.min(3, sceneWords.length); j++) {
        if (
          idx + j < transcriptWords.length &&
          transcriptWords[idx + j] === sceneWords[j]
        ) {
          matches++;
        }
      }
      if (matches >= Math.min(2, sceneWords.length)) {
        return idx;
      }
    }
  }

  // Fallback: return the search start index
  return searchStartIndex;
}

/**
 * Align scenes with transcription timestamps.
 * Returns scenes with accurate start/end times based on word-level timestamps.
 */
export function alignScenes(
  scenes: Scene[],
  transcription: TranscriptionResult,
  imagePaths: string[]
): AlignedScene[] {
  const transcriptWords = transcription.words;
  const normalizedTranscript = transcriptWords.map(w => normalizeText(w.word));

  const alignedScenes: AlignedScene[] = [];
  let currentWordIndex = 0;

  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    const sceneWords = getWords(scene.text);

    // Find where this scene starts in the transcript
    const startWordIndex = findSceneStartIndex(
      sceneWords,
      normalizedTranscript,
      currentWordIndex
    );

    // Calculate end word index based on word count
    const endWordIndex = Math.min(
      startWordIndex + sceneWords.length - 1,
      transcriptWords.length - 1
    );

    // Get timestamps
    const startTime =
      startWordIndex < transcriptWords.length
        ? transcriptWords[startWordIndex].start / 1000 // Convert ms to seconds
        : alignedScenes.length > 0
        ? alignedScenes[alignedScenes.length - 1].endTime
        : 0;

    const endTime =
      endWordIndex < transcriptWords.length
        ? transcriptWords[endWordIndex].end / 1000
        : startTime + scene.suggestedDuration;

    let duration = endTime - startTime;

    // Clamp duration to min/max
    if (duration < MIN_SCENE_DURATION) {
      duration = MIN_SCENE_DURATION;
    } else if (duration > MAX_SCENE_DURATION) {
      duration = MAX_SCENE_DURATION;
    }

    const imagePath = imagePaths[i] || imagePaths[imagePaths.length - 1] || '';

    alignedScenes.push({
      ...scene,
      startTime,
      endTime: startTime + duration,
      duration,
      imagePath,
    });

    // Move to next word position for next scene
    currentWordIndex = endWordIndex + 1;
  }

  // Ensure scenes don't overlap and fill gaps
  for (let i = 1; i < alignedScenes.length; i++) {
    const prevScene = alignedScenes[i - 1];
    const currentScene = alignedScenes[i];

    if (currentScene.startTime < prevScene.endTime) {
      // Adjust current scene to start where previous ends
      const adjustment = prevScene.endTime - currentScene.startTime;
      alignedScenes[i] = {
        ...currentScene,
        startTime: prevScene.endTime,
        endTime: currentScene.endTime + adjustment,
      };
    } else if (currentScene.startTime > prevScene.endTime) {
      // Fill gap by extending previous scene
      const gap = currentScene.startTime - prevScene.endTime;
      alignedScenes[i - 1] = {
        ...prevScene,
        endTime: currentScene.startTime,
        duration: prevScene.duration + gap,
      };
    }
  }

  // Extend first scene back to t=0 if audio starts with a pause
  if (alignedScenes.length > 0 && alignedScenes[0].startTime > 0) {
    alignedScenes[0] = {
      ...alignedScenes[0],
      duration: alignedScenes[0].duration + alignedScenes[0].startTime,
      startTime: 0,
    };
  }

  return alignedScenes;
}

/**
 * Merge very short consecutive scenes if their combined duration is reasonable.
 */
export function mergeShortScenes(
  scenes: AlignedScene[],
  minDuration = 2.0
): AlignedScene[] {
  const merged: AlignedScene[] = [];

  for (const scene of scenes) {
    if (merged.length === 0) {
      merged.push(scene);
      continue;
    }

    const lastScene = merged[merged.length - 1];

    // If last scene is very short and combined duration is reasonable
    if (
      lastScene.duration < minDuration &&
      lastScene.duration + scene.duration <= MAX_SCENE_DURATION
    ) {
      // Merge with previous scene
      merged[merged.length - 1] = {
        ...lastScene,
        text: lastScene.text + ' ' + scene.text,
        wordCount: lastScene.wordCount + scene.wordCount,
        endTime: scene.endTime,
        duration: lastScene.duration + scene.duration,
      };
    } else {
      merged.push(scene);
    }
  }

  return merged;
}

/**
 * Align scenes using directly measured per-scene audio durations.
 * No transcription word-matching needed — timing is a simple running sum.
 */
export function alignFromDurations(
  scenes: Scene[],
  durations: number[],
  imagePaths: string[]
): AlignedScene[] {
  const aligned: AlignedScene[] = [];
  let currentTime = 0;

  for (let i = 0; i < scenes.length; i++) {
    const duration = durations[i] ?? durations[durations.length - 1] ?? 1;
    const imagePath = imagePaths[i] ?? imagePaths[imagePaths.length - 1] ?? '';

    aligned.push({
      ...scenes[i],
      startTime: currentTime,
      endTime: currentTime + duration,
      duration,
      imagePath,
    });

    currentTime += duration;
  }

  return aligned;
}

/**
 * Calculate total duration from aligned scenes.
 */
export function getTotalDuration(scenes: AlignedScene[]): number {
  if (scenes.length === 0) return 0;
  return scenes[scenes.length - 1].endTime;
}

export interface AlignmentResult {
  alignedScenes: AlignedScene[];
  failedScenes: number[];  // Indices of scenes that failed to match
  averageMatchScore: number;
}

/**
 * Align scenes using sequential word consumption with fuzzy matching.
 * Processes scenes in order, consuming words from transcription as it goes.
 */
export function alignScenesSequential(
  scenes: Scene[],
  transcription: TranscriptionResult,
  imagePaths: string[],
  matchThreshold: number = ALIGNMENT_CONFIG.MATCH_THRESHOLD
): AlignmentResult {
  const alignedScenes: AlignedScene[] = [];
  const failedScenes: number[] = [];
  let totalMatchScore = 0;

  // Working copy of transcription words (will consume as we go)
  let remainingWords = [...transcription.words];

  console.log(`Starting sequential alignment with ${scenes.length} scenes, ${remainingWords.length} transcribed words`);

  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    const sceneWordCount = scene.wordCount;

    // Safety check: ensure we have enough words remaining
    if (remainingWords.length === 0) {
      console.warn(`Scene ${i} has no remaining words. Using fallback timing.`);
      const prevEndTime = alignedScenes.length > 0
        ? alignedScenes[alignedScenes.length - 1].endTime
        : 0;
      const imagePath = imagePaths[i] ?? imagePaths[imagePaths.length - 1] ?? '';

      alignedScenes.push({
        ...scene,
        startTime: prevEndTime,
        endTime: prevEndTime + scene.suggestedDuration,
        duration: scene.suggestedDuration,
        imagePath,
      });
      failedScenes.push(i);
      continue;
    }

    if (remainingWords.length < sceneWordCount) {
      console.warn(
        `Scene ${i} expects ${sceneWordCount} words but only ${remainingWords.length} remain. Using all remaining.`
      );
    }

    // Find best word count in tolerance window
    const bestMatch = findBestWordCount(
      scene.text,
      remainingWords.map(w => w.word),
      sceneWordCount,
      ALIGNMENT_CONFIG.WORD_COUNT_TOLERANCE
    );

    const matchPercentage = bestMatch.score;
    totalMatchScore += matchPercentage;

    const wordCount = bestMatch.count;
    const sceneWords = remainingWords.slice(0, wordCount);

    console.log(
      `Scene ${i}: "${scene.text.slice(0, 40)}..." | ` +
      `Match: ${matchPercentage}% | ` +
      `Expected: ${sceneWordCount} words, Used: ${wordCount} words`
    );

    // Check if match is acceptable
    if (matchPercentage < matchThreshold) {
      console.warn(`Scene ${i} match below threshold (${matchPercentage}% < ${matchThreshold}%)`);
      failedScenes.push(i);
    }

    // Extract timing from matched words
    const startTime = sceneWords.length > 0 ? sceneWords[0].start / 1000 : 0;  // Convert ms to seconds
    const endTime = sceneWords.length > 0
      ? sceneWords[sceneWords.length - 1].end / 1000
      : startTime;
    let duration = endTime - startTime;

    // Ensure minimum duration
    if (duration < ALIGNMENT_CONFIG.MIN_SCENE_DURATION) {
      duration = ALIGNMENT_CONFIG.MIN_SCENE_DURATION;
    }

    // Create aligned scene
    const imagePath = imagePaths[i] ?? imagePaths[imagePaths.length - 1] ?? '';
    alignedScenes.push({
      ...scene,
      startTime,
      endTime: startTime + duration,
      duration,
      imagePath,
    });

    // **Remove consumed words from remaining array**
    remainingWords = remainingWords.slice(wordCount);
  }

  const averageMatchScore = scenes.length > 0 ? totalMatchScore / scenes.length : 0;

  console.log(`Sequential alignment complete. Average match: ${averageMatchScore.toFixed(1)}%`);
  if (failedScenes.length > 0) {
    console.warn(`Failed scenes (${failedScenes.length}/${scenes.length}): ${failedScenes.join(', ')}`);
  }

  return {
    alignedScenes,
    failedScenes,
    averageMatchScore,
  };
}
