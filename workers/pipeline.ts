import { generateIdeas } from '@/ai/geminiScript';
import {
  createIdea,
  getUnusedIdea,
  markIdeaUsed,
  getAllIdeaTitles,
  createVideo,
  getVideo,
  updateVideoStatus,
  updateVideoCost,
  createStep,
  startStep,
  completeStep,
  failStep,
  getStepByName,
} from '@/lib/db';
import { env } from '@/lib/env';
import { CostAccumulator, formatCost } from '@/lib/costTracker';
import { sendTelegramMessage } from '@/lib/telegram';
import { runScriptWorker } from './scriptWorker';
import { runSceneWorker } from './sceneWorker';
import { runImageWorker } from './imageWorker';
import { runAudioWorker } from './audioWorker';
import { runTranscribeWorker } from './transcribeWorker';
import { runAlignWorker } from './alignWorker';
import { runRenderWorker } from './renderWorker';
import { resolveChannelConfig } from '@/lib/channelConfig';
import type { JobOptions, StepName, ChannelConfig } from '@/types';

export interface PipelineResult {
  videoId: string;
  status: 'done' | 'failed' | 'review' | 'waiting_batch';
  videoPath?: string;
  duration?: number;
  costCents?: number;
  error?: string;
  message?: string;
}

/**
 * Start the pipeline: generates script, scenes, then submits image batch.
 * Returns with status 'waiting_batch' — the batch poller will call continuePipeline.
 */
export async function startPipeline(options: JobOptions): Promise<PipelineResult> {
  const { generateIdeas: shouldGenerateIdeas, testMode, enableManualReview, channelId } = options;

  console.log('='.repeat(60));
  console.log('AI YouTube Video Factory - Pipeline Started');
  console.log('='.repeat(60));
  console.log(`Generate Ideas: ${shouldGenerateIdeas}`);
  console.log(`Test Mode: ${testMode || env.TEST_MODE}`);
  console.log(`Channel ID: ${channelId || 'default'}`);
  console.log('='.repeat(60));

  const costTracker = new CostAccumulator();

  try {
    // Load channel config
    const channelConfig = await resolveChannelConfig(channelId);
    console.log(`Channel: ${channelConfig.name} (${channelConfig.slug})`);

    // Step 1: Generate ideas if requested
    if (shouldGenerateIdeas) {
      console.log('\n[1/8] Generating new ideas...');
      await generateNewIdeas(channelConfig);
    }

    // Step 2: Pick an idea
    console.log('\n[2/8] Picking an idea...');
    const idea = await getUnusedIdea(channelConfig.id);
    if (!idea) {
      throw new Error('No unused ideas available. Generate ideas first.');
    }

    console.log(`Selected idea: ${idea.title}`);
    await markIdeaUsed(idea.id);

    const video = await createVideo(idea.id, idea.title, channelConfig.id);
    const videoId = video.id;
    console.log(`Video ID: ${videoId}`);

    // Store pipeline options for continuePipeline
    const { saveJson } = await import('@/utils/fileStore');
    await saveJson(videoId, 'pipeline_options.json', {
      enableManualReview,
      testMode,
      channelId: channelConfig.id,
    });

    // Step 3: Generate script
    console.log('\n[3/8] Generating script...');
    const scriptResult = await runScriptWorker({
      videoId,
      idea: { title: idea.title, description: idea.description },
      channelConfig,
    });
    console.log(`Script: ${scriptResult.wordCount} words`);
    if (scriptResult.usageMetadata) {
      costTracker.addGeminiText(scriptResult.usageMetadata);
    }

    // Step 4: Break down into scenes
    console.log('\n[4/8] Breaking down into scenes...');
    const sceneResult = await runSceneWorker({
      videoId,
      script: scriptResult.script,
      channelConfig,
    });
    console.log(`Scenes: ${sceneResult.sceneCount}`);
    if (sceneResult.usageMetadata) {
      costTracker.addGeminiText(sceneResult.usageMetadata);
    }

    // Save partial cost tracking
    const partialCost = costTracker.getBreakdown();
    await saveJson(videoId, 'cost_partial.json', partialCost);

    // Step 5: Submit image batch (non-blocking)
    console.log('\n[5/8] Submitting image batch...');
    const imageResult = await runImageWorker({
      videoId,
      scenes: sceneResult.scenes,
      channelConfig,
    });

    if (imageResult.status === 'waiting_batch') {
      console.log('Image batch submitted. Pipeline paused — batch poller will continue.');
      return {
        videoId,
        status: 'waiting_batch',
        message: 'Image batch submitted, waiting for completion',
        costCents: partialCost.totalCents,
      };
    }

    // If images were already complete (cache hit), continue synchronously
    return await runPostImageSteps(videoId, costTracker, enableManualReview, channelConfig);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('\nPipeline failed:', errorMessage);
    await sendTelegramMessage(`Pipeline failed: ${errorMessage}`);
    return {
      videoId: '',
      status: 'failed',
      error: errorMessage,
    };
  }
}

