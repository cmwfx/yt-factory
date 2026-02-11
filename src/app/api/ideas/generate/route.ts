import { NextRequest, NextResponse } from 'next/server';
import { generateNewIdeas } from '@/workers/pipeline';
import { prisma } from '@/lib/db';
import { resolveChannelConfig } from '@/lib/channelConfig';

interface Idea {
  id: string;
  title: string;
  description: string;
  used: boolean;
  createdAt: Date;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const count = body.count ?? 10;
    const channelId = body.channelId;

    console.log(`Generating ${count} new ideas...`);

    const channelConfig = await resolveChannelConfig(channelId);
    const added = await generateNewIdeas(channelConfig);

    // Get all ideas for response (scoped to channel if provided)
    const allIdeas = await prisma.idea.findMany({
      where: channelId ? { channelId } : undefined,
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    return NextResponse.json({
      success: true,
      added,
      ideas: allIdeas.map((i: Idea) => ({
        id: i.id,
        title: i.title,
        description: i.description,
        used: i.used,
      })),
    });
  } catch (error) {
    console.error('Idea generation error:', error);
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
  try {
    const ideas = await prisma.idea.findMany({
      orderBy: { createdAt: 'desc' },
    });

    const unused = ideas.filter((i: Idea) => !i.used).length;

    return NextResponse.json({
      total: ideas.length,
      unused,
      ideas: ideas.map((i: Idea) => ({
        id: i.id,
        title: i.title,
        description: i.description,
        used: i.used,
        createdAt: i.createdAt,
      })),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
