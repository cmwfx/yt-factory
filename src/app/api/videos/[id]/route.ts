import { NextRequest, NextResponse } from 'next/server';
import { getVideo, deleteVideo } from '@/lib/db';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const video = await getVideo(id);

    if (!video) {
      return NextResponse.json(
        { error: 'Video not found' },
        { status: 404 }
      );
    }

    // Calculate total duration from steps
    const totalDuration = video.steps.reduce((acc, step) => {
      if (step.startedAt && step.finishedAt) {
        return acc + (new Date(step.finishedAt).getTime() - new Date(step.startedAt).getTime());
      }
      return acc;
    }, 0);

    // Find video asset path
    const videoAsset = video.assets.find((a) => a.type === 'video');

    return NextResponse.json({
      video: {
        id: video.id,
        title: video.title,
        status: video.status,
        script: video.script,
        createdAt: video.createdAt,
        updatedAt: video.updatedAt,
        idea: video.idea,
        videoPath: videoAsset?.path || null,
        totalDurationMs: totalDuration,
        clickbaitTitles: video.clickbaitTitles || [],
        seoDescription: video.seoDescription || null,
        seoKeywords: video.seoKeywords || [],
        thumbnailPrompts: video.thumbnailPrompts || [],
        costCents: video.costCents || null,
        costBreakdown: video.costBreakdown || null,
        steps: video.steps.map((step) => ({
          id: step.id,
          step: step.step,
          status: step.status,
          error: step.error,
          startedAt: step.startedAt,
          finishedAt: step.finishedAt,
          durationMs:
            step.startedAt && step.finishedAt
              ? new Date(step.finishedAt).getTime() - new Date(step.startedAt).getTime()
              : null,
        })),
        assets: video.assets.map((asset) => ({
          id: asset.id,
          type: asset.type,
          filename: asset.filename,
          path: asset.path,
          metadata: asset.metadata,
        })),
      },
    });
  } catch (error) {
    console.error('Failed to get video:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    await deleteVideo(id);

    return NextResponse.json({
      success: true,
    });
  } catch (error) {
    console.error('Failed to delete video:', error);

    if (error instanceof Error && error.message === 'Video not found') {
      return NextResponse.json(
        { error: 'Video not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
