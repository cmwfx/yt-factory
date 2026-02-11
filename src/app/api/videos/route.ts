import { NextRequest, NextResponse } from 'next/server';
import { getAllVideos } from '@/lib/db';
import type { VideoStatus } from '@prisma/client';

const validStatuses: VideoStatus[] = [
  'queued',
  'scripting',
  'scenes',
  'images',
  'audio',
  'align',
  'render',
  'done',
  'failed',
];

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const statusParam = searchParams.get('status');

    const channelId = searchParams.get('channelId');

    const filters: { status?: VideoStatus; channelId?: string } = {};
    if (statusParam && validStatuses.includes(statusParam as VideoStatus)) {
      filters.status = statusParam as VideoStatus;
    }
    if (channelId) {
      filters.channelId = channelId;
    }

    const videos = await getAllVideos(filters);

    // Group counts by status
    const statusCounts = videos.reduce(
      (acc, video) => {
        acc[video.status] = (acc[video.status] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    return NextResponse.json({
      total: videos.length,
      statusCounts,
      videos: videos.map((video) => ({
        id: video.id,
        title: video.title,
        status: video.status,
        ideaTitle: video.idea?.title || null,
        createdAt: video.createdAt,
        updatedAt: video.updatedAt,
        stepCount: video.steps.length,
        completedSteps: video.steps.filter((s) => s.status === 'success').length,
        hasVideo: video.assets.some((a) => a.type === 'video'),
      })),
    });
  } catch (error) {
    console.error('Failed to get videos:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