/**
 * Continue pipeline after batch images are ready.
 * Called by the batch poller when Phase 2 completes.
 */
export async function continuePipeline(videoId: string): Promise<PipelineResult> {
  console.log('='.repeat(60));
  console.log(`Continuing pipeline for video ${videoId} (post-images)`);
  console.log('='.repeat(60));

  try {
    // Load pipeline options
    const { loadJson } = await import('@/utils/fileStore');
    const options = await loadJson<{ enableManualReview: boolean; testMode: boolean; channelId?: string }>(
      videoId,
      'pipeline_options.json'
    );
    const enableManualReview = options?.enableManualReview ?? false;

    // Load channel config from saved options or video record
    const channelConfig = await resolveChannelConfig(options?.channelId);

    // Load partial cost tracking
    const partialCost = await loadJson<any>(videoId, 'cost_partial.json');
    const costTracker = new CostAccumulator();
    // Restore partial costs
    if (partialCost) {
      costTracker.addGeminiText({ promptTokenCount: 0, candidatesTokenCount: 0 }); // placeholder to get totals
    }

    return await runPostImageSteps(videoId, costTracker, enableManualReview, channelConfig);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`Pipeline continuation failed for ${videoId}:`, errorMessage);
    await updateVideoStatus(videoId, 'failed');
    await sendTelegramMessage(`Pipeline failed for video ${videoId}: ${errorMessage}`);
    return {
      videoId,
      status: 'failed',
      error: errorMessage,
    };
  }
}

/**
 * Run all steps after images are ready: audio → transcribe → align → [review] → render.
 */
