import { UsageMetadata } from '@/ai/nanoBanana';
import {
  buildBatchRequests,
  submitBatch,
  getStyleReferenceBase64,
} from '@/ai/batchImageGen';
import { planBatches, getCharacterAnchors } from '@/utils/batchPlanner';
import {
  updateVideoStatus,
  createStep,
  startStep,
  completeStep,
  failStep,
  getStepByName,
  createAsset,
  getAssetsByType,
  createBatchJob,
} from '@/lib/db';
import { ensureJobDir, listFiles, getFilePath } from '@/utils/fileStore';
import type { Scene, CharacterType } from '@/types';

export interface ImageWorkerInput {
  videoId: string;
  scenes: Scene[];
}

export interface ImageWorkerOutput {
  status: 'complete' | 'waiting_batch';
  imagePaths?: string[];
  imageCount?: number;
  usageMetadata?: UsageMetadata;
  batchPhase?: number;
}

/**
 * Submit image generation as a Gemini Batch API job.
 * Returns immediately after submitting Phase 1 batch — does not block.
 * The batch poller will handle completion and Phase 2 submission.
 */
export async function runImageWorker(input: ImageWorkerInput): Promise<ImageWorkerOutput> {
  const { videoId, scenes } = input;

  // Check if already done
  const existingStep = await getStepByName(videoId, 'images');
  if (existingStep?.status === 'success') {
    console.log('Images already generated, loading from directory...');
    const existingAssets = await getAssetsByType(videoId, 'image');
    if (existingAssets.length >= scenes.length) {
      const imagePaths = existingAssets.map((a: { path: string }) => a.path).sort();
      return {
        status: 'complete',
        imagePaths,
        imageCount: imagePaths.length,
      };
    }
  }

  // Create or get step
  let step = existingStep;
  if (!step) {
    step = await createStep(videoId, 'images');
  }

  try {
    await startStep(step.id);
    await updateVideoStatus(videoId, 'images');

    const jobDir = await ensureJobDir(videoId);

    // Check if all images already exist on disk
    const existingImages = await listFiles(videoId, '^scene_\\d+\\.png$');
    if (existingImages.length >= scenes.length) {
      const allImagePaths = scenes.map((_, i) =>
        getFilePath(videoId, `scene_${i.toString().padStart(3, '0')}.png`)
      );
      await completeStep(step.id);
      return {
        status: 'complete',
        imagePaths: allImagePaths,
        imageCount: allImagePaths.length,
      };
    }

    // Plan batches
    const plan = planBatches(scenes);
    console.log(`[imageWorker] Batch plan: Phase 1 = ${plan.phase1.length} scenes, Phase 2 = ${plan.phase2.length} scenes`);

    // Get style reference
    const styleRefBase64 = getStyleReferenceBase64();

    // Build Phase 1 requests (no reference images needed)
    const emptyRefs = new Map<number, string>();
    const emptyAnchors = new Map<CharacterType, string>();
    const phase1Requests = buildBatchRequests(
      scenes,
      plan.phase1,
      emptyRefs,
      emptyAnchors,
      styleRefBase64
    );

    // Submit Phase 1 batch
    const batchName = await submitBatch(
      phase1Requests,
      `video-${videoId}-phase1`
    );

    console.log(`[imageWorker] Phase 1 batch submitted: ${batchName}`);

    // Store batch job record in DB
    await createBatchJob({
      videoId,
      phase: 1,
      batchName,
      sceneIndices: plan.phase1,
    });

    // Also store the batch plan for Phase 2 use
    const { saveJson } = await import('@/utils/fileStore');
    await saveJson(videoId, 'batch_plan.json', {
      phase1: plan.phase1,
      phase2: plan.phase2,
      phase2References: Array.from(plan.phase2References.entries()),
    });

    // Update video status
    await updateVideoStatus(videoId, 'images_batch1');

    // Create the batch1 step
    const batch1Step = await createStep(videoId, 'images_batch1');
    await startStep(batch1Step.id);

    return {
      status: 'waiting_batch',
      batchPhase: 1,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    await failStep(step.id, errorMessage);
    await updateVideoStatus(videoId, 'failed');
    throw error;
  }
}
