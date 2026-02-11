import { GoogleGenerativeAI } from '@google/generative-ai';
import { GoogleGenAI } from '@google/genai';
import { env } from '@/lib/env';
import { NANOBANANA_STYLE_INSTRUCTION } from '@/lib/channelBrief';
import { withRetry } from '@/utils/retry';
import { getStyleReferenceBase64, getStyleReferenceBase64ForChannel } from '@/utils/fileStore';
import fs from 'fs/promises';
import type { Scene, CharacterType, ChannelConfig } from '@/types';

const DEFAULT_CHARACTER_DISPLAY_NAMES: Record<string, string> = {
  THE_VICTIM: 'the ordinary person',
  THE_SUIT: 'the man in the suit',
  THE_SYSTEM: 'the abstract system',
};

function sanitizeCharacterNames(prompt: string, displayNames?: Record<string, string>): string {
  const names = displayNames || DEFAULT_CHARACTER_DISPLAY_NAMES;
  let result = prompt;
  for (const [token, label] of Object.entries(names)) {
    result = result.replace(new RegExp(token, 'gi'), label);
  }
  return result;
}

const genAI = new GoogleGenerativeAI(env.GOOGLE_GENAI_API_KEY || '');
const genAINew = new GoogleGenAI({ apiKey: env.GOOGLE_GENAI_API_KEY || '' });

export interface UsageMetadata {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  totalTokenCount?: number;
  thoughtsTokenCount?: number;
}

// Use gemini-3-pro-image-preview for image generation (upgraded from gemini-2.5-flash-image)
const MODEL_NAME = 'gemini-3-pro-image-preview';

// Module-level state to track character first appearances
const characterFirstAppearance: Map<CharacterType, string> = new Map();

/**
 * Reset character memory between video generations.
 */
export function resetCharacterMemory(): void {
  characterFirstAppearance.clear();
  console.log('[DEBUG nanoBanana] Character memory reset');
}

/**
 * Pre-populate a character anchor so generateSceneImage() can use it
 * in contexts where images were generated externally (e.g. batch).
 */
export function setCharacterFirstAppearance(char: CharacterType, imagePath: string): void {
  if (!characterFirstAppearance.has(char)) {
    characterFirstAppearance.set(char, imagePath);
  }
}

/**
 * Read an image file and return its base64 encoding.
 */
async function readImageAsBase64(imagePath: string): Promise<string> {
  const buffer = await fs.readFile(imagePath);
  return buffer.toString('base64');
}

/**
 * Build character reference prompt for scenes with recurring characters.
 */
function buildCharacterReferencePrompt(characters: CharacterType[], startRefIndex: number, displayNames?: Record<string, string>): string {
  const names = displayNames || DEFAULT_CHARACTER_DISPLAY_NAMES;
  const lines: string[] = [];
  let refIndex = startRefIndex;

  for (const char of characters) {
    if (characterFirstAppearance.has(char)) {
      const displayName = names[char] || char;
      lines.push(`Reference ${refIndex} shows the EXACT character model for ${displayName}. This character MUST look identical to Reference ${refIndex} in this scene.`);
      refIndex++;
    }
  }

  return lines.length > 0 ? '\n\nCHARACTER CONSISTENCY:\n' + lines.join('\n') : '';
}

/**
 * Generate prompt for NEW_SCENE visual type.
 */
function generateNewScenePrompt(nanoPrompt: string, characterRefPrompt: string): string {
  return `Generate a NEW scene with the following content:
${nanoPrompt}

This is a fresh scene establishing a new location or context.
${characterRefPrompt}

Requirements:
- CRITICAL: Use the CRUMPLED BROWN PAPER TEXTURE background from the style reference (with visible wrinkles/creases)
- 16:9 aspect ratio (1920x1080)
- Black ink stick figure style with purple accent details
- Warm brown/tan color palette
- DO NOT use a plain, flat, or smooth background`;
}

/**
 * Generate prompt for CHARACTER_REACTION visual type (edit mode).
 */
function generateEditPrompt(nanoPrompt: string): string {
  return `EDIT the attached reference image.

KEEP EXACTLY THE SAME:
- Background/setting
- Camera angle
- Character body position
- The crumpled brown paper texture

CHANGE ONLY:
- Facial expression
- Arm/hand position
- Any specific element mentioned below

MODIFICATION: ${nanoPrompt}

DO NOT redraw the entire scene. This is an EDIT, not a new generation.
Maintain the exact same visual style and background texture.`;
}