async function runPostImageSteps(
  videoId: string,
  costTracker: CostAccumulator,
  enableManualReview: boolean,
  channelConfig?: ChannelConfig
): Promise<PipelineResult> {
  const { loadJson, loadText, saveJson } = await import('@/utils/fileStore');
  const { listFiles, getFilePath } = await import('@/utils/fileStore');

  const video = await getVideo(videoId);
  if (!video) throw new Error(`Video not found: ${videoId}`);

  const script = video.script || await loadText(videoId, 'script.txt') || '';
  const scenes = await loadJson<any[]>(videoId, 'scene_meta.json') || [];

  // Load image paths
  const imageFiles = await listFiles(videoId, '^scene_\\d+\\.png$');
  const imagePaths = imageFiles.sort().map(f => getFilePath(videoId, f));

  // Step 6: Generate audio
  console.log('\n[6/8] Generating audio...');
  const audioResult = await runAudioWorker({
    videoId,
    script,
    scenes,
    channelConfig,
  });
  console.log(`Audio: ${audioResult.duration.toFixed(2)}s`);
  if (audioResult.usageMetadata) {
    costTracker.addGeminiTTS(audioResult.usageMetadata);
  }

  // Step 7: Transcribe audio
  console.log('\n[7/8] Transcribing audio...');
  const transcribeResult = await runTranscribeWorker({
    videoId,
    audioPath: audioResult.audioPath,
  });
  console.log(`Transcription: ${transcribeResult.transcription.words.length} words`);
  costTracker.addAssemblyAI(transcribeResult.audioDuration);

  // Step 8: Align scenes
  console.log('\n[8/8] Aligning scenes...');
  const alignResult = await runAlignWorker({
    videoId,
    scenes,
    transcription: transcribeResult.transcription,
    imagePaths,
    sceneDurations: audioResult.sceneDurations,
    sceneAudioPaths: audioResult.sceneAudioPaths,
  });
  console.log(`Aligned scenes: ${alignResult.alignedScenes.length}`);
  console.log(`Total duration: ${alignResult.totalDuration.toFixed(2)}s`);

  // Save cost breakdown
  const costBreakdown = costTracker.getBreakdown();

  // Load and merge partial costs
  const partialCost = await loadJson<any>(videoId, 'cost_partial.json');
  if (partialCost) {
    costBreakdown.geminiText += partialCost.geminiText || 0;
    costBreakdown.totalCents += partialCost.geminiText || 0;
  }

  await updateVideoCost(videoId, costBreakdown.totalCents, costBreakdown);
  console.log(`\nEstimated Cost: ${formatCost(costBreakdown.totalCents)}`);

  // Check if manual review is enabled
  if (enableManualReview) {
    console.log('\nManual review enabled - pausing before render');
    const reviewStep = await createStep(videoId, 'review');
    await startStep(reviewStep.id);
    await updateVideoStatus(videoId, 'review');

    await saveJson(videoId, 'review_metadata.json', {
      alignmentMethod: audioResult.sceneDurations?.length > 0 ? 'duration' : 'transcription',
      averageMatchScore: alignResult.averageMatchScore,
      failedScenes: alignResult.failedScenes,
      timestamp: new Date().toISOString(),
    });

    return {
      videoId,
      status: 'review',
      message: 'Paused for manual review',
      costCents: costBreakdown.totalCents,
    };
  }

  // Step 9: Render video
  console.log('\n[9/9] Rendering video...');
  const renderResult = await runRenderWorker({
    videoId,
    alignedScenes: alignResult.alignedScenes,
    audioPath: audioResult.audioPath,
  });

  console.log('\n' + '='.repeat(60));
  console.log('Pipeline Complete!');
  console.log(`Video: ${renderResult.videoPath} (${renderResult.duration.toFixed(2)}s)`);
  console.log(`Cost: ${formatCost(costBreakdown.totalCents)}`);
  console.log('='.repeat(60));

  await sendTelegramMessage(
    `Video "${video.title}" completed!\nDuration: ${renderResult.duration.toFixed(1)}s\nCost: ${formatCost(costBreakdown.totalCents)}`
  );

  return {
    videoId,
    status: 'done',
    videoPath: renderResult.videoPath,
    duration: renderResult.duration,
    costCents: costBreakdown.totalCents,
  };
}

/**
 * Legacy runPipeline function — calls startPipeline.
 * Kept for backward compatibility with existing API routes.
 */
export async function runPipeline(options: JobOptions): Promise<PipelineResult> {
  return startPipeline(options);
}

/**
 * Resume pipeline from a specific step.
 */
