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
      audioPath: `/jobs/${id}/audio.wav`, // Single audio file for all scenes
      imagePath: `/jobs/${id}/${imageFilename}`,
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