/**
 * Generate prompt for OBJECT_FOCUS visual type.
 */
function generateFocusPrompt(nanoPrompt: string): string {
  return `Create a ZOOMED/FOCUSED view based on the reference image.

Focus on: ${nanoPrompt}

Requirements:
- Zoom in on the specified element from the reference
- Maintain the same crumpled brown paper texture background
- Keep the same artistic style
- 16:9 aspect ratio (1920x1080)`;
}

/**
 * Generate an image for a scene using Gemini image generation.
 * Uses reference images to maintain visual consistency across scenes.
 * Differentiates between NEW_SCENE (full generation), CHARACTER_REACTION (edit), and OBJECT_FOCUS (zoom).
 */
export async function generateSceneImage(
  scene: Scene,
  previousImagePath: string | null,
  outputPath: string,
  channelConfig?: ChannelConfig
): Promise<{ imagePath: string; usageMetadata?: UsageMetadata }> {
  const imageModel = channelConfig?.imageGenModel || MODEL_NAME;
  // Configure model for image generation with responseModalities
  const model = genAI.getGenerativeModel({
    model: imageModel,
    generationConfig: {
      // @ts-ignore - responseModalities is valid for image generation
      responseModalities: ['TEXT', 'IMAGE'],
    },
  });

  // Get style reference image
  const styleRefBase64 = channelConfig
    ? getStyleReferenceBase64ForChannel(channelConfig.styleReferencePath)
    : getStyleReferenceBase64();

  const styleInstr = channelConfig?.styleInstruction || NANOBANANA_STYLE_INSTRUCTION;
  const displayNames = channelConfig?.characterDisplayNames || DEFAULT_CHARACTER_DISPLAY_NAMES;

  // Build the content parts - order matters for reference images
  const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];

  // Base style instruction that emphasizes using reference images
  const stylePrefix = `CRITICAL INSTRUCTION: You MUST generate an image that EXACTLY copies the visual style from the reference image.

MOST IMPORTANT - BACKGROUND: The reference image shows the exact background texture to use. You MUST replicate this EXACT background texture. DO NOT use a plain, flat, or smooth background.

${styleInstr}

CHARACTER REFERENCES: Character names in the prompt are descriptions of WHO is in the scene. They are NOT text that should appear in the image. Do NOT render these as labels, captions, name tags, arrows, or any visible text pointing to characters. Draw the characters visually — show them acting out the scene.

REMINDER: The background texture from the reference image is NON-NEGOTIABLE. Look at the reference image and copy that exact textured background.`;

  // Get the visual type, defaulting to NEW_SCENE for backward compatibility
  const visualType = scene.visualType || 'NEW_SCENE';
  const characters = scene.characters || [];
  const sanitizedNanoPrompt = sanitizeCharacterNames(scene.nanoPrompt, displayNames);

  // Build the full prompt based on visual type
  let fullPrompt: string;

  console.log(`[DEBUG nanoBanana] Scene ${scene.sceneIndex}: visualType=${visualType}, characters=${characters.join(',')}`);

  if (visualType === 'CHARACTER_REACTION' && previousImagePath) {
    // EDIT mode - keep background, change expression/pose
    try {
      const prevImageBase64 = await readImageAsBase64(previousImagePath);

      fullPrompt = `${stylePrefix}

${generateEditPrompt(sanitizedNanoPrompt)}`;

      // 1. Text prompt first
      parts.push({ text: fullPrompt });

      // 2. Previous scene as the base to edit (most important for edit mode)
      parts.push({
        inlineData: {
          mimeType: 'image/png',
          data: prevImageBase64,
        },
      });

      // 3. Style reference for consistency
      parts.push({
        inlineData: {
          mimeType: 'image/png',
          data: styleRefBase64,
        },
      });

      console.log(`[DEBUG nanoBanana] Scene ${scene.sceneIndex}: CHARACTER_REACTION - edit mode with previous scene`);
    } catch (err) {
      console.warn(`[DEBUG nanoBanana] Could not read previous image for edit, falling back to NEW_SCENE:`, err);
      // Fall back to NEW_SCENE behavior
      const characterRefPrompt = buildCharacterReferencePrompt(characters, 2, displayNames);
      fullPrompt = `${stylePrefix}\n\n${generateNewScenePrompt(sanitizedNanoPrompt, characterRefPrompt)}`;
      parts.push({ text: fullPrompt });
      parts.push({ inlineData: { mimeType: 'image/png', data: styleRefBase64 } });
    }
  } else if (visualType === 'OBJECT_FOCUS' && previousImagePath) {
    // FOCUS mode - zoom on detail from previous scene
    try {
      const prevImageBase64 = await readImageAsBase64(previousImagePath);

      fullPrompt = `${stylePrefix}

${generateFocusPrompt(sanitizedNanoPrompt)}`;

      // 1. Text prompt first
      parts.push({ text: fullPrompt });

      // 2. Previous scene as reference for what to zoom into
      parts.push({
        inlineData: {
          mimeType: 'image/png',
          data: prevImageBase64,
        },
      });

      // 3. Style reference
      parts.push({
        inlineData: {
          mimeType: 'image/png',
          data: styleRefBase64,
        },
      });

      console.log(`[DEBUG nanoBanana] Scene ${scene.sceneIndex}: OBJECT_FOCUS - zoom mode with previous scene`);
    } catch (err) {
      console.warn(`[DEBUG nanoBanana] Could not read previous image for focus, falling back to NEW_SCENE:`, err);
      const characterRefPrompt = buildCharacterReferencePrompt(characters, 2, displayNames);
      fullPrompt = `${stylePrefix}\n\n${generateNewScenePrompt(sanitizedNanoPrompt, characterRefPrompt)}`;
      parts.push({ text: fullPrompt });
      parts.push({ inlineData: { mimeType: 'image/png', data: styleRefBase64 } });
    }
  } else {
    // NEW_SCENE - full generation with character anchors if available
    const characterRefPrompt = buildCharacterReferencePrompt(characters, 2, displayNames);
    fullPrompt = `${stylePrefix}

${generateNewScenePrompt(sanitizedNanoPrompt, characterRefPrompt)}`;

    // 1. Text prompt first
    parts.push({ text: fullPrompt });

    // 2. Style reference (always first image reference)
    parts.push({
      inlineData: {
        mimeType: 'image/png',
        data: styleRefBase64,
      },
    });

    // 3. Character anchors for recurring characters
    for (const char of characters) {
      const anchorPath = characterFirstAppearance.get(char);
      if (anchorPath) {
        try {
          const anchorBase64 = await readImageAsBase64(anchorPath);
          parts.push({
            inlineData: {
              mimeType: 'image/png',
              data: anchorBase64,
            },
          });
          console.log(`[DEBUG nanoBanana] Scene ${scene.sceneIndex}: Added character anchor for ${char}`);
        } catch (err) {
          console.warn(`[DEBUG nanoBanana] Could not read character anchor for ${char}:`, err);
        }
      }
    }

    console.log(`[DEBUG nanoBanana] Scene ${scene.sceneIndex}: NEW_SCENE - full generation`);
  }

  console.log(`[DEBUG nanoBanana] Generating scene ${scene.sceneIndex}...`);
  console.log(`[DEBUG nanoBanana] Prompt preview: ${sanitizedNanoPrompt.slice(0, 100)}...`);

  const result = await withRetry(
    async () => {
      const response = await model.generateContent({
        contents: [{ role: 'user', parts }],
      });

      const responseData = response.response;

      // Capture usage metadata for cost tracking
      const usageMetadata = responseData.usageMetadata as UsageMetadata | undefined;

      // Extract image from response
      for (const candidate of responseData.candidates || []) {
        for (const part of candidate.content?.parts || []) {
          if ('inlineData' in part && part.inlineData?.data) {
            console.log(`[DEBUG nanoBanana] Got image data for scene ${scene.sceneIndex}`);
            return {
              data: part.inlineData.data,
              usageMetadata,
            };
          }
        }
      }

      // Log response for debugging if no image found
      console.error('[DEBUG nanoBanana] No image in response. Response:', JSON.stringify(responseData, null, 2).slice(0, 500));
      throw new Error('No image data in response');
    },
    {
      maxAttempts: 3,
      baseDelayMs: 2000,
      onRetry: (error, attempt) => {
        console.log(`[DEBUG nanoBanana] Image generation retry ${attempt}: ${error.message}`);
      },
    }
  );

  // Save the image
  const imageBuffer = Buffer.from(result.data, 'base64');
  await fs.writeFile(outputPath, imageBuffer);

  // Register character first appearances after successful generation
  for (const char of characters) {
    if (!characterFirstAppearance.has(char)) {
      characterFirstAppearance.set(char, outputPath);
      console.log(`[DEBUG nanoBanana] Registered ${char} first appearance: ${outputPath}`);
    }
  }

  console.log(`[DEBUG nanoBanana] Generated image for scene ${scene.sceneIndex}: ${outputPath}`);
  return {
    imagePath: outputPath,
    usageMetadata: result.usageMetadata,
  };
}

