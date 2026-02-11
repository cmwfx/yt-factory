import { NextRequest, NextResponse } from 'next/server';
import { getChannel, updateChannel, deleteChannel } from '@/lib/db';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const channel = await getChannel(id);
    if (!channel) {
      return NextResponse.json({ error: 'Channel not found' }, { status: 404 });
    }
    return NextResponse.json({ channel });
  } catch (error) {
    console.error('Failed to get channel:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    // Don't allow updating id
    delete body.id;

    const channel = await updateChannel(id, body);
    return NextResponse.json({ channel });
  } catch (error) {
    console.error('Failed to update channel:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Prevent deleting the default channel
    const channel = await getChannel(id);
    if (!channel) {
      return NextResponse.json({ error: 'Channel not found' }, { status: 404 });
    }
    if (channel.isDefault) {
      return NextResponse.json(
        { error: 'Cannot delete the default channel' },
        { status: 400 }
      );
    }

    await deleteChannel(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete channel:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
