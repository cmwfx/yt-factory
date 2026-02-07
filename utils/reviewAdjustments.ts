import type { AlignedScene, TranscriptionResult } from '@/types';

/**
 * Find the word index at a given time in the transcription.
 */
function findWordIndexAtTime(words: any[], timeInSeconds: number): number {
  const timeInMs = timeInSeconds * 1000;
  for (let i = 0; i < words.length; i++) {
    if (words[i].start <= timeInMs && words[i].end >= timeInMs) {
      return i;
    }
  }
  return -1;
}

/**
 * Adjust scene word boundaries by moving words between scenes.
 * wordDelta: +1 means add one word to this scene (take from next scene)
 * wordDelta: -1 means remove one word from this scene (give to next scene)
 */
export function adjustSceneWords(
  alignedScenes: AlignedScene[],
  transcription: TranscriptionResult,
  sceneIndex: number,
  wordDelta: number
): AlignedScene[] {
  const result = [...alignedScenes];
  const scene = result[sceneIndex];

  if (!transcription?.words) {
    console.warn('No transcription available for word adjustment');
    return result;
  }

  // Find current word boundaries
  const currentEndWordIndex = findWordIndexAtTime(transcription.words, scene.endTime);

  if (currentEndWordIndex === -1) {
    console.warn('Could not find word at scene end time');
    return result;
  }

  // Calculate new end word index
  const newEndWordIndex = currentEndWordIndex + wordDelta;

  // Validate bounds
  if (newEndWordIndex < 0 || newEndWordIndex >= transcription.words.length) {
    console.warn('Word adjustment out of bounds');
    return result;
  }

  // Get new end time from transcription
  const newEndTime = transcription.words[newEndWordIndex].end / 1000;

  // Update current scene
  result[sceneIndex] = {
    ...scene,
    endTime: newEndTime,
    duration: newEndTime - scene.startTime,
  };

  // Update next scene start time (if exists)
  if (sceneIndex + 1 < result.length) {
    const nextScene = result[sceneIndex + 1];
    result[sceneIndex + 1] = {
      ...nextScene,
      startTime: newEndTime,
      duration: nextScene.endTime - newEndTime,
    };
  }

  return result;
}
