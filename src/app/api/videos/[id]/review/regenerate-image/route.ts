import { NextRequest, NextResponse } from 'next/server';
import { loadJson, saveJson, getFilePath } from '@/utils/fileStore';
import { generateSceneImage } from '@/ai/nanoBanana';

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const { sceneIndex, newPrompt } = await request.json();

  // Load scene metadata
  const scenes = (await loadJson(id, 'scene_meta.json')) as any[];
  const alignedScenes = (await loadJson(id, 'scene_meta_aligned.json')) as any[];

  const scene = scenes[sceneIndex];

  // Update prompt
  scene.nanoPrompt = newPrompt;

  // Get reference image (previous scene's image)
  const referenceImagePath = sceneIndex > 0
    ? alignedScenes[sceneIndex - 1].imagePath
    : null;

  // Generate new image
  const outputFilename = `scene_${sceneIndex.toString().padStart(3, '0')}.png`;
  const outputPath = getFilePath(id, outputFilename);

  const result = await generateSceneImage(
    scene,
    referenceImagePath,
    outputPath
  );

  // Update aligned scene image path
  alignedScenes[sceneIndex].imagePath = result.imagePath;

  // Save updates
  await saveJson(id, 'scene_meta.json', scenes);
  await saveJson(id, 'scene_meta_aligned.json', alignedScenes);

  return NextResponse.json({
    success: true,
    imagePath: result.imagePath,
  });
}