/**
 * Generate images for all scenes with visual consistency.
 */
export async function generateAllSceneImages(
  scenes: Scene[],
  outputDir: string,
  onProgress?: (current: number, total: number) => void
): Promise<{ imagePaths: string[]; usageMetadata: UsageMetadata }> {
  // Reset character memory at the start of each video generation
  resetCharacterMemory();

  const imagePaths: string[] = [];
  let previousImagePath: string | null = null;
  // Accumulate usage metadata across all images
  const accumulatedUsage: UsageMetadata = {
    promptTokenCount: 0,
    candidatesTokenCount: 0,
    totalTokenCount: 0,
    thoughtsTokenCount: 0,
  };

  console.log(`[DEBUG nanoBanana] Starting generation of ${scenes.length} scene images`);

  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    const outputPath = `${outputDir}/scene_${i.toString().padStart(3, '0')}.png`;

    if (onProgress) {
      onProgress(i + 1, scenes.length);
    }

    // Use reference image from a previous scene if specified
    let refImagePath = previousImagePath;
    if (scene.referenceImageIndex !== null && scene.referenceImageIndex >= 0 && scene.referenceImageIndex < imagePaths.length) {
      refImagePath = imagePaths[scene.referenceImageIndex];
      console.log(`[DEBUG nanoBanana] Scene ${i}: Using reference from scene ${scene.referenceImageIndex}`);
    } else if (previousImagePath) {
      console.log(`[DEBUG nanoBanana] Scene ${i}: Using previous scene as reference`);
    }

    const result = await generateSceneImage(scene, refImagePath, outputPath);
    imagePaths.push(result.imagePath);

    // Accumulate usage
    if (result.usageMetadata) {
      accumulatedUsage.promptTokenCount! += result.usageMetadata.promptTokenCount || 0;
      accumulatedUsage.candidatesTokenCount! += result.usageMetadata.candidatesTokenCount || 0;
      accumulatedUsage.totalTokenCount! += result.usageMetadata.totalTokenCount || 0;
      accumulatedUsage.thoughtsTokenCount! += result.usageMetadata.thoughtsTokenCount || 0;
    }

    // Update previous image for next iteration
    previousImagePath = result.imagePath;

    // Rate limiting: wait between requests to avoid API limits
    if (i < scenes.length - 1) {
      console.log(`[DEBUG nanoBanana] Waiting 1.5s before next image...`);
      await new Promise(resolve => setTimeout(resolve, 1500));
    }
  }

  console.log(`[DEBUG nanoBanana] Completed generation of ${imagePaths.length} images`);
  return { imagePaths, usageMetadata: accumulatedUsage };
}

