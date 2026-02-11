import { GoogleGenAI } from '@google/genai';
import { env } from '@/lib/env';
import { buildScenePromptParts } from './nanoBanana';
import { getStyleReferenceBase64 } from '@/utils/fileStore';
import fs from 'fs/promises';
import path from 'path';
import { createReadStream, createWriteStream } from 'fs';
import { parser } from 'stream-json';
import { pick } from 'stream-json/filters/Pick';
import { streamArray } from 'stream-json/streamers/StreamArray';
import type { Scene, CharacterType, ChannelConfig } from '@/types';

const client = new GoogleGenAI({ apiKey: env.GOOGLE_GENAI_API_KEY || '' });

const MODEL_NAME = 'gemini-3-pro-image-preview';

// ── In-memory download progress tracking ──
// Uses globalThis so the Map is shared across all Next.js module instances
// (the poller and SSE route handler may load separate copies of this module)

export interface BatchDownloadProgress {
  bytesDownloaded: number;
  startedAt: number; // ms timestamp
}

const globalKey = '__batchDownloadProgress' as const;

function getProgressMap(): Map<string, BatchDownloadProgress> {
  if (!(globalThis as any)[globalKey]) {
    (globalThis as any)[globalKey] = new Map<string, BatchDownloadProgress>();
  }
  return (globalThis as any)[globalKey];
}

export function getDownloadProgress(batchName: string): BatchDownloadProgress | undefined {
  return getProgressMap().get(batchName);
}