export async function resumePipeline(
  videoId: string,
  fromStep: StepName
): Promise<PipelineResult> {
  console.log('='.repeat(60));
  console.log(`Resuming pipeline for video ${videoId} from step: ${fromStep}`);
  console.log('='.repeat(60));

  try {
    const video = await getVideo(videoId);
    if (!video) {
      throw new Error(`Video not found: ${videoId}`);
    }

    // Load channel config from video or saved options
    const { loadJson: loadJsonEarly } = await import('@/utils/fileStore');
    const savedOptions = await loadJsonEarly<{ channelId?: string }>(videoId, 'pipeline_options.json');
    const channelConfig = await resolveChannelConfig(savedOptions?.channelId || (video as any).channelId);

    const stepOrder: StepName[] = [
      'scripting',
      'scenes',
      'images',
      'audio',
      'transcribe',
      'align',
      'review',
      'render',
    ];

    const startIndex = stepOrder.indexOf(fromStep);
    if (startIndex === -1) {
      throw new Error(`Invalid step: ${fromStep}`);
    }

    const stepsToRun = stepOrder.slice(startIndex);
    const { loadJson, loadText } = await import('@/utils/fileStore');

    let script = video.script || await loadText(videoId, 'script.txt') || '';
    let scenes = await loadJson<any[]>(videoId, 'scene_meta.json') || [];
    let imagePaths: string[] = [];
    let transcription = await loadJson<any>(videoId, 'captions.json');
    let alignedScenes = await loadJson<any[]>(videoId, 'scene_meta_aligned.json') || [];
    let audioPath = `./public/jobs/${videoId}/audio.wav`;
    let sceneDurations = await loadJson<number[]>(videoId, 'scene_durations.json') || [];
    let sceneAudioPaths = await loadJson<string[]>(videoId, 'scene_audio_paths.json') || [];

    for (const step of stepsToRun) {
      console.log(`\nRunning step: ${step}`);

      switch (step) {
        case 'scripting': {
          const result = await runScriptWorker({
            videoId,
            idea: {
              title: video.title,
              description: video.idea?.description || '',
            },
            channelConfig,
          });
          script = result.script;
          break;
        }
        case 'scenes': {
          const result = await runSceneWorker({ videoId, script, channelConfig });
          scenes = result.scenes;
          break;
        }
        case 'images': {
          const result = await runImageWorker({ videoId, scenes, channelConfig });
          if (result.status === 'waiting_batch') {
            return {
              videoId,
              status: 'waiting_batch',
              message: 'Image batch submitted, waiting for completion',
            };
          }
          imagePaths = result.imagePaths || [];
          break;
        }
        case 'audio': {
          const result = await runAudioWorker({ videoId, script, scenes, channelConfig });
          audioPath = result.audioPath;
          sceneDurations = result.sceneDurations;
          sceneAudioPaths = result.sceneAudioPaths;
          break;
        }
        case 'transcribe': {
          const result = await runTranscribeWorker({ videoId, audioPath });
          transcription = result.transcription;
          break;
        }
        case 'align': {
          if (!transcription) {
            throw new Error('Transcription required for alignment');
          }
          if (imagePaths.length === 0) {
            const { listFiles, getFilePath } = await import('@/utils/fileStore');
            const files = await listFiles(videoId, '^scene_\\d+\\.png$');
            imagePaths = files.sort().map(f => getFilePath(videoId, f));
          }
          const result = await runAlignWorker({
            videoId,
            scenes,
            transcription,
            imagePaths,
            sceneDurations: sceneDurations.length > 0 ? sceneDurations : undefined,
            sceneAudioPaths: sceneAudioPaths.length > 0 ? sceneAudioPaths : undefined,
          });
          alignedScenes = result.alignedScenes;
          break;
        }
        case 'review': {
          const reviewStep = await getStepByName(videoId, 'review');
          if (reviewStep && reviewStep.status !== 'success') {
            await completeStep(reviewStep.id);
          }
          break;
        }
        case 'render': {
          if (alignedScenes.length === 0) {
            const loaded = await loadJson<any[]>(videoId, 'scene_meta_aligned.json');
            if (!loaded) {
              throw new Error('Aligned scenes required for rendering');
            }
            alignedScenes = loaded;
          }
          const result = await runRenderWorker({
            videoId,
            alignedScenes,
            audioPath,
          });
          return {
            videoId,
            status: 'done',
            videoPath: result.videoPath,
            duration: result.duration,
          };
        }
      }
    }

    return { videoId, status: 'done' };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('Resume failed:', errorMessage);
    return {
      videoId,
      status: 'failed',
      error: errorMessage,
    };
  }
}

async function generateNewIdeas(channelConfig?: ChannelConfig): Promise<number> {
  const channelId = channelConfig?.id;
  const existingTitles = await getAllIdeaTitles(channelId);
  console.log(`Existing ideas: ${existingTitles.length}`);

  const newIdeas = await generateIdeas(existingTitles, 10, channelConfig);
  console.log(`Generated ${newIdeas.length} new ideas`);

  let added = 0;
  for (const idea of newIdeas) {
    try {
      await createIdea(idea.title, idea.description, channelId);
      added++;
      console.log(`  + ${idea.title}`);
    } catch (error) {
      console.log(`  - ${idea.title} (duplicate)`);
    }
  }

  console.log(`Added ${added} new ideas to database`);
  return added;
}

export { generateNewIdeas };
