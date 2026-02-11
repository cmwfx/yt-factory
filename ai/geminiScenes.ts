import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';
import { env } from '@/lib/env';
import { CHANNEL_BRIEF, NANOBANANA_STYLE_INSTRUCTION } from '@/lib/channelBrief';
import { buildPromptContext } from '@/lib/channelConfig';
import { withRetry } from '@/utils/retry';
import type { UsageMetadata } from '@/lib/costTracker';
import type { Scene, VisualType, CharacterType, ChannelConfig } from '@/types';

const genAI = new GoogleGenerativeAI(env.GOOGLE_GENAI_API_KEY || '');

// Scene word count constraints - merge short segments to reduce image generation costs
const MIN_WORDS_PER_SCENE = 10;
const MAX_WORDS_PER_SCENE = 20;

const CHARACTER_BIBLE = `
CHARACTER DEFINITIONS (use these EXACTLY):
- THE_VICTIM: Simple stick figure, round head, dot eyes, with subtle purple accent on clothing or outline. This is "you" - the viewer/consumer.
- THE_SUIT: Stick figure with a purple tie OR top hat. Represents corporations, companies, "them".
- THE_SYSTEM: Abstract representation - gears, flowcharts, money symbols. Use sparingly.

RULES:
- Only introduce new characters if absolutely necessary
- THE_VICTIM appears in 70% of scenes
- THE_SUIT appears when discussing corporate/company actions
- Keep character designs IDENTICAL across all scenes
`;

// Define the JSON schema for structured output
const sceneSchema = {
  type: SchemaType.ARRAY as const,
  items: {
    type: SchemaType.OBJECT as const,
    properties: {
      sceneIndex: {
        type: SchemaType.NUMBER as const,
        description: 'Sequential number starting from 0',
      },
      text: {
        type: SchemaType.STRING as const,
        description: 'The narration text for this scene',
      },
      wordCount: {
        type: SchemaType.NUMBER as const,
        description: 'Number of words in the text',
      },
      suggestedDuration: {
        type: SchemaType.NUMBER as const,
        description: 'Duration in seconds (wordCount / 2.5, clamped between 1-5)',
      },
      nanoPrompt: {
        type: SchemaType.STRING as const,
        description: 'Detailed image generation prompt describing the visual',
      },
      referenceImageIndex: {
        type: SchemaType.NUMBER as const,
        description: 'Index of a previous scene to use as reference, or -1 for first/unique scenes',
        nullable: true,
      },
      overlayText: {
        type: SchemaType.STRING as const,
        description: 'Short text overlay to show on screen, or empty string if none',
        nullable: true,
      },
      visualType: {
        type: SchemaType.STRING as const,
        format: 'enum' as const,
        description: 'Type of visual: NEW_SCENE (establish new location), CHARACTER_REACTION (same scene, different expression/pose), OBJECT_FOCUS (zoom on object/detail)',
        enum: ['NEW_SCENE', 'CHARACTER_REACTION', 'OBJECT_FOCUS'],
      },
      characters: {
        type: SchemaType.ARRAY as const,
        items: { type: SchemaType.STRING as const },
        description: 'List of characters in this scene: THE_VICTIM, THE_SUIT, THE_SYSTEM. Used for character consistency tracking.',
      },
    },
    required: ['sceneIndex', 'text', 'wordCount', 'suggestedDuration', 'nanoPrompt', 'visualType', 'characters'],
  },
};