export function getAllDownloadProgress(): Map<string, BatchDownloadProgress> {
  return getProgressMap();
}

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
  styleRefBase64: string,
  channelConfig?: ChannelConfig
): BatchRequestItem[] {
  const imageModelName = channelConfig?.imageGenModel || MODEL_NAME;
  const requests: BatchRequestItem[] = [];

  for (const idx of sceneIndices) {
    const scene = scenes[idx];
    const refBase64 = referenceImages.get(idx) || null;

    const { text, images } = buildScenePromptParts(
      scene,
      styleRefBase64,
      refBase64,
      characterAnchorImages,
      channelConfig
    );

    const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];
    parts.push({ text });
    for (const img of images) {
      parts.push({ inlineData: { mimeType: img.mimeType, data: img.data } });
    }

    requests.push({
      key: `scene-${idx.toString().padStart(3, '0')}`,
      request: {
        model: `models/${imageModelName}`,
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
  displayName: string,
  channelConfig?: ChannelConfig
): Promise<string> {
  const imageModelName = channelConfig?.imageGenModel || MODEL_NAME;
  // Build inline requests — src accepts InlinedRequest[] directly
  const inlineRequests = requests.map(r => ({
    contents: r.request.contents.map(c => ({
      parts: c.parts,
    })),
    metadata: { key: r.key },
    config: { responseModalities: r.request.generationConfig.responseModalities },
  }));

  const response = await client.batches.create({
    model: `models/${imageModelName}`,
    src: inlineRequests as any, // InlinedRequest[]
    config: {
      displayName,
    },
  });

  return response.name || '';
}

/**
 * Check the status of a batch job.
 * Uses list() with a name filter instead of get() to avoid downloading
 * the full batch payload (which includes inlined base64 image data and
 * hangs indefinitely on large batches).
 */
export async function checkBatchStatus(batchName: string): Promise<{
  state: string;
}> {
  const abort = AbortSignal.timeout(30_000);
  // list() returns metadata-only BatchJob objects (no inlined image data)
  const pager = await client.batches.list({
    config: { pageSize: 100, abortSignal: abort },
  });

  // Iterate through pages to find our batch by name
  for await (const batch of pager) {
    if (batch.name === batchName) {
      return { state: batch.state || 'JOB_STATE_UNSPECIFIED' };
    }
  }

  // Batch not found in list — fall back to get() with a tight timeout
  console.warn(`[batchImageGen] Batch ${batchName} not found via list(), falling back to get()`);
  const fallbackAbort = AbortSignal.timeout(15_000);
  const batch = await client.batches.get({
    name: batchName,
    config: { abortSignal: fallbackAbort },
  });
  return { state: batch.state || 'JOB_STATE_UNSPECIFIED' };
}

/**
 * Download batch results and save images to disk.
 * Returns a map of sceneIndex → image file path.
 *
 * Tries the SDK first with a timeout, then falls back to a raw REST call
 * for very large batches where the SDK hangs.
 */
export async function downloadBatchResults(
  batchName: string,
  sceneIndices: number[],
  outputDir: string
): Promise<Map<number, string>> {
  const results = new Map<number, string>();

  let inlinedResponses: any[] | undefined;

  // Try SDK first with a 2-minute timeout
  try {
    const sdkAbort = AbortSignal.timeout(120_000);
    console.log(`[batchImageGen] Downloading batch via SDK: ${batchName}`);
    const batch = await client.batches.get({
      name: batchName,
      config: { abortSignal: sdkAbort },
    });
    inlinedResponses = batch.dest?.inlinedResponses as any[] | undefined;
  } catch (sdkErr: any) {
    const msg = sdkErr?.message || String(sdkErr);
    console.warn(`[batchImageGen] SDK download failed for ${batchName}: ${msg} — trying raw REST fallback...`);
  }

  // Fallback: raw REST fetch with streaming parser for large batches
  if (!inlinedResponses || inlinedResponses.length === 0) {
    try {
      const restResults = await fetchBatchResultsRaw(batchName, sceneIndices, outputDir);
      // Merge REST results into the results map
      for (const [sceneIdx, filePath] of restResults) {
        results.set(sceneIdx, filePath);
      }
      return results;
    } catch (restErr) {
      console.error(`[batchImageGen] REST fallback also failed for ${batchName}:`, restErr);
      return results;
    }
  }

  for (const inlinedResponse of inlinedResponses) {
    const responseBody = inlinedResponse.response;
    if (!responseBody?.candidates) continue;

    // Extract scene index from response metadata key (key-based matching)
    const key = (inlinedResponse as any).metadata?.key;
    const sceneIdx = extractSceneIndexFromKey(key);

    if (sceneIdx === null) {
      console.warn(`[batchImageGen] SDK: Could not extract scene index from key: ${key}`);
      continue;
    }

    // Verify this scene index is in our expected list
    if (!sceneIndices.includes(sceneIdx)) {
      console.warn(`[batchImageGen] SDK: Scene ${sceneIdx} not in expected indices list`);
      continue;
    }

    for (const candidate of responseBody.candidates) {
      for (const part of candidate.content?.parts || []) {
        if (part.inlineData?.data) {
          const filename = `scene_${sceneIdx.toString().padStart(3, '0')}.png`;
          const outputPath = path.join(outputDir, filename);

          const imageBuffer = Buffer.from(part.inlineData.data, 'base64');
          await fs.writeFile(outputPath, imageBuffer);
          results.set(sceneIdx, outputPath);
          console.log(`[batchImageGen] SDK: Saved scene ${sceneIdx} → ${outputPath}`);
          break;
        }
      }
    }
  }

  return results;
}

/**
 * Raw REST fallback to download batch results when the SDK times out.
 * Streams the response to a temp file (with backpressure handling), then
 * uses stream-json to parse incrementally — avoiding V8's ~512MB string limit.
 * Images are decoded and written to disk one at a time during streaming.
 */
async function fetchBatchResultsRaw(
  batchName: string,
  sceneIndices: number[],
  outputDir: string
): Promise<Map<number, string>> {
  const results = new Map<number, string>();
  const apiKey = env.GOOGLE_GENAI_API_KEY;
  if (!apiKey) throw new Error('GOOGLE_GENAI_API_KEY not set');

  const url = `https://generativelanguage.googleapis.com/v1beta/${batchName}?key=${apiKey}`;
  console.log(`[batchImageGen] REST fallback: streaming GET ${batchName}`);

  const resp = await fetch(url, {
    headers: { 'Accept': 'application/json' },
  });

  if (!resp.ok) {
    throw new Error(`REST batch fetch failed: ${resp.status} ${resp.statusText}`);
  }

  if (!resp.body) {
    throw new Error('REST batch fetch returned no body');
  }

  // Stream response body to a temp file with backpressure handling
  const safeName = batchName.replace(/\//g, '_');
  const tmpPath = path.join('/tmp', `batch-${safeName}.json`);
  const writer = createWriteStream(tmpPath);

  let bytesWritten = 0;
  let lastLogAt = Date.now();
  const startedAt = Date.now();
  const reader = resp.body.getReader();

  // Track progress for frontend
  getProgressMap().set(batchName, { bytesDownloaded: 0, startedAt });

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      // Handle backpressure: if write() returns false, wait for drain
      const canContinue = writer.write(value);
      bytesWritten += value.length;

      if (!canContinue) {
        await new Promise<void>(resolve => writer.once('drain', resolve));
      }

      // Update progress tracker
      getProgressMap().set(batchName, { bytesDownloaded: bytesWritten, startedAt });

      // Log progress every 30 seconds
      const now = Date.now();
      if (now - lastLogAt > 30_000) {
        console.log(`[batchImageGen] REST download progress: ${(bytesWritten / 1024 / 1024).toFixed(1)}MB`);
        lastLogAt = now;
      }
    }

    // Clear progress tracking when download phase done
    getProgressMap().delete(batchName);

    await new Promise<void>((resolve, reject) => {
      writer.end(() => resolve());
      writer.on('error', reject);
    });

    console.log(`[batchImageGen] REST download complete: ${(bytesWritten / 1024 / 1024).toFixed(1)}MB → ${tmpPath}`);

    // Stream-parse the JSON file and extract images incrementally.
    // REST response structure: { metadata: { output: { inlinedResponses: { inlinedResponses: [...] } } } }
    const jsonStream = createReadStream(tmpPath)
      .pipe(parser())
      .pipe(pick({ filter: 'metadata.output.inlinedResponses.inlinedResponses' }))
      .pipe(streamArray());

    for await (const { value: inlinedResponse } of jsonStream) {
      const responseBody = inlinedResponse?.response;
      if (!responseBody?.candidates) continue;

      // Extract scene index from response metadata key (key-based matching)
      const key = inlinedResponse?.metadata?.key;
      const sceneIdx = extractSceneIndexFromKey(key);

      if (sceneIdx === null) {
        console.warn(`[batchImageGen] REST: Could not extract scene index from key: ${key}`);
        continue;
      }

      // Verify this scene index is in our expected list
      if (!sceneIndices.includes(sceneIdx)) {
        console.warn(`[batchImageGen] REST: Scene ${sceneIdx} not in expected indices list`);
        continue;
      }

      let saved = false;
      for (const candidate of responseBody.candidates) {
        if (saved) break;
        for (const part of candidate.content?.parts || []) {
          if (part.inlineData?.data) {
            const filename = `scene_${sceneIdx.toString().padStart(3, '0')}.png`;
            const outputPath = path.join(outputDir, filename);

            const imageBuffer = Buffer.from(part.inlineData.data, 'base64');
            await fs.writeFile(outputPath, imageBuffer);
            results.set(sceneIdx, outputPath);
            console.log(`[batchImageGen] REST: Saved scene ${sceneIdx} → ${outputPath} (${(imageBuffer.length / 1024).toFixed(0)}KB)`);
            saved = true;
            break;
          }
        }
      }
    }

    console.log(`[batchImageGen] REST fallback extracted ${results.size}/${sceneIndices.length} images`);
  } finally {
    // Always clean up the temp file (500MB+ files must not accumulate)
    await fs.unlink(tmpPath).catch(() => {});
  }

  return results;
}

/**
 * Extract scene index from batch response key.
 * Key format: "scene-000", "scene-007", "scene-012", etc.
 * Returns null if key is missing or invalid.
 */
function extractSceneIndexFromKey(key: string | undefined): number | null {
  if (!key) return null;
  const match = key.match(/^scene-(\d+)$/);
  if (!match) return null;
  return parseInt(match[1], 10);
}

/**
 * Read an image file and return its base64 encoding.
 */
export async function readImageAsBase64(imagePath: string): Promise<string> {
  const buffer = await fs.readFile(imagePath);
  return buffer.toString('base64');
}

export { getStyleReferenceBase64 };
