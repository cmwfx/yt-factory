import { generateScript } from '@/ai/geminiScript';
import {
  updateVideoStatus,
  updateVideoScript,
  createStep,
  startStep,
  completeStep,
  failStep,
  getStepByName,
  createAsset,
} from '@/lib/db';
import { saveText, fileExists } from '@/utils/fileStore';
import type { UsageMetadata } from '@/lib/costTracker';
import type { IdeaInput } from '@/types';

export interface ScriptWorkerInput {
  videoId: string;
  idea: IdeaInput;
}

export interface ScriptWorkerOutput {
  script: string;
  wordCount: number;
  scriptPath: string;
  usageMetadata?: UsageMetadata;
}

/**
 * Generate a script for a video.
 */
export async function runScriptWorker(input: ScriptWorkerInput): Promise<ScriptWorkerOutput> {
  const { videoId, idea } = input;

  // Check if already done
  const existingStep = await getStepByName(videoId, 'scripting');
  if (existingStep?.status === 'success') {
    console.log('Script already generated, skipping...');
    // Load existing script
    const video = await import('@/lib/db').then(m => m.getVideo(videoId));
    if (video?.script) {
      return {
        script: video.script,
        wordCount: video.script.split(/\s+/).length,
        scriptPath: `./public/jobs/${videoId}/script.txt`,
      };
    }
  }

  // Create or get step
  let step = existingStep;
  if (!step) {
    step = await createStep(videoId, 'scripting');
  }

  try {
    await startStep(step.id);
    await updateVideoStatus(videoId, 'scripting');

    console.log(`Generating script for: ${idea.title}`);

    // Generate script
    const result = await generateScript(idea);

    console.log(`Script generated: ${result.wordCount} words`);

    // Save to database
    await updateVideoScript(videoId, result.script);

    // Save to file
    const scriptPath = await saveText(videoId, 'script.txt', result.script);

    // Create asset record
    await createAsset(videoId, 'script', 'script.txt', scriptPath, {
      wordCount: result.wordCount,
    });

    await completeStep(step.id);

    return {
      script: result.script,
      wordCount: result.wordCount,
      scriptPath,
      usageMetadata: result.usageMetadata,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    await failStep(step.id, errorMessage);
    await updateVideoStatus(videoId, 'failed');
    throw error;
  }
}
