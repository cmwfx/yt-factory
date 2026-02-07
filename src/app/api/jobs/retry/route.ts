import { NextRequest, NextResponse } from 'next/server';
import { resumePipeline } from '@/workers/pipeline';
import { resetStepsFromStep, getVideo } from '@/lib/db';
import type { StepName } from '@/types';

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

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const { videoId, fromStep } = body;

    if (!videoId) {
      return NextResponse.json(
        { success: false, error: 'videoId is required' },
        { status: 400 }
      );
    }

    if (!fromStep || !VALID_STEPS.includes(fromStep as StepName)) {
      return NextResponse.json(
        {
          success: false,
          error: `fromStep must be one of: ${VALID_STEPS.join(', ')}`,
        },
        { status: 400 }
      );
    }

    // Verify video exists
    const video = await getVideo(videoId);
    if (!video) {
      return NextResponse.json(
        { success: false, error: `Video not found: ${videoId}` },
        { status: 404 }
      );
    }

    console.log(`Retrying job ${videoId} from step: ${fromStep}`);

    // Reset steps from the specified point
    await resetStepsFromStep(videoId, fromStep as StepName);

    // Resume pipeline
    const result = await resumePipeline(videoId, fromStep as StepName);

    if (result.status === 'failed') {
      return NextResponse.json(
        {
          success: false,
          error: result.error,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      videoId: result.videoId,
      status: result.status,
      videoPath: result.videoPath,
      duration: result.duration,
    });
  } catch (error) {
    console.error('Job retry error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    message: 'Use POST to retry a failed job',
    example: {
      videoId: 'uuid-here',
      fromStep: 'images',
    },
    validSteps: VALID_STEPS,
  });
}