function buildSceneBreakdownPrompt(channelConfig?: ChannelConfig): string {
  const channelContext = channelConfig ? buildPromptContext(channelConfig) : CHANNEL_BRIEF.toPromptContext();
  const styleInstruction = channelConfig?.styleInstruction || NANOBANANA_STYLE_INSTRUCTION;
  const characterBible = channelConfig?.characterBible || CHARACTER_BIBLE;

  return `You are a visual director breaking down a script into scenes for an illustrated explainer video.

${channelContext}

VISUAL STYLE:
${styleInstruction}

${characterBible}

For each scene, provide:
1. sceneIndex: Sequential number starting from 0
2. text: The narration text for this scene (split by [SCENE_BREAK])
3. wordCount: Number of words in the text
4. suggestedDuration: Seconds (calculate as wordCount / 2.5, but clamp between 1-5 seconds)
5. nanoPrompt: A BRIEF image generation prompt (max 50 words) describing the visual
6. referenceImageIndex: Index of a previous scene to use as reference, or -1 for first/unique scenes
7. overlayText: Short text overlay to show on screen (or empty string if none needed)
8. visualType: One of NEW_SCENE, CHARACTER_REACTION, or OBJECT_FOCUS
9. characters: Array of characters present (THE_VICTIM, THE_SUIT, THE_SYSTEM)

VISUAL TYPE GUIDELINES (Base & Evolve Strategy):
- NEW_SCENE (~30%): New location or major topic shift. Full scene description needed.
- CHARACTER_REACTION (~60%): SAME background as referenced scene, only expression/pose changes.
  For these, describe ONLY what changes: "Same scene, the ordinary person now has dollar signs for eyes"
- OBJECT_FOCUS (~10%): Zoom/crop on specific detail. Reference the source scene.

VISUAL CONTINUITY RULES:
- Scene 0 is always NEW_SCENE
- For CHARACTER_REACTION, referenceImageIndex MUST point to the scene whose background to keep
- Scenes should flow like animation frames, not random illustrations
- Prioritize physical comedy: exaggerated expressions, visual metaphors, slapstick moments
- When emotions shift (happy→sad, calm→angry), use CHARACTER_REACTION to show the change

NANOBANANA PROMPT GUIDELINES:
- Keep prompts SHORT (under 50 words) - the style reference image handles the style
- For NEW_SCENE: describe character, action, expression, and setting
- For CHARACTER_REACTION: describe ONLY what changes from the referenced scene
- For OBJECT_FOCUS: describe what to zoom in on
- Prioritize ACTION verbs: punching, falling, burning, exploding (not standing, looking, being)
- Do NOT repeat style instructions in every prompt - they are applied automatically`;
}

// Maximum scenes per batch to avoid token limit issues
const MAX_SCENES_PER_BATCH = 30;

/**
 * Merge text segments to achieve target word count BEFORE sending to Gemini.
 * This ensures Gemini generates one coherent nanoPrompt for the combined text.
 */
function mergeTextSegments(segments: string[], minWords: number = MIN_WORDS_PER_SCENE): string[] {
  const merged: string[] = [];
  let buffer: string[] = [];
  let bufferWordCount = 0;

  for (const segment of segments) {
    const wordCount = segment.split(/\s+/).filter(Boolean).length;
    buffer.push(segment);
    bufferWordCount += wordCount;

    // Flush buffer when we have enough words
    if (bufferWordCount >= minWords) {
      merged.push(buffer.join(' '));
      buffer = [];
      bufferWordCount = 0;
    }
  }

  // Handle remaining buffer
  if (buffer.length > 0) {
    if (merged.length > 0 && bufferWordCount < minWords) {
      // Append to last merged segment if too short
      const last = merged.pop()!;
      merged.push(last + ' ' + buffer.join(' '));
    } else {
      merged.push(buffer.join(' '));
    }
  }

  return merged;
}

/**
 * Process a batch of scene parts into scenes.
 */
async function processBatch(
  sceneParts: string[],
  startIndex: number,
  model: ReturnType<typeof genAI.getGenerativeModel>,
  channelConfig?: ChannelConfig
): Promise<{ scenes: Scene[]; usageMetadata?: UsageMetadata }> {
  const sceneBreakdownPrompt = buildSceneBreakdownPrompt(channelConfig);
  const prompt = `${sceneBreakdownPrompt}

Break down these ${sceneParts.length} script segments into visual scenes.
IMPORTANT: Start sceneIndex at ${startIndex}.

SCRIPT SEGMENTS:
${sceneParts.map((text, i) => `[${startIndex + i}] ${text}`).join('\n\n')}

Create a scene entry for each segment. The sceneIndex MUST match the segment numbers shown in brackets.`;

  const result = await withRetry(
    async () => {
      console.log(`[DEBUG geminiScenes] Processing batch starting at index ${startIndex} (${sceneParts.length} scenes)...`);
      const response = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
      });

      const text = response.response.text();
      if (!text) {
        throw new Error('Empty response from Gemini');
      }
      console.log(`[DEBUG geminiScenes] Batch ${startIndex} response length: ${text.length}`);
      return { text, usageMetadata: response.response.usageMetadata as UsageMetadata | undefined };
    },
    { maxAttempts: 3 }
  );

  const parsed = JSON.parse(result.text);
  console.log(`[DEBUG geminiScenes] Batch ${startIndex}: parsed ${parsed.length} scenes`);
  return { scenes: parsed, usageMetadata: result.usageMetadata };
}

/**
 * Break down a script into visual scenes using structured output.
 * Processes in batches if there are many scenes to avoid token limits.
 */
