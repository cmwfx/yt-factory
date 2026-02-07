import { NextRequest, NextResponse } from 'next/server';
import { loadJson, saveJson } from '@/utils/fileStore';
import { adjustSceneWords } from '@/utils/reviewAdjustments';

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const { sceneIndex, wordDelta } = await request.json();

  // Load current data
  const alignedScenes = (await loadJson(id, 'scene_meta_aligned.json')) as any[];
  const transcription = (await loadJson(id, 'captions.json')) as any;

  // Adjust scene word boundaries
  const adjusted = adjustSceneWords(alignedScenes, transcription, sceneIndex, wordDelta);

  // Save updated alignment
  await saveJson(id, 'scene_meta_aligned.json', adjusted);

  // Format scenes with correct paths (consistent with review endpoint)
  const formatScene = (scene: any, idx: number) => {
    const imageFilename = scene.imagePath
      ? scene.imagePath.split(/[\\/]/).pop()
      : `scene_${idx.toString().padStart(3, '0')}.png`;

    return {
      sceneIndex: idx,
      text: scene.text,
      audioPath: `/jobs/${id}/audio.wav`,
      imagePath: `/jobs/${id}/${imageFilename}`,
      startTime: scene.startTime,
      endTime: scene.endTime,
      duration: scene.duration,
      wordCount: scene.wordCount,
    };
  };

  return NextResponse.json({
    success: true,
    updatedScene: formatScene(adjusted[sceneIndex], sceneIndex),
    nextScene: adjusted[sceneIndex + 1] ? formatScene(adjusted[sceneIndex + 1], sceneIndex + 1) : null,
  });
}
