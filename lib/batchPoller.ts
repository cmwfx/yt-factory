import {
  getPendingBatchJobs,
  updateBatchJobStatus,
  updateVideoStatus,
  createBatchJob,
  createStep,
  startStep,
  completeStep,
  failStep,
  getStepByName,
  createAsset,
  getAssetsByType,
  getVideo,
} from '@/lib/db';
import {
  checkBatchStatus,
  downloadBatchResults,
  buildBatchRequests,
  submitBatch,
  readImageAsBase64,
  getStyleReferenceBase64,
} from '@/ai/batchImageGen';
import { getCharacterAnchors } from '@/utils/batchPlanner';
import { loadJson, ensureJobDir, getFilePath, listFiles } from '@/utils/fileStore';
import { sendTelegramMessage } from '@/lib/telegram';
import type { Scene, CharacterType } from '@/types';

let pollerInterval: ReturnType<typeof setInterval> | null = null;

export function startBatchPoller() {
  if (pollerInterval) return;
  console.log('[batchPoller] Starting batch poller (every 60s)');
  pollerInterval = setInterval(pollBatches, 60_000);
  // Also run once immediately
  pollBatches();
}

export function stopBatchPoller() {
  if (pollerInterval) {
    clearInterval(pollerInterval);
    pollerInterval = null;
  }
}

async function pollBatches() {
  try {
    const pendingJobs = await getPendingBatchJobs();
    if (pendingJobs.length === 0) return;

    console.log(`[batchPoller] Checking ${pendingJobs.length} pending batch jobs...`);

    for (const job of pendingJobs) {
      try {
        const status = await checkBatchStatus(job.batchName);
        console.log(`[batchPoller] Batch ${job.batchName} (phase ${job.phase}): ${status.state}`);

        if (status.state === 'JOB_STATE_SUCCEEDED' || status.state === 'BATCH_STATE_SUCCEEDED' || status.state === 'STATE_SUCCEEDED') {
          await handleBatchSuccess(job);
        } else if (status.state === 'JOB_STATE_FAILED' || status.state === 'BATCH_STATE_FAILED' || status.state === 'STATE_FAILED') {
          await handleBatchFailure(job);
        } else if (status.state === 'JOB_STATE_RUNNING' || status.state === 'BATCH_STATE_RUNNING' || status.state === 'STATE_RUNNING') {
          // Update status to running if currently pending
          if (job.status === 'pending') {
            await updateBatchJobStatus(job.id, 'running');
          }
        }
        // Otherwise still pending/processing, do nothing
      } catch (error) {
        console.error(`[batchPoller] Error checking batch ${job.batchName}:`, error);
      }
    }
  } catch (error) {
    console.error('[batchPoller] Poll error:', error);
  }
}

async function handleBatchSuccess(job: {
  id: string;
  videoId: string;
  phase: number;
  batchName: string;
  sceneIndices: unknown;
  video: { title: string };
}) {
  const sceneIndices = job.sceneIndices as number[];
  const jobDir = await ensureJobDir(job.videoId);

  // Download results
  const savedImages = await downloadBatchResults(job.batchName, sceneIndices, jobDir);
  console.log(`[batchPoller] Downloaded ${savedImages.size} images for phase ${job.phase}`);

  // Create asset records for downloaded images
  for (const [sceneIdx, imagePath] of savedImages) {
    const filename = `scene_${sceneIdx.toString().padStart(3, '0')}.png`;
    const existingAssets = await getAssetsByType(job.videoId, 'image');
    const assetExists = existingAssets.some((a: { filename: string }) => a.filename === filename);
    if (!assetExists) {
      await createAsset(job.videoId, 'image', filename, imagePath, { sceneIndex: sceneIdx });
    }
  }

  // Update batch job status
  await updateBatchJobStatus(job.id, 'succeeded');

  // Complete the batch step
  const stepName = job.phase === 1 ? 'images_batch1' : 'images_batch2';
  const step = await getStepByName(job.videoId, stepName as any);
  if (step) {
    await completeStep(step.id);
  }

  await sendTelegramMessage(`Batch Phase ${job.phase} completed for "${job.video.title}"`);

  if (job.phase === 1) {
    // Submit Phase 2
    await submitPhase2(job.videoId);
  } else {
    // Phase 2 complete — all images ready, resume pipeline
    await handleAllImagesReady(job.videoId);
  }
}

