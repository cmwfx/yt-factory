import type { Scene, CharacterType } from '@/types';

export interface BatchPlan {
  phase1: number[];  // Scene indices for Phase 1 (no generated-image dependencies)
  phase2: number[];  // Scene indices for Phase 2 (need Phase 1 images as refs)
  phase2References: Map<number, number>; // sceneIndex → best Phase 1 scene to use as reference
}

/**
 * Analyze scene dependencies and plan two batch phases.
 *
 * Phase 1: Scenes where visualType is NEW_SCENE AND all characters are first appearances
 * Phase 2: Everything else (CHARACTER_REACTION, OBJECT_FOCUS, or scenes referencing earlier images)
 *
 * This ensures Phase 1 images can be generated independently (no inter-image references),
 * and Phase 2 images can reference Phase 1 results for consistency.
 */
export function planBatches(scenes: Scene[]): BatchPlan {
  const phase1: number[] = [];
  const phase2: number[] = [];
  const phase2References = new Map<number, number>();

  // Track which characters first appear in which scene
  const characterFirstScene = new Map<CharacterType, number>();

  // First pass: determine character first appearances
  for (const scene of scenes) {
    for (const char of scene.characters || []) {
      if (!characterFirstScene.has(char)) {
        characterFirstScene.set(char, scene.sceneIndex);
      }
    }
  }

  // Second pass: classify scenes
  for (const scene of scenes) {
    const idx = scene.sceneIndex;
    const visualType = scene.visualType || 'NEW_SCENE';

    // Phase 1 criteria: NEW_SCENE with no reference to already-generated images
    // and all characters in this scene are appearing for the first time here
    const hasNoRef = scene.referenceImageIndex === null || scene.referenceImageIndex === -1;
    const allCharsFirstAppear = (scene.characters || []).every(
      char => characterFirstScene.get(char) === idx
    );

    if (visualType === 'NEW_SCENE' && hasNoRef && allCharsFirstAppear) {
      phase1.push(idx);
    } else {
      phase2.push(idx);
    }
  }

  // Third pass: compute best Phase 1 reference for each Phase 2 scene
  for (const idx of phase2) {
    const scene = scenes[idx];
    let bestRef = -1;

    // If explicit referenceImageIndex points to a Phase 1 scene, use it
    if (scene.referenceImageIndex !== null && scene.referenceImageIndex >= 0) {
      if (phase1.includes(scene.referenceImageIndex)) {
        bestRef = scene.referenceImageIndex;
      } else {
        // referenceImageIndex points to another Phase 2 scene — find nearest Phase 1 before it
        bestRef = findNearestPhase1Before(scene.referenceImageIndex, phase1);
      }
    }

    // Fallback: find nearest Phase 1 NEW_SCENE before this scene
    if (bestRef === -1) {
      bestRef = findNearestPhase1Before(idx, phase1);
    }

    // Last resort: use the first Phase 1 scene
    if (bestRef === -1 && phase1.length > 0) {
      bestRef = phase1[0];
    }

    if (bestRef >= 0) {
      phase2References.set(idx, bestRef);
    }
  }

  return { phase1, phase2, phase2References };
}

function findNearestPhase1Before(targetIdx: number, phase1: number[]): number {
  let best = -1;
  for (const p1Idx of phase1) {
    if (p1Idx < targetIdx) {
      best = p1Idx;
    }
  }
  return best;
}

/**
 * Find character anchor images from Phase 1 results.
 * Returns a map of character → Phase 1 scene index where that character first appears.
 */
export function getCharacterAnchors(
  scenes: Scene[],
  phase1: number[]
): Map<CharacterType, number> {
  const anchors = new Map<CharacterType, number>();
  for (const idx of phase1) {
    const scene = scenes[idx];
    for (const char of scene.characters || []) {
      if (!anchors.has(char)) {
        anchors.set(char, idx);
      }
    }
  }
  return anchors;
}
