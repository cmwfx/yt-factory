import { NextRequest, NextResponse } from 'next/server';
import { getFilePath } from '@/utils/fileStore';
import fs from 'fs';
import path from 'path';

// Allowed file patterns for security
const ALLOWED_PATTERNS = [
  /^scene_\d{3}\.png$/,           // scene_000.png to scene_999.png
  /^audio\.wav$/,                  // audio.wav
  /^thumbnail_\d+\.png$/,          // thumbnail_1.png, thumbnail_2.png, etc.
];

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string; filename: string }> }
) {
  const { id, filename } = await context.params;

  // Security: Validate filename against allowed patterns
  const isAllowed = ALLOWED_PATTERNS.some(pattern => pattern.test(filename));
  if (!isAllowed) {
    return NextResponse.json(
      { error: 'Access denied: Invalid filename pattern' },
      { status: 403 }
    );
  }

  // Security: Prevent directory traversal
  if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    return NextResponse.json(
      { error: 'Access denied: Invalid filename' },
      { status: 403 }
    );
  }

  try {
    const filePath = getFilePath(id, filename);

    // Check if file exists
    if (!fs.existsSync(filePath)) {
      return NextResponse.json(
        { error: 'File not found' },
        { status: 404 }
      );
    }

    // Read file from disk
    const fileBuffer = fs.readFileSync(filePath);

    // Determine content type
    const ext = path.extname(filename).toLowerCase();
    let contentType = 'application/octet-stream';
    if (ext === '.png') {
      contentType = 'image/png';
    } else if (ext === '.wav') {
      contentType = 'audio/wav';
    }

    // Return file with aggressive caching headers
    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch (error) {
    console.error('Error serving file:', error);
    return NextResponse.json(
      { error: 'Failed to read file' },
      { status: 500 }
    );
  }
}
