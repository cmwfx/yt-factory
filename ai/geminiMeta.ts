import { GoogleGenerativeAI } from '@google/generative-ai';
import { env } from '@/lib/env';
import { withRetry } from '@/utils/retry';
import type { ChannelConfig } from '@/types';

const genAI = new GoogleGenerativeAI(env.GOOGLE_GENAI_API_KEY || '');

/**
 * Generate 5 scroll-stopping clickbait titles from the idea title.
 * Each title uses a different proven CTR pattern.
 */
export async function generateClickbaitTitles(ideaTitle: string, channelConfig?: ChannelConfig): Promise<string[]> {
  const modelName = channelConfig?.metadataModel || 'gemini-3-pro-preview';
  const model = genAI.getGenerativeModel({ model: modelName });

  const prompt = `You are a YouTube CTR expert. Generate exactly 5 scroll-stopping titles for a video about: "${ideaTitle}"

Each title MUST use a DIFFERENT pattern from this list. One title per pattern, in this order:

1. CURIOSITY GAP — Leave a conspicuous blank the viewer must click to fill.
   Example: "The $50 Billion Lie No One Noticed"
2. DIRECT ACCUSATION / THREAT — Make the viewer feel personally targeted or implicated.
   Example: "They're Still Charging You For This"
3. BIG NUMBER + VILLAIN — Pair an shocking dollar/stat figure with a named antagonist.
   Example: "Apple and Google's $200 Billion Trick"
4. VISUAL METAPHOR / QUOTABLE NICKNAME — Coin a memorable, slightly absurd label for the problem.
   Example: "The 'Zombie' Bill Draining Your Wallet"
5. URGENCY / WARNING — Create immediate fear of missing out or losing something.
   Example: "STOP Using This App Right Now"

RULES:
- Max 60 characters per title. If a title would exceed 60 chars, truncate it at 60.
- No generic "How to…" or "The Truth About…" openers.
- Be aggressive, specific, and provocative. These must stop a scroll.
- Use the idea title as your ONLY source of context — do not invent unrelated claims.

OUTPUT: JSON array of exactly 5 strings.
["title1", "title2", "title3", "title4", "title5"]

Return ONLY the JSON array.`;

  const result = await withRetry(
    async () => {
      const response = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.9,
        },
      });

      const text = response.response.text();
      if (!text) {
        throw new Error('Empty response from Gemini');
      }
      return text;
    },
    { maxAttempts: 3 }
  );

  // Parse JSON from response
  let jsonString: string | null = null;

  const jsonMatch = result.match(/\[[\s\S]*?\]/);
  if (jsonMatch) {
    jsonString = jsonMatch[0];
  }

  if (!jsonString) {
    const codeBlockMatch = result.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      const innerMatch = codeBlockMatch[1].match(/\[[\s\S]*?\]/);
      if (innerMatch) {
        jsonString = innerMatch[0];
      }
    }
  }

  if (!jsonString) {
    throw new Error('Failed to parse titles JSON from response');
  }

  const titles: string[] = JSON.parse(jsonString);

  // Validate, truncate at 60 chars (instead of dropping), and slice to 5
  return titles
    .filter((t): t is string => typeof t === 'string')
    .map((t) => t.trim())
    .filter((t) => t.length > 0)
    .map((t) => (t.length > 60 ? t.slice(0, 60) : t))
    .slice(0, 5);
}

interface SeoResult {
  description: string;
  keywords: string[];
}

/**
 * Generate a hook-first, story-driven SEO description and keywords from the idea title.
 */
