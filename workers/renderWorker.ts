import { renderVideo, getVideoDuration, checkFFmpegAvailable } from '@/utils/ffmpeg';
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
import { getFilePath, fileExists } from '@/utils/fileStore';
import { acquireRenderLock, releaseRenderLock } from '@/lib/renderQueue';
import { sendTelegramMessage } from '@/lib/telegram';
import type { AlignedScene } from '@/types';

export interface RenderWorkerInput {
  videoId: string;
  alignedScenes: AlignedScene[];
  audioPath: string;
}

export interface RenderWorkerOutput {
  videoPath: string;
  duration: number;
}

export async function runRenderWorker(input: RenderWorkerInput): Promise<RenderWorkerOutput> {
  const { videoId, alignedScenes, audioPath } = input;

  // Check if already done
  const existingStep = await getStepByName(videoId, 'render');
  if (existingStep?.status === 'success') {
    console.log('Video already rendered, loading from file...');
    const existingAssets = await getAssetsByType(videoId, 'video');
    if (existingAssets.length > 0) {
      const duration = await getVideoDuration(existingAssets[0].path).catch(() => 0);
      return {
        videoPath: existingAssets[0].path,
        duration,
      };
    }
  }

  // Check if video file exists
  const videoFilename = 'final.mp4';
  if (await fileExists(videoId, videoFilename)) {
    console.log('Video file exists, skipping render...');
    const videoPath = getFilePath(videoId, videoFilename);
    const duration = await getVideoDuration(videoPath).catch(() => 0);
    return {
      videoPath,
      duration,
    };
  }

  // Check FFmpeg availability
  const ffmpegAvailable = await checkFFmpegAvailable();
  if (!ffmpegAvailable) {
    throw new Error('FFmpeg is not available. Please install FFmpeg and ensure it is in your PATH.');
  }

  // Create or get step
  let step = existingStep;
  if (!step) {
    step = await createStep(videoId, 'render');
  }

  // Acquire render lock (serializes FFmpeg across concurrent jobs)
  await acquireRenderLock(videoId);

  try {
    await startStep(step.id);
    await updateVideoStatus(videoId, 'render');

    console.log(`Rendering video with ${alignedScenes.length} scenes...`);

    const videoPath = await renderVideo({
      videoId,
      scenes: alignedScenes,
      audioPath,
      outputFilename: videoFilename,
      fps: 25,
      zoomAmount: 0.05,
    });

    const duration = await getVideoDuration(videoPath);
    console.log(`Video rendered: ${videoPath} (${duration.toFixed(2)}s)`);

    await createAsset(videoId, 'video', videoFilename, videoPath, {
      duration,
      sceneCount: alignedScenes.length,
    });

    await completeStep(step.id);
    await updateVideoStatus(videoId, 'done');

    return {
      videoPath,
      duration,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    await failStep(step.id, errorMessage);
    await updateVideoStatus(videoId, 'failed');
    await sendTelegramMessage(`Render failed for video ${videoId}: ${errorMessage}`);
    throw error;
  } finally {
    await releaseRenderLock(videoId);
  }
}
