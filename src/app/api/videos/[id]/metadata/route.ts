import { NextRequest, NextResponse } from 'next/server';
import { getVideo, updateVideoMeta } from '@/lib/db';
import { generateClickbaitTitles, generateSeoDescription, generateThumbnailPrompts } from '@/ai/geminiMeta';
import { generateThumbnails } from '@/ai/geminiScript';
import { ensureJobDir } from '@/utils/fileStore';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = await request.json();
    const type = body.type as 'titles' | 'description' | 'thumbnails';

    if (!type || !['titles', 'description', 'thumbnails'].includes(type)) {
      return NextResponse.json(
        { error: 'Invalid type. Must be "titles", "description", or "thumbnails"' },
        { status: 400 }
      );
    }

    const video = await getVideo(id);

    if (!video) {
      return NextResponse.json(
        { error: 'Video not found' },
        { status: 404 }
      );
    }

    if (type === 'titles') {
      const titles = await generateClickbaitTitles(video.title);
      await updateVideoMeta(id, { clickbaitTitles: titles });

      return NextResponse.json({
        success: true,
        titles,
      });
    } else if (type === 'description') {
      const { description, keywords } = await generateSeoDescription(video.title);
      await updateVideoMeta(id, {
        seoDescription: description,
        seoKeywords: keywords,
      });

      return NextResponse.json({
        success: true,
        description,
        keywords,
      });
    } else {
      // thumbnails
      const prompts = await generateThumbnailPrompts(video.title);
      await updateVideoMeta(id, { thumbnailPrompts: prompts });

      const jobDir = await ensureJobDir(id);
      await generateThumbnails(prompts, jobDir);

      return NextResponse.json({
        success: true,
        thumbnailPrompts: prompts,
      });
    }
  } catch (error) {
    console.error('Failed to generate metadata:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
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

    return NextResponse.json({
      clickbaitTitles: video.clickbaitTitles || [],
      seoDescription: video.seoDescription || null,
      seoKeywords: video.seoKeywords || [],
    });
  } catch (error) {
    console.error('Failed to get metadata:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
