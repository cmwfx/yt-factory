import { NextRequest, NextResponse } from 'next/server';
import { getChannel, updateChannel } from '@/lib/db';
import fs from 'fs/promises';
import path from 'path';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const channel = await getChannel(id);
    if (!channel) {
      return NextResponse.json({ error: 'Channel not found' }, { status: 404 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // Validate file type
    if (!file.type.startsWith('image/')) {
      return NextResponse.json({ error: 'File must be an image' }, { status: 400 });
    }

    // Get extension from mime type
    const ext = file.type.split('/')[1] || 'png';
    const channelDir = path.join(process.cwd(), 'assets', 'channels', id);
    await fs.mkdir(channelDir, { recursive: true });

    const filePath = path.join(channelDir, `style-reference.${ext}`);
    const buffer = Buffer.from(await file.arrayBuffer());
    await fs.writeFile(filePath, buffer);

    // Update channel record with relative path
    const relativePath = `assets/channels/${id}/style-reference.${ext}`;
    await updateChannel(id, { styleReferencePath: relativePath });

    return NextResponse.json({
      success: true,
      path: relativePath,
    });
  } catch (error) {
    console.error('Failed to upload style reference:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
