#!/usr/bin/env tsx

/**
 * CLI script to run the video generation pipeline.
 *
 * Usage:
 *   npx tsx scripts/runJob.ts [options]
 *
 * Options:
 *   --generate-ideas    Generate new ideas before picking one
 *   --test              Run in test mode (fewer scenes, shorter video)
 *   --retry <videoId>   Retry a failed job from a specific step
 *   --from <step>       Step to retry from (used with --retry)
 *   --help              Show this help message
 *
 * Examples:
 *   npx tsx scripts/runJob.ts                    # Run with existing idea
 *   npx tsx scripts/runJob.ts --generate-ideas  # Generate ideas first
 *   npx tsx scripts/runJob.ts --test            # Test mode
 *   npx tsx scripts/runJob.ts --retry abc123 --from images  # Retry from images step
 */

import { runPipeline, resumePipeline } from '../workers/pipeline';
import type { StepName } from '../types';

const VALID_STEPS: StepName[] = [
  'scripting',
  'scenes',
  'images',
  'audio',
  'transcribe',
  'align',
  'review',
  'render',
];

function printHelp() {
  console.log(`
AI YouTube Video Factory - CLI Runner

Usage:
  npx tsx scripts/runJob.ts [options]

Options:
  --generate-ideas    Generate new ideas before picking one
  --test              Run in test mode (fewer scenes, shorter video)
  --retry <videoId>   Retry a failed job
  --from <step>       Step to retry from (used with --retry)
  --help              Show this help message

Valid steps for --from:
  ${VALID_STEPS.join(', ')}

Examples:
  npx tsx scripts/runJob.ts
  npx tsx scripts/runJob.ts --generate-ideas
  npx tsx scripts/runJob.ts --test
  npx tsx scripts/runJob.ts --retry abc123 --from images
`);
}

async function main() {
  const args = process.argv.slice(2);

  // Parse arguments
  const generateIdeas = args.includes('--generate-ideas');
  const testMode = args.includes('--test');
  const helpRequested = args.includes('--help') || args.includes('-h');

  const retryIndex = args.indexOf('--retry');
  const fromIndex = args.indexOf('--from');

  if (helpRequested) {
    printHelp();
    process.exit(0);
  }

  // Handle retry mode
  if (retryIndex !== -1) {
    const videoId = args[retryIndex + 1];
    if (!videoId || videoId.startsWith('--')) {
      console.error('Error: --retry requires a videoId');
      process.exit(1);
    }

    let fromStep: StepName = 'scripting';
    if (fromIndex !== -1) {
      const step = args[fromIndex + 1] as StepName;
      if (!step || !VALID_STEPS.includes(step)) {
        console.error(`Error: --from must be one of: ${VALID_STEPS.join(', ')}`);
        process.exit(1);
      }
      fromStep = step;
    }

    console.log(`Retrying job ${videoId} from step: ${fromStep}`);
    const result = await resumePipeline(videoId, fromStep);

    if (result.status === 'failed') {
      console.error('Job failed:', result.error);
      process.exit(1);
    }

    console.log('Job completed successfully!');
    process.exit(0);
  }

  // Run normal pipeline
  const result = await runPipeline({
    generateIdeas,
    testMode,
    enableManualReview: false,
  });

  if (result.status === 'failed') {
    console.error('Job failed:', result.error);
    process.exit(1);
  }

  console.log('\nJob completed successfully!');
  console.log(`Video: ${result.videoPath}`);
  console.log(`Duration: ${result.duration?.toFixed(2)}s`);
  process.exit(0);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