/**
 * Generate a standalone YouTube thumbnail image — no style reference, no crumpled paper.
 * Stick figures composited into a hyper-realistic environment with bold text overlay.
 */
export async function generateThumbnailImage(prompt: string, outputPath: string): Promise<string> {
  const model = genAI.getGenerativeModel({
    model: MODEL_NAME,
    generationConfig: {
      // @ts-ignore - responseModalities is valid for image generation
      responseModalities: ['TEXT', 'IMAGE'],
    },
  });

  const stylePrefix = `Generate a YouTube thumbnail image.
- Background: HYPER-REALISTIC, vibrant real-world environment (streets, offices, rooms — whichever the prompt specifies). NOT flat, NOT illustrated, NOT paper texture.
- Characters: 2D MINIMALIST WHITE STICK FIGURES composited into the realistic scene. Simple dot eyes, thin black lines. They should look slightly "out of place" — that's the style.
- Text: Bold, large, high-contrast colored text overlay (red, white, or yellow on dark, or black on bright). 1-3 words max. Positioned for maximum impact.
- Composition: Rule of thirds. Eye-catching. YouTube thumbnail proportions (16:9, 1920x1080).
- Color: Saturated, high contrast. Cinematic lighting.
- DO NOT include any crumpled paper texture. DO NOT use a flat/illustrated background.`;

  const parts: Array<{ text: string }> = [{ text: stylePrefix + '\n\n' + prompt }];

  const result = await withRetry(
    async () => {
      const response = await model.generateContent({
        contents: [{ role: 'user', parts }],
      });

      const responseData = response.response;

      for (const candidate of responseData.candidates || []) {
        for (const part of candidate.content?.parts || []) {
          if ('inlineData' in part && part.inlineData?.data) {
            return part.inlineData.data as string;
          }
        }
      }

      console.error('[DEBUG nanoBanana] No image in thumbnail response. Response:', JSON.stringify(responseData, null, 2).slice(0, 500));
      throw new Error('No image data in thumbnail response');
    },
    {
      maxAttempts: 3,
      baseDelayMs: 2000,
      onRetry: (error, attempt) => {
        console.log(`[DEBUG nanoBanana] Thumbnail image generation retry ${attempt}: ${error.message}`);
      },
    }
  );

  const imageBuffer = Buffer.from(result, 'base64');
  await fs.writeFile(outputPath, imageBuffer);

  console.log(`[DEBUG nanoBanana] Generated thumbnail image: ${outputPath}`);
  return outputPath;
}

