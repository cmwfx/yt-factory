import { NextRequest, NextResponse } from 'next/server';
import { getVideo, updateVideoStatus, resetStepsFromStep } from '@/lib/db';
import { fileExists } from '@/utils/fileStore';

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;

  try {
    // Validate video exists
    const video = await getVideo(id);
    if (!video) {
      return NextResponse.json(
        { error: 'Video not found' },
        { status: 404 }
      );
    }

    // Validate video status is 'done'
    if (video.status !== 'done') {
      return NextResponse.json(
        { error: `Cannot revert video with status '${video.status}'. Only completed videos (status='done') can be reverted to review.` },
        { status: 400 }
      );
    }

    // Verify required files exist
    const requiredFiles = [
      'scene_meta_aligned.json',
      'captions.json',
      'audio.wav',
      'scene_meta.json'
    ];

    const missingFiles: string[] = [];
    for (const filename of requiredFiles) {
      const exists = await fileExists(id, filename);
      if (!exists) {
        missingFiles.push(filename);
      }
    }

    if (missingFiles.length > 0) {
      return NextResponse.json(
        {
          error: `Cannot revert to review: Missing required files: ${missingFiles.join(', ')}`
        },
        { status: 400 }
      );
    }

    // Reset pipeline state from 'review' step
    await resetStepsFromStep(id, 'review');

    // Update video status to 'review'
    await updateVideoStatus(id, 'review');

    return NextResponse.json({
      success: true,
      message: 'Video reverted to review state successfully',
    });
  } catch (error) {
    console.error('Error reverting video to review:', error);
    return NextResponse.json(
      { error: 'Failed to revert video to review' },
      { status: 500 }
    );
  }
}