export async function generateSeoDescription(ideaTitle: string, channelConfig?: ChannelConfig): Promise<SeoResult> {
  const modelName = channelConfig?.metadataModel || 'gemini-3-pro-preview';
  const model = genAI.getGenerativeModel({ model: modelName });

  const prompt = `You are a YouTube description writer. Write a hook-first, story-driven description for a video about: "${ideaTitle}"

DESCRIPTION RULES:
- The FIRST TWO LINES must be a punchy hook. No "In this video…". Write like you're grabbing the viewer by the collar.
- Use a STORY format: set up the situation, reveal the conflict, build tension. Example structure: "They promised you X. Instead, they gave you Y. Here's how they pulled it off."
- 150-200 words total.
- Weave in relevant keywords naturally — do NOT list them at the end.
- End with a CTA: tell the viewer to like, subscribe, or comment.
- No links, timestamps, or hashtags.

KEYWORDS RULES:
- 5-10 search keywords/phrases.
- Mix of broad and long-tail terms related to the topic.

OUTPUT FORMAT (JSON object):
{
  "description": "Your 150-200 word description here...",
  "keywords": ["keyword1", "keyword2", "keyword3"]
}

Return ONLY the JSON object.`;

  const result = await withRetry(
    async () => {
      const response = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.7,
        },
      });

      const text = response.response.text();
      if (!text) {
        throw new Error('Empty response from Gemini');
      }
      return text;
    },
    { maxAttempts: 3 }
  );

  // Parse JSON from response
  let jsonString: string | null = null;

  // Try to find JSON object
  const jsonMatch = result.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    jsonString = jsonMatch[0];
  }

  // Try markdown code block
  if (!jsonString) {
    const codeBlockMatch = result.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      const innerMatch = codeBlockMatch[1].match(/\{[\s\S]*\}/);
      if (innerMatch) {
        jsonString = innerMatch[0];
      }
    }
  }

  if (!jsonString) {
    throw new Error('Failed to parse SEO JSON from response');
  }

  const parsed = JSON.parse(jsonString);

  return {
    description: typeof parsed.description === 'string' ? parsed.description.trim() : '',
    keywords: Array.isArray(parsed.keywords)
      ? parsed.keywords.filter((k: unknown): k is string => typeof k === 'string').map((k: string) => k.trim())
      : [],
  };
}

/**
 * Generate 3 thumbnail image prompts in distinct visual styles from the idea title.
 * Each prompt is a self-contained NanoPrompt ready for Gemini image generation.
 */
export async function generateThumbnailPrompts(ideaTitle: string, channelConfig?: ChannelConfig): Promise<string[]> {
  const modelName = channelConfig?.metadataModel || 'gemini-3-pro-preview';
  const model = genAI.getGenerativeModel({ model: modelName });

  const prompt = `You are a YouTube thumbnail designer. Generate exactly 3 thumbnail image prompts for a video about: "${ideaTitle}"

Each prompt must use a DIFFERENT style archetype. One per archetype, in this order:

1. ACTION / HORROR — Dark environment (night alley, dimly lit office, stormy sky). A stick figure is in immediate physical danger or shock. High tension. Feels urgent and threatening.
2. CINEMATIC DRAMA — Massive scale contrast: a tiny stick figure dwarfed by a colossal corporate logo, a giant shadow, or an imposing system. Wide shot. Movie-poster composition. Epic and unsettling.
3. GRAPHIC / MINIMALIST — Split-screen or visual irony layout. One side shows the promise, the other the ugly truth. Bold neon or red text. High contrast. Punchy and immediately readable at a glance.

RULES for every prompt:
- Include stick figure(s): 2D white minimalist stick figures with dot eyes and thin black outlines. They look slightly out of place in the realistic scene — that contrast IS the style.
- Background: A HYPER-REALISTIC photorealistic real-world environment (street, office, courtroom, factory floor, etc.). NOT flat. NOT illustrated. NOT paper.
- Text overlay: 1-3 words of BOLD, large, high-contrast colored text (red, white, or yellow). Position it for maximum impact.
- Emotional beat: State the specific emotion or reaction the viewer should feel when they see the thumbnail.
- Composition: Rule of thirds. 16:9 aspect ratio (1920x1080). Eye-catching.

OUTPUT: JSON array of exactly 3 strings. Each string is one complete image prompt.
["prompt1", "prompt2", "prompt3"]

Return ONLY the JSON array.`;

  const result = await withRetry(
    async () => {
      const response = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.9,
        },
      });

      const text = response.response.text();
      if (!text) {
        throw new Error('Empty response from Gemini');
      }
      return text;
    },
    { maxAttempts: 3 }
  );

  // Parse JSON array from response
  let jsonString: string | null = null;

  const jsonMatch = result.match(/\[[\s\S]*?\]/);
  if (jsonMatch) {
    jsonString = jsonMatch[0];
  }

  if (!jsonString) {
    const codeBlockMatch = result.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      const innerMatch = codeBlockMatch[1].match(/\[[\s\S]*?\]/);
      if (innerMatch) {
        jsonString = innerMatch[0];
      }
    }
  }

  if (!jsonString) {
    throw new Error('Failed to parse thumbnail prompts JSON from response');
  }

  const prompts: string[] = JSON.parse(jsonString);

  return prompts
    .filter((p): p is string => typeof p === 'string')
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
    .slice(0, 3);
}