/**
 * Build prompt parts for a scene without calling the API.
 * Used by batchImageGen.ts to construct batch requests.
 */
export function buildScenePromptParts(
  scene: Scene,
  styleRefBase64: string,
  referenceImageBase64: string | null,
  characterAnchorImages: Map<CharacterType, string>, // char → base64
  channelConfig?: ChannelConfig
): { text: string; images: { mimeType: string; data: string }[] } {
  const visualType = scene.visualType || 'NEW_SCENE';
  const characters = scene.characters || [];
  const displayNames = channelConfig?.characterDisplayNames || DEFAULT_CHARACTER_DISPLAY_NAMES;
  const sanitizedNanoPrompt = sanitizeCharacterNames(scene.nanoPrompt, displayNames);
  const styleInstr = channelConfig?.styleInstruction || NANOBANANA_STYLE_INSTRUCTION;

  const stylePrefix = `CRITICAL INSTRUCTION: You MUST generate an image that EXACTLY copies the visual style from the reference image.

MOST IMPORTANT - BACKGROUND: The reference image shows the exact background texture to use. You MUST replicate this EXACT background texture. DO NOT use a plain, flat, or smooth background.

${styleInstr}

CHARACTER REFERENCES: Character names in the prompt are descriptions of WHO is in the scene. They are NOT text that should appear in the image. Do NOT render these as labels, captions, name tags, arrows, or any visible text pointing to characters. Draw the characters visually — show them acting out the scene.

REMINDER: The background texture from the reference image is NON-NEGOTIABLE. Look at the reference image and copy that exact textured background.`;

  const images: { mimeType: string; data: string }[] = [];
  let fullPrompt: string;

  if (visualType === 'CHARACTER_REACTION' && referenceImageBase64) {
    fullPrompt = `${stylePrefix}\n\n${generateEditPrompt(sanitizedNanoPrompt)}`;
    images.push({ mimeType: 'image/png', data: referenceImageBase64 });
    images.push({ mimeType: 'image/png', data: styleRefBase64 });
  } else if (visualType === 'OBJECT_FOCUS' && referenceImageBase64) {
    fullPrompt = `${stylePrefix}\n\n${generateFocusPrompt(sanitizedNanoPrompt)}`;
    images.push({ mimeType: 'image/png', data: referenceImageBase64 });
    images.push({ mimeType: 'image/png', data: styleRefBase64 });
  } else {
    // NEW_SCENE
    // Build character ref prompt for batch (using anchor count)
    const charRefLines: string[] = [];
    let refIdx = 2; // style ref is 1
    for (const char of characters) {
      if (characterAnchorImages.has(char)) {
        const displayName = displayNames[char] || char;
        charRefLines.push(`Reference ${refIdx} shows the EXACT character model for ${displayName}. This character MUST look identical to Reference ${refIdx} in this scene.`);
        refIdx++;
      }
    }
    const characterRefPrompt = charRefLines.length > 0
      ? '\n\nCHARACTER CONSISTENCY:\n' + charRefLines.join('\n')
      : '';

    fullPrompt = `${stylePrefix}\n\n${generateNewScenePrompt(sanitizedNanoPrompt, characterRefPrompt)}`;
    images.push({ mimeType: 'image/png', data: styleRefBase64 });

    // Add character anchor images
    for (const char of characters) {
      const anchorBase64 = characterAnchorImages.get(char);
      if (anchorBase64) {
        images.push({ mimeType: 'image/png', data: anchorBase64 });
      }
    }
  }

  return { text: fullPrompt, images };
}

/**
 * Check if the image generation model is available.
 */
export async function checkImageModelAvailable(): Promise<boolean> {
  try {
    const model = genAI.getGenerativeModel({ model: MODEL_NAME });
    return model !== null;
  } catch {
    return false;
  }
}
