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
import { generateSceneImage, setCharacterFirstAppearance, resetCharacterMemory } from '@/ai/nanoBanana';
import { getCharacterAnchors } from '@/utils/batchPlanner';
import { loadJson, saveJson, ensureJobDir, getFilePath, listFiles, getStyleReferenceBase64ForChannel } from '@/utils/fileStore';
import { sendTelegramMessage } from '@/lib/telegram';
import { resolveChannelConfig } from '@/lib/channelConfig';
import type { Scene, CharacterType, ChannelConfig } from '@/types';

let pollerInterval: ReturnType<typeof setInterval> | null = null;
// Track jobs currently being processed to prevent duplicate work across poll cycles
const inFlightJobs = new Set<string>();
// Track download attempts per batch to prevent infinite retry loops
const downloadAttempts = new Map<string, number>();
const MAX_DOWNLOAD_ATTEMPTS = 5;

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

    // Filter out jobs already being processed by a previous poll cycle
    const newJobs = pendingJobs.filter(j => !inFlightJobs.has(j.id));
    if (newJobs.length === 0) {
      console.log(`[batchPoller] ${pendingJobs.length} jobs pending, all already in-flight`);
      return;
    }

    console.log(`[batchPoller] Checking ${newJobs.length} pending batch jobs (${inFlightJobs.size} already in-flight)...`);

    // Process all jobs in parallel so one hanging job doesn't block others.
    // No per-job timeout — let streaming downloads run to completion.
    const results = await Promise.allSettled(
      newJobs.map(job => {
        inFlightJobs.add(job.id);
        return processJob(job).finally(() => inFlightJobs.delete(job.id));
      })
    );

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      if (result.status === 'rejected') {
        console.error(
          `[batchPoller] Job ${newJobs[i].batchName} failed:`,
          result.reason
        );
      }
    }
  } catch (error) {
    console.error('[batchPoller] Poll error:', error);
  }
}

async function processJob(job: Awaited<ReturnType<typeof getPendingBatchJobs>>[number]) {
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

  // Increment and check retry counter to prevent infinite retry loops
  const attempts = (downloadAttempts.get(job.batchName) || 0) + 1;
  downloadAttempts.set(job.batchName, attempts);

  if (attempts > MAX_DOWNLOAD_ATTEMPTS) {
    console.error(`[batchPoller] Download for ${job.batchName} failed after ${MAX_DOWNLOAD_ATTEMPTS} attempts — marking as failed`);
    downloadAttempts.delete(job.batchName);
    await handleBatchFailure(job);
    return;
  }

  console.log(`[batchPoller] Download attempt ${attempts}/${MAX_DOWNLOAD_ATTEMPTS} for ${job.batchName}`);

  // Download results
  const savedImages = await downloadBatchResults(job.batchName, sceneIndices, jobDir);
  console.log(`[batchPoller] Downloaded ${savedImages.size}/${sceneIndices.length} images for phase ${job.phase}`);

  // Guard: if no images were downloaded, don't mark as succeeded — retry next cycle
  if (savedImages.size === 0) {
    console.error(`[batchPoller] Downloaded 0 images for ${job.batchName} — will retry next cycle`);
    return;
  }

  // Success — clear the retry counter
  downloadAttempts.delete(job.batchName);

  // Identify scenes that failed in the batch and retry individually
  const failedIndices = sceneIndices.filter(idx => !savedImages.has(idx));
  if (failedIndices.length > 0) {
    console.log(`[batchPoller] ${failedIndices.length} scenes failed in batch, retrying individually: ${failedIndices.join(', ')}`);
    // Load channel config for retry
    const retryVideo = await getVideo(job.videoId);
    const retryChannelConfig = await resolveChannelConfig((retryVideo as any)?.channelId);
    const retried = await retryFailedScenes(job.videoId, failedIndices, jobDir, retryChannelConfig);
    for (const [idx, filePath] of retried) {
      savedImages.set(idx, filePath);
    }
    console.log(`[batchPoller] Retried ${retried.size}/${failedIndices.length} failed scenes successfully`);
  }

  // Save batch summary for frontend display
  const batchSucceeded = sceneIndices.length - failedIndices.length;
  await saveJson(job.videoId, `batch_phase${job.phase}_summary.json`, {
    phase: job.phase,
    totalScenes: sceneIndices.length,
    batchSucceeded,
    retriedDirectly: failedIndices.length,
    retriedSucceeded: failedIndices.length > 0 ? savedImages.size - batchSucceeded : 0,
    failedSceneIndices: failedIndices,
    timestamp: new Date().toISOString(),
  });

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

  // Load channel config from video record
  const video = await getVideo(videoId);
  const channelConfig = await resolveChannelConfig((video as any)?.channelId);

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

  // Get style reference (channel-specific or default)
  const styleRefBase64 = channelConfig?.styleReferencePath
    ? getStyleReferenceBase64ForChannel(channelConfig.styleReferencePath)
    : getStyleReferenceBase64();

  // Build and submit Phase 2
  const phase2Requests = buildBatchRequests(
    scenes,
    plan.phase2,
    referenceImages,
    anchorImages,
    styleRefBase64,
    channelConfig
  );

  const batchName = await submitBatch(phase2Requests, `video-${videoId}-phase2`, channelConfig);
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

async function retryFailedScenes(
  videoId: string,
  failedIndices: number[],
  jobDir: string,
  channelConfig?: ChannelConfig
): Promise<Map<number, string>> {
  const results = new Map<number, string>();

  const scenes = await loadJson<Scene[]>(videoId, 'scene_meta.json');
  const plan = await loadJson<{
    phase1: number[];
    phase2: number[];
    phase2References: [number, number][];
  }>(videoId, 'batch_plan.json');

  if (!scenes || !plan) {
    console.error('[batchPoller] Cannot load scenes/plan for retry');
    return results;
  }

  // Pre-populate character anchors from phase 1 images
  resetCharacterMemory();
  const characterAnchors = getCharacterAnchors(scenes, plan.phase1);
  for (const [char, sceneIdx] of characterAnchors) {
    const imagePath = getFilePath(videoId, `scene_${sceneIdx.toString().padStart(3, '0')}.png`);
    setCharacterFirstAppearance(char, imagePath);
  }

  const phase2RefMap = new Map<number, number>(plan.phase2References);

  for (const idx of failedIndices) {
    const scene = scenes[idx];
    if (!scene) {
      console.warn(`[batchPoller] Scene ${idx} not found in scene_meta.json, skipping`);
      continue;
    }

    const outputPath = `${jobDir}/scene_${idx.toString().padStart(3, '0')}.png`;

    // Resolve reference image for CHARACTER_REACTION / OBJECT_FOCUS
    let previousImagePath: string | null = null;
    const refIdx = phase2RefMap.get(idx);
    if (refIdx !== undefined) {
      previousImagePath = getFilePath(videoId, `scene_${refIdx.toString().padStart(3, '0')}.png`);
    }

    try {
      console.log(`[batchPoller] Retrying scene ${idx} individually...`);
      await generateSceneImage(scene, previousImagePath, outputPath, channelConfig);
      results.set(idx, outputPath);
      console.log(`[batchPoller] Scene ${idx} retry succeeded`);
    } catch (err) {
      console.error(`[batchPoller] Scene ${idx} retry failed:`, err);
    }

    // Rate limit between retries
    if (failedIndices.indexOf(idx) < failedIndices.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  return results;
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
