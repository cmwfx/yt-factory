import { GoogleGenAI } from '@google/genai';
import { env } from '@/lib/env';
import { buildScenePromptParts } from './nanoBanana';
import { getStyleReferenceBase64 } from '@/utils/fileStore';
import fs from 'fs/promises';
import path from 'path';
import type { Scene, CharacterType } from '@/types';

const client = new GoogleGenAI({ apiKey: env.GOOGLE_GENAI_API_KEY || '' });

const MODEL_NAME = 'gemini-3-pro-image-preview';

interface BatchRequestItem {
  key: string;
  request: {
    model: string;
    contents: Array<{
      parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }>;
    }>;
    generationConfig: {
      responseModalities: string[];
    };
  };
}

/**
 * Build batch requests for a set of scenes.
 */
export function buildBatchRequests(
  scenes: Scene[],
  sceneIndices: number[],
  referenceImages: Map<number, string>,
  characterAnchorImages: Map<CharacterType, string>,
  styleRefBase64: string
): BatchRequestItem[] {
  const requests: BatchRequestItem[] = [];

  for (const idx of sceneIndices) {
    const scene = scenes[idx];
    const refBase64 = referenceImages.get(idx) || null;

    const { text, images } = buildScenePromptParts(
      scene,
      styleRefBase64,
      refBase64,
      characterAnchorImages
    );

    const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];
    parts.push({ text });
    for (const img of images) {
      parts.push({ inlineData: { mimeType: img.mimeType, data: img.data } });
    }

    requests.push({
      key: `scene-${idx.toString().padStart(3, '0')}`,
      request: {
        model: `models/${MODEL_NAME}`,
        contents: [{ parts }],
        generationConfig: {
          responseModalities: ['TEXT', 'IMAGE'],
        },
      },
    });
  }

  return requests;
}

/**
 * Submit a batch job to Gemini Batch API.
 * Returns the batch operation name for polling.
 */
export async function submitBatch(
  requests: BatchRequestItem[],
  displayName: string
): Promise<string> {
  // Build inline requests — src accepts InlinedRequest[] directly
  const inlineRequests = requests.map(r => ({
    contents: r.request.contents.map(c => ({
      parts: c.parts,
    })),
    metadata: { key: r.key },
    config: { responseModalities: r.request.generationConfig.responseModalities },
  }));

  const response = await client.batches.create({
    model: `models/${MODEL_NAME}`,
    src: inlineRequests as any, // InlinedRequest[]
    config: {
      displayName,
    },
  });

  return response.name || '';
}

/**
 * Check the status of a batch job.
 */
export async function checkBatchStatus(batchName: string): Promise<{
  state: string;
}> {
  const batch = await client.batches.get({ name: batchName });
  return {
    state: batch.state || 'JOB_STATE_UNSPECIFIED',
  };
}

/**
 * Download batch results and save images to disk.
 * Returns a map of sceneIndex → image file path.
 */
export async function downloadBatchResults(
  batchName: string,
  sceneIndices: number[],
  outputDir: string
): Promise<Map<number, string>> {
  const batch = await client.batches.get({ name: batchName });
  const results = new Map<number, string>();

  // Access inlined responses from dest
  const inlinedResponses = batch.dest?.inlinedResponses;
  if (!inlinedResponses || inlinedResponses.length === 0) {
    console.warn('[batchImageGen] No inlined responses in batch result');
    return results;
  }

  for (const inlinedResponse of inlinedResponses) {
    // The key is stored in metadata or we match by order
    const responseBody = inlinedResponse.response;
    if (!responseBody?.candidates) continue;

    for (const candidate of responseBody.candidates) {
      for (const part of candidate.content?.parts || []) {
        if (part.inlineData?.data) {
          // We need to figure out which scene this belongs to
          // The responses come in the same order as the requests
          const responseIdx = inlinedResponses.indexOf(inlinedResponse);
          if (responseIdx >= 0 && responseIdx < sceneIndices.length) {
            const sceneIdx = sceneIndices[responseIdx];
            const filename = `scene_${sceneIdx.toString().padStart(3, '0')}.png`;
            const outputPath = path.join(outputDir, filename);

            const imageBuffer = Buffer.from(part.inlineData.data, 'base64');
            await fs.writeFile(outputPath, imageBuffer);
            results.set(sceneIdx, outputPath);
            console.log(`[batchImageGen] Saved scene ${sceneIdx} → ${outputPath}`);
          }
          break;
        }
      }
    }
  }

  return results;
}

/**
 * Read an image file and return its base64 encoding.
 */
export async function readImageAsBase64(imagePath: string): Promise<string> {
  const buffer = await fs.readFile(imagePath);
  return buffer.toString('base64');
}

export { getStyleReferenceBase64 };