export async function breakdownScript(script: string, channelConfig?: ChannelConfig): Promise<{ scenes: Scene[]; usageMetadata: UsageMetadata }> {
  const modelName = channelConfig?.sceneBreakdownModel || 'gemini-2.0-flash';
  const model = genAI.getGenerativeModel({
    model: modelName,
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: sceneSchema,
      temperature: 0.7,
      maxOutputTokens: 8192,
    },
  });

  // Split script by scene breaks
  const rawSceneParts = script
    .split(/\[SCENE_BREAK\]/i)
    .map(s => s.trim())
    .filter(Boolean);

  // Merge short segments to achieve 10-20 words BEFORE sending to Gemini
  // This ensures Gemini generates one coherent nanoPrompt for the combined text
  const sceneParts = mergeTextSegments(rawSceneParts, MIN_WORDS_PER_SCENE);
  console.log(`[DEBUG geminiScenes] Merged ${rawSceneParts.length} raw segments into ${sceneParts.length} scenes`);

  console.log('[DEBUG geminiScenes] Script length:', script.length);
  console.log('[DEBUG geminiScenes] Scene parts count:', sceneParts.length);
  console.log('[DEBUG geminiScenes] Scene parts preview:', sceneParts.slice(0, 3).map((p, i) => `[${i}] ${p.slice(0, 50)}...`));

  let allScenes: Scene[] = [];
  const accumulatedUsage: UsageMetadata = { promptTokenCount: 0, candidatesTokenCount: 0, totalTokenCount: 0, thoughtsTokenCount: 0 };

  // Process in batches if there are too many scenes
  if (sceneParts.length > MAX_SCENES_PER_BATCH) {
    console.log(`[DEBUG geminiScenes] Processing ${sceneParts.length} scenes in batches of ${MAX_SCENES_PER_BATCH}`);

    for (let i = 0; i < sceneParts.length; i += MAX_SCENES_PER_BATCH) {
      const batch = sceneParts.slice(i, i + MAX_SCENES_PER_BATCH);
      const { scenes: batchScenes, usageMetadata } = await processBatch(batch, i, model, channelConfig);
      allScenes = allScenes.concat(batchScenes);
      if (usageMetadata) {
        accumulatedUsage.promptTokenCount! += usageMetadata.promptTokenCount || 0;
        accumulatedUsage.candidatesTokenCount! += usageMetadata.candidatesTokenCount || 0;
        accumulatedUsage.totalTokenCount! += usageMetadata.totalTokenCount || 0;
        accumulatedUsage.thoughtsTokenCount! += usageMetadata.thoughtsTokenCount || 0;
      }

      // Small delay between batches to avoid rate limits
      if (i + MAX_SCENES_PER_BATCH < sceneParts.length) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
  } else {
    // Single batch for smaller scripts
    const { scenes, usageMetadata } = await processBatch(sceneParts, 0, model, channelConfig);
    allScenes = scenes;
    if (usageMetadata) {
      accumulatedUsage.promptTokenCount! += usageMetadata.promptTokenCount || 0;
      accumulatedUsage.candidatesTokenCount! += usageMetadata.candidatesTokenCount || 0;
      accumulatedUsage.totalTokenCount! += usageMetadata.totalTokenCount || 0;
      accumulatedUsage.thoughtsTokenCount! += usageMetadata.thoughtsTokenCount || 0;
    }
  }

  console.log(`[DEBUG geminiScenes] Total scenes processed: ${allScenes.length}`);

  // Validate and fix scene data (convert -1 to null for referenceImageIndex)
  const scenes = allScenes.map((scene, index) => ({
    sceneIndex: scene.sceneIndex ?? index,
    text: scene.text || sceneParts[index] || '',
    wordCount: scene.wordCount || (scene.text || '').split(/\s+/).length,
    suggestedDuration: Math.min(5, Math.max(1, scene.suggestedDuration || 3)),
    nanoPrompt: scene.nanoPrompt || generateDefaultPrompt(scene.text || sceneParts[index] || ''),
    referenceImageIndex: scene.referenceImageIndex === -1 ? null : (scene.referenceImageIndex ?? (index > 0 ? index - 1 : null)),
    overlayText: scene.overlayText || null,
    visualType: (scene.visualType as VisualType) || (index === 0 ? 'NEW_SCENE' : 'CHARACTER_REACTION'),
    characters: (scene.characters as CharacterType[]) || ['THE_VICTIM'],
  }));

  return { scenes, usageMetadata: accumulatedUsage };
}

/**
 * Generate a default image prompt from scene text.
 */
function generateDefaultPrompt(text: string): string {
  return `Stick figure character with purple accent details on crumpled brown paper background. Scene: ${text.slice(0, 80)}. Black ink lines with purple highlights.`;
}

/**
 * Limit scenes for test mode.
 */
export function limitScenesForTest(scenes: Scene[], maxScenes: number = 3): Scene[] {
  return scenes.slice(0, maxScenes);
}
