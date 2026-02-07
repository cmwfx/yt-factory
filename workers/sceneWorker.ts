import { breakdownScript, limitScenesForTest } from '@/ai/geminiScenes';
import {
  updateVideoStatus,
  createStep,
  startStep,
  completeStep,
  failStep,
  getStepByName,
} from '@/lib/db';
import { saveJson, loadJson } from '@/utils/fileStore';
import { env } from '@/lib/env';
import type { UsageMetadata } from '@/lib/costTracker';
import type { Scene } from '@/types';

export interface SceneWorkerInput {
  videoId: string;
  script: string;
}

export interface SceneWorkerOutput {
  scenes: Scene[];
  sceneCount: number;
  metaPath: string;
  usageMetadata?: UsageMetadata;
}

/**
 * Break down a script into visual scenes.
 */
export async function runSceneWorker(input: SceneWorkerInput): Promise<SceneWorkerOutput> {
  const { videoId, script } = input;

  // Check if already done
  const existingStep = await getStepByName(videoId, 'scenes');
  if (existingStep?.status === 'success') {
    console.log('Scenes already generated, loading from file...');
    const scenes = await loadJson<Scene[]>(videoId, 'scene_meta.json');
    if (scenes) {
      return {
        scenes,
        sceneCount: scenes.length,
        metaPath: `./public/jobs/${videoId}/scene_meta.json`,
      };
    }
  }

  // Create or get step
  let step = existingStep;
  if (!step) {
    step = await createStep(videoId, 'scenes');
  }

  try {
    await startStep(step.id);
    await updateVideoStatus(videoId, 'scenes');

    console.log('Breaking down script into scenes...');

    // Debug: Check script input
    const sceneBreakCount = (script.match(/\[SCENE_BREAK\]/gi) || []).length;
    console.log('[DEBUG sceneWorker] Script length:', script.length);
    console.log('[DEBUG sceneWorker] Scene breaks in script:', sceneBreakCount);

    if (sceneBreakCount === 0) {
      console.error('[DEBUG sceneWorker] ERROR: Script has no [SCENE_BREAK] markers!');
      console.error('[DEBUG sceneWorker] Script content:', script.slice(0, 500));
      throw new Error('Script does not contain any [SCENE_BREAK] markers. Cannot generate scenes.');
    }

    // Generate scenes
    const { scenes: rawScenes, usageMetadata } = await breakdownScript(script);
    let scenes = rawScenes;

    console.log(`Generated ${scenes.length} scenes`);

    // Limit scenes in test mode
    if (env.TEST_MODE) {
      scenes = limitScenesForTest(scenes, 3);
      console.log(`Test mode: limited to ${scenes.length} scenes`);
    }

    // Save to file
    const metaPath = await saveJson(videoId, 'scene_meta.json', scenes);

    await completeStep(step.id);

    return {
      scenes,
      sceneCount: scenes.length,
      metaPath,
      usageMetadata,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    await failStep(step.id, errorMessage);
    await updateVideoStatus(videoId, 'failed');
    throw error;
  }
}
