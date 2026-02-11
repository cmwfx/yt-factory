import { NextRequest, NextResponse } from 'next/server';
import { runPipeline } from '@/workers/pipeline';
import type { JobOptions } from '@/types';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));

    const options: JobOptions = {
      generateIdeas: body.generateIdeas ?? false,
      testMode: body.testMode ?? false,
      enableManualReview: body.enableManualReview ?? false,
      channelId: body.channelId || undefined,
    };

    console.log('Starting job with options:', options);

    // Run pipeline in background (non-blocking for API response)
    // In production, you'd use a proper job queue
    const resultPromise = runPipeline(options);

    // For now, we wait for the result
    // TODO: Implement proper async job handling
    const result = await resultPromise;

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
    console.error('Job start error:', error);
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
    message: 'Use POST to start a new job',
    example: {
      generateIdeas: true,
      testMode: false,
      enableManualReview: false,
    },
  });
}
