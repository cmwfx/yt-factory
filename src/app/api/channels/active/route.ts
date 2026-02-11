import { NextRequest, NextResponse } from 'next/server';
import { getChannel, getDefaultChannel } from '@/lib/db';
import { cookies } from 'next/headers';

const COOKIE_NAME = 'yt-factory-active-channel';

export async function GET() {
  try {
    const cookieStore = await cookies();
    const channelId = cookieStore.get(COOKIE_NAME)?.value;

    let channel;
    if (channelId) {
      channel = await getChannel(channelId);
    }
    if (!channel) {
      channel = await getDefaultChannel();
    }

    return NextResponse.json({ channel });
  } catch (error) {
    console.error('Failed to get active channel:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { channelId } = body;

    if (!channelId) {
      return NextResponse.json({ error: 'channelId is required' }, { status: 400 });
    }

    const channel = await getChannel(channelId);
    if (!channel) {
      return NextResponse.json({ error: 'Channel not found' }, { status: 404 });
    }

    const response = NextResponse.json({ channel });
    response.cookies.set(COOKIE_NAME, channelId, {
      httpOnly: false,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 365, // 1 year
      path: '/',
    });

    return response;
  } catch (error) {
    console.error('Failed to set active channel:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
