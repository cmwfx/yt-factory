import { NextRequest, NextResponse } from 'next/server';
import { getVideo } from '@/lib/db';
import { loadJson } from '@/utils/fileStore';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;

  const video = await getVideo(id);
  if (!video) {
    return NextResponse.json({ error: 'Video not found' }, { status: 404 });
  }

  if (video.status !== 'review') {
    return NextResponse.json({ error: 'Video not in review state' }, { status: 400 });
  }

  // Verify required files exist
  const { fileExists } = await import('@/utils/fileStore');
  const requiredFiles = ['scene_meta_aligned.json', 'scene_meta.json', 'captions.json'];

  for (const filename of requiredFiles) {
    const exists = await fileExists(id, filename);
    if (!exists) {
      return NextResponse.json(
        { error: `Missing required file: ${filename}. Cannot load review data.` },
        { status: 500 }
      );
    }
  }

  // Load data files
  const alignedScenes = (await loadJson(id, 'scene_meta_aligned.json')) as any[];
  const sceneMeta = (await loadJson(id, 'scene_meta.json')) as any[];
  const transcription = (await loadJson(id, 'captions.json')) as any;
  const reviewMetadata = (await loadJson(id, 'review_metadata.json')) as any;

  // Build review scene data
  const scenes = alignedScenes.map((scene: any, idx: number) => {
    // Extract just the filename from the full path for the image
    const imageFilename = scene.imagePath
      ? scene.imagePath.split(/[\\/]/).pop()
      : `scene_${idx.toString().padStart(3, '0')}.png`;

    return {
      sceneIndex: idx,
      text: scene.text,
      audioPath: `/api/jobs/${id}/files/audio.wav`, // Single audio file for all scenes
      imagePath: `/api/jobs/${id}/files/${imageFilename}`,
      imagePrompt: sceneMeta[idx]?.nanoPrompt || '',
      startTime: scene.startTime,
      endTime: scene.endTime,
      duration: scene.duration,
      wordCount: scene.wordCount,
      confidence: reviewMetadata?.failedScenes?.includes(idx) ? 60 : 90,
      alignmentMethod: reviewMetadata?.alignmentMethod || 'unknown',
    };
  });

  return NextResponse.json({
    videoId: id,
    scenes,
    transcriptionWords: transcription?.words || [],
    alignmentConfidence: reviewMetadata?.averageMatchScore || null,
    totalScenes: scenes.length,
  });
}