async function submitPhase2(videoId: string) {
  // Load batch plan
  const plan = await loadJson<{
    phase1: number[];
    phase2: number[];
    phase2References: [number, number][];
  }>(videoId, 'batch_plan.json');

  if (!plan || plan.phase2.length === 0) {
    // No phase 2 needed — all images ready
    await handleAllImagesReady(videoId);
    return;
  }

  // Load scenes
  const scenes = await loadJson<Scene[]>(videoId, 'scene_meta.json');
  if (!scenes) {
    console.error(`[batchPoller] Cannot load scenes for video ${videoId}`);
    await updateVideoStatus(videoId, 'failed');
    return;
  }

  const phase2References = new Map<number, number>(plan.phase2References);

  // Build reference images map from Phase 1 results
  const referenceImages = new Map<number, string>();
  for (const [phase2Idx, phase1Idx] of phase2References) {
    try {
      const imagePath = getFilePath(videoId, `scene_${phase1Idx.toString().padStart(3, '0')}.png`);
      const base64 = await readImageAsBase64(imagePath);
      referenceImages.set(phase2Idx, base64);
    } catch (err) {
      console.warn(`[batchPoller] Could not read Phase 1 image for scene ${phase1Idx}:`, err);
    }
  }

  // Build character anchor images from Phase 1
  const characterAnchors = getCharacterAnchors(scenes, plan.phase1);
  const anchorImages = new Map<CharacterType, string>();
  for (const [char, sceneIdx] of characterAnchors) {
    try {
      const imagePath = getFilePath(videoId, `scene_${sceneIdx.toString().padStart(3, '0')}.png`);
      const base64 = await readImageAsBase64(imagePath);
      anchorImages.set(char, base64);
    } catch (err) {
      console.warn(`[batchPoller] Could not read anchor image for ${char}:`, err);
    }
  }

  const styleRefBase64 = getStyleReferenceBase64();

  // Build and submit Phase 2
  const phase2Requests = buildBatchRequests(
    scenes,
    plan.phase2,
    referenceImages,
    anchorImages,
    styleRefBase64
  );

  const batchName = await submitBatch(phase2Requests, `video-${videoId}-phase2`);
  console.log(`[batchPoller] Phase 2 batch submitted: ${batchName}`);

  await createBatchJob({
    videoId,
    phase: 2,
    batchName,
    sceneIndices: plan.phase2,
  });

  await updateVideoStatus(videoId, 'images_batch2');

  const batch2Step = await createStep(videoId, 'images_batch2');
  await startStep(batch2Step.id);
}

async function handleAllImagesReady(videoId: string) {
  console.log(`[batchPoller] All images ready for video ${videoId}, resuming pipeline...`);

  // Complete the main images step
  const imagesStep = await getStepByName(videoId, 'images');
  if (imagesStep && imagesStep.status !== 'success') {
    await completeStep(imagesStep.id);
  }

  // Continue pipeline from audio step
  try {
    const { continuePipeline } = await import('@/workers/pipeline');
    // Run in background, don't await
    continuePipeline(videoId).catch(err => {
      console.error(`[batchPoller] Pipeline continuation failed for ${videoId}:`, err);
      sendTelegramMessage(`Pipeline failed for video ${videoId}: ${err.message}`);
    });
  } catch (error) {
    console.error(`[batchPoller] Failed to import/call continuePipeline:`, error);
  }
}

async function handleBatchFailure(job: {
  id: string;
  videoId: string;
  phase: number;
  batchName: string;
  video: { title: string };
}) {
  await updateBatchJobStatus(job.id, 'failed');

  const stepName = job.phase === 1 ? 'images_batch1' : 'images_batch2';
  const step = await getStepByName(job.videoId, stepName as any);
  if (step) {
    await failStep(step.id, `Batch job failed: ${job.batchName}`);
  }

  // Fail the main images step too
  const imagesStep = await getStepByName(job.videoId, 'images');
  if (imagesStep) {
    await failStep(imagesStep.id, `Batch phase ${job.phase} failed`);
  }

  await updateVideoStatus(job.videoId, 'failed');
  await sendTelegramMessage(`Video "${job.video.title}" failed at batch phase ${job.phase}`);
}
