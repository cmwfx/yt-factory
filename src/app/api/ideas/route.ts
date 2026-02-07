import { NextRequest, NextResponse } from 'next/server';
import { getAllIdeas, createIdea, deleteIdeas } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const usedParam = searchParams.get('used');

    const filters: { used?: boolean } = {};
    if (usedParam === 'true') {
      filters.used = true;
    } else if (usedParam === 'false') {
      filters.used = false;
    }

    const ideas = await getAllIdeas(filters);
    const unused = ideas.filter((i) => !i.used).length;

    return NextResponse.json({
      total: ideas.length,
      unused,
      ideas,
    });
  } catch (error) {
    console.error('Failed to get ideas:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (!body.title || !body.description) {
      return NextResponse.json(
        { error: 'Title and description are required' },
        { status: 400 }
      );
    }

    const idea = await createIdea(body.title, body.description);

    return NextResponse.json({
      success: true,
      idea,
    });
  } catch (error) {
    console.error('Failed to create idea:', error);

    // Handle unique constraint violation
    if (error instanceof Error && error.message.includes('Unique constraint')) {
      return NextResponse.json(
        { error: 'An idea with this title already exists' },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();

    if (!body.ids || !Array.isArray(body.ids) || body.ids.length === 0) {
      return NextResponse.json(
        { error: 'ids array is required' },
        { status: 400 }
      );
    }

    const deletedCount = await deleteIdeas(body.ids);

    return NextResponse.json({
      success: true,
      deletedCount,
    });
  } catch (error) {
    console.error('Failed to delete ideas:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
