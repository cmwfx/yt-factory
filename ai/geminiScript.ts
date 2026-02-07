import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';
import { env } from '@/lib/env';
import { CHANNEL_BRIEF, SCRIPT_STRUCTURE } from '@/lib/channelBrief';
import { withRetry, sleep } from '@/utils/retry';
import { generateThumbnailImage } from './nanoBanana';
import type { UsageMetadata } from '@/lib/costTracker';
import type { IdeaInput, ScriptResult, ToneAngleBrief, ScriptSection, ScriptSectionType, VideoMetadata } from '@/types';

const genAI = new GoogleGenerativeAI(env.GOOGLE_GENAI_API_KEY || '');

// New persona: investigative journalist meets cynical comedian
const PERSONA_PROMPT = `You are an investigative journalist who moonlights as a cynical comedian.

YOUR VOICE:
- Short sentences. Punchy.
- Uses "You" and "They" constantly
- Cynical but not nihilistic - you expose scams but don't despair
- Explain like you're telling a friend about a scam at a bar
- Use specific, vivid analogies (not generic metaphors)
- Rhetorical questions that land like punches
- Occasional dark humor, never cringe

WHAT YOU DON'T DO:
- No "Let's dive in" or "Here's the thing"
- No balanced "to be fair" hedging
- No passive voice ("mistakes were made")
- No dry academic explanations
- No filler transitions
- No emojis or exclamation marks

SCENE BREAKS:
- Insert [SCENE_BREAK] frequently - every 8-15 words on average
- Scene breaks create visual rhythm and pacing
- A new visual beat = a new scene break
- Minimum 40 scene breaks per full script

EXAMPLE OF YOUR STYLE:
"You've been lied to. That 'unlimited' plan? [SCENE_BREAK] It's a magic trick. And you're not the magician. [SCENE_BREAK] You're the sucker in the front row. [SCENE_BREAK] Let me show you how they pull it off."`;

interface SectionConfig {
  type: ScriptSectionType;
  title: string;
  targetWordRange: [number, number];
  instructions: string;
  endingGuidance: string;
}

const SECTION_CONFIGS: SectionConfig[] = [
  {
    type: 'hook',
    title: 'The Hook',
    targetWordRange: [180, 220],
    instructions: `Open with a Lie vs Truth contrast. Hit them with what they believe, then pull the rug.
Make it personal with "you".
Build curiosity - why should they care?
End with a cliffhanger that makes them NEED to keep listening.`,
    endingGuidance: 'End on a cliffhanger. The viewer should feel: "Wait, what? I need to know more."',
  },
  {
    type: 'villain_reveal',
    title: 'The Villain Reveal',
    targetWordRange: [295, 360],
    instructions: `Introduce the antagonist - the company, system, or design behind the scam.
Use "They" language constantly - make it personal and deliberate.
Show this wasn't an accident. It was DESIGNED this way.
Name specific tactics, teams, or decisions if possible.
Build the sense of betrayal.`,
    endingGuidance: 'End by setting up the mechanism: "Here\'s exactly how they do it."',
  },
  {
    type: 'mechanism',
    title: 'The Mechanism',
    targetWordRange: [470, 575],
    instructions: `This is the meat. Explain HOW the trick works.
Use cynical, funny analogies - not dry explanations.
Break down 2-4 specific tactics or steps.
Make complex things feel obvious in hindsight.
Include specific numbers, percentages, or examples where possible.
Keep the "exposé" energy - you're revealing secrets.`,
    endingGuidance: 'Transition to consequences: "And here\'s what that actually costs you."',
  },
  {
    type: 'consequence',
    title: 'The Consequence',
    targetWordRange: [360, 445],
    instructions: `Make it personal. This is where you build anger.
Use "you" constantly - this affects THEM, the viewer.
Show real costs: money, time, opportunity, dignity.
Include specific scenarios they'll recognize from their own life.
Build emotional momentum - they should feel tricked, angry, or frustrated.`,
    endingGuidance: 'Set up the takeaway: "So what do you do about this?"',
  },
  {
    type: 'takeaway',
    title: 'The Takeaway',
    targetWordRange: [220, 275],
    instructions: `Land the plane with impact.
Two options:
1. CYNICAL: "They'll keep doing this. Here's why it won't change."
2. EMPOWERING: "Now you know. Here's how to fight back."
Pick ONE tone based on the topic - don't try to do both.
End with a memorable line they might quote.`,
    endingGuidance: 'Final line should be quotable, punchy, and land like a mic drop.',
  },
];

/**
 * Generate the Tone & Angle Brief - the creative foundation for the script.
 */
async function generateToneAngleBrief(idea: IdeaInput): Promise<{ brief: ToneAngleBrief; usageMetadata?: UsageMetadata }> {
  const model = genAI.getGenerativeModel({ model: 'gemini-3-pro-preview' });

  const prompt = `Analyze this video topic and create a creative brief for an exposé-style script.

TOPIC: ${idea.title}
DESCRIPTION: ${idea.description}

Create a brief that answers:
1. WHO is the villain? (company, industry, system - be specific)
2. What's the CENTRAL METAPHOR? (one vivid analogy that captures the scam)
3. What's the LIE people believe vs the TRUTH?
4. What's the EMOTIONAL ARC? (what should viewers feel by the end?)
5. How SAVAGE should we be? (mild/moderate/savage - based on how egregious the topic is)

OUTPUT FORMAT (JSON only, no markdown):
{
  "villain": "specific entity or system",
  "centralMetaphor": "one vivid analogy",
  "lieTruthContrast": {
    "lie": "what people believe",
    "truth": "the reality"
  },
  "emotionalArc": "starting emotion -> ending emotion",
  "cynicismLevel": "mild|moderate|savage"
}`;

  const result = await withRetry(
    async () => {
      const response = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.9 },
      });

      const text = response.response.text();
      if (!text) throw new Error('Empty response from Gemini');
      return { text, usageMetadata: response.response.usageMetadata as UsageMetadata | undefined };
    },
    { maxAttempts: 3 }
  );

  // Parse JSON response
  const jsonMatch = result.text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('Failed to parse tone brief JSON');
  }

  const brief = JSON.parse(jsonMatch[0]) as ToneAngleBrief;
  console.log('[DEBUG] Tone & Angle Brief:', brief);
  return { brief, usageMetadata: result.usageMetadata };
}

/**
 * Generate a single script section with retry logic.
 */
async function generateSection(
  idea: IdeaInput,
  brief: ToneAngleBrief,
  config: SectionConfig,
  previousSections: ScriptSection[]
): Promise<{ section: ScriptSection; usageMetadata?: UsageMetadata }> {
  const model = genAI.getGenerativeModel({ model: 'gemini-3-pro-preview' });

  const previousContext = previousSections.length > 0
    ? `\n\nPREVIOUS SECTIONS (for continuity):\n${previousSections.map(s => `[${s.title}]\n${s.content}`).join('\n\n')}`
    : '';

  const prompt = `${PERSONA_PROMPT}

TOPIC: ${idea.title}
DESCRIPTION: ${idea.description}

CREATIVE BRIEF:
- Villain: ${brief.villain}
- Central Metaphor: ${brief.centralMetaphor}
- The Lie: ${brief.lieTruthContrast.lie}
- The Truth: ${brief.lieTruthContrast.truth}
- Emotional Arc: ${brief.emotionalArc}
- Cynicism Level: ${brief.cynicismLevel}
${previousContext}

---

NOW WRITE: ${config.title}
Target: ${config.targetWordRange[0]}-${config.targetWordRange[1]} words

INSTRUCTIONS:
${config.instructions}

ENDING:
${config.endingGuidance}

CRITICAL RULES:
- Output ONLY the narration text - no commentary or headers
- Include [SCENE_BREAK] every 8-15 words on average
- Stay within the word count range
- Maintain continuity with previous sections
- DO NOT start with "${config.title}" or any header - start directly with narration`;

  const maxRetries = 3;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.85 },
      });

      const text = response.response.text();
      if (!text) throw new Error('Empty response from Gemini');
      const usageMetadata = response.response.usageMetadata as UsageMetadata | undefined;

      // Clean up the response
      let content = text
        .replace(/```[a-z]*\n?/gi, '')
        .replace(/^\s*#.*$/gm, '')
        .replace(/^\s*\*\*.*\*\*\s*$/gm, '')  // Remove bold headers
        .trim();

      // Remove section title if it appears at the start
      const titlePatterns = [
        new RegExp(`^\\s*${config.title}[:\\s]*`, 'i'),
        new RegExp(`^\\s*\\[${config.title}\\][:\\s]*`, 'i'),
        /^\s*Section \d+[:\s]*/i,
      ];
      for (const pattern of titlePatterns) {
        content = content.replace(pattern, '').trim();
      }

      const wordCount = content.split(/\s+/).filter(w => w && !w.match(/^\[SCENE_BREAK\]$/i)).length;
      const sceneBreakCount = (content.match(/\[SCENE_BREAK\]/gi) || []).length;

      // Validate word count (20% tolerance)
      const minWords = config.targetWordRange[0] * 0.8;
      const maxWords = config.targetWordRange[1] * 1.2;

      if (wordCount < minWords || wordCount > maxWords) {
        throw new Error(
          `Word count ${wordCount} outside tolerance (${Math.round(minWords)}-${Math.round(maxWords)})`
        );
      }

      // Validate scene break density (1 per ~15 words minimum)
      const expectedMinBreaks = Math.floor(wordCount / 20);
      if (sceneBreakCount < expectedMinBreaks) {
        throw new Error(
          `Scene break count ${sceneBreakCount} too low (expected at least ${expectedMinBreaks})`
        );
      }

      console.log(`[DEBUG] ${config.title}: ${wordCount} words, ${sceneBreakCount} scene breaks`);

      return {
        section: {
          type: config.type,
          title: config.title,
          content,
          wordCount,
          targetWordRange: config.targetWordRange,
        },
        usageMetadata,
      };

    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.log(`[DEBUG] ${config.title} attempt ${attempt} failed: ${lastError.message}`);

      if (attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 1000;
        await sleep(delay);
      }
    }
  }

  throw new Error(`Failed to generate ${config.title} after ${maxRetries} attempts: ${lastError?.message}`);
}

/**
 * Generate a video script from an idea using section-chained approach.
 */
export async function generateScript(idea: IdeaInput): Promise<ScriptResult & { usageMetadata: UsageMetadata }> {
  console.log('[DEBUG] Starting section-chained script generation for:', idea.title);

  // Accumulate usage metadata across all text generation calls
  const accumulatedUsage: UsageMetadata = { promptTokenCount: 0, candidatesTokenCount: 0, totalTokenCount: 0, thoughtsTokenCount: 0 };

  // Step 1: Generate Tone & Angle Brief
  const { brief, usageMetadata: briefUsage } = await generateToneAngleBrief(idea);
  if (briefUsage) {
    accumulatedUsage.promptTokenCount! += briefUsage.promptTokenCount || 0;
    accumulatedUsage.candidatesTokenCount! += briefUsage.candidatesTokenCount || 0;
    accumulatedUsage.totalTokenCount! += briefUsage.totalTokenCount || 0;
    accumulatedUsage.thoughtsTokenCount! += briefUsage.thoughtsTokenCount || 0;
  }

  // Step 2: Generate each section in sequence
  const sections: ScriptSection[] = [];

  for (const config of SECTION_CONFIGS) {
    console.log(`[DEBUG] Generating section: ${config.title}`);
    const { section, usageMetadata: sectionUsage } = await generateSection(idea, brief, config, sections);
    sections.push(section);
    if (sectionUsage) {
      accumulatedUsage.promptTokenCount! += sectionUsage.promptTokenCount || 0;
      accumulatedUsage.candidatesTokenCount! += sectionUsage.candidatesTokenCount || 0;
      accumulatedUsage.totalTokenCount! += sectionUsage.totalTokenCount || 0;
      accumulatedUsage.thoughtsTokenCount! += sectionUsage.thoughtsTokenCount || 0;
    }
  }

  // Step 3: Assemble final script
  const script = sections.map(s => s.content).join('\n\n[SCENE_BREAK]\n\n');

  const totalWordCount = sections.reduce((sum, s) => sum + s.wordCount, 0);
  const totalSceneBreaks = (script.match(/\[SCENE_BREAK\]/gi) || []).length;

  console.log('[DEBUG] Script assembly complete:');
  console.log(`  - Total words: ${totalWordCount}`);
  console.log(`  - Total scene breaks: ${totalSceneBreaks}`);
  console.log(`  - Sections: ${sections.map(s => `${s.title}(${s.wordCount}w)`).join(', ')}`);

  // Final validation
  if (totalSceneBreaks < SCRIPT_STRUCTURE.minSceneBreaks) {
    console.warn(`[WARN] Scene break count ${totalSceneBreaks} below minimum ${SCRIPT_STRUCTURE.minSceneBreaks}`);
  }

  return { script, wordCount: totalWordCount, usageMetadata: accumulatedUsage };
}

/**
 * Generate video ideas using Gemini.
 */
export async function generateIdeas(
  existingTitles: string[],
  count: number = 10
): Promise<IdeaInput[]> {
  const model = genAI.getGenerativeModel({ model: 'gemini-3-pro-preview' });

  const existingList = existingTitles.length > 0
    ? `\n\nEXISTING IDEAS (do not repeat these):\n${existingTitles.map(t => `- ${t}`).join('\n')}`
    : '';

  const prompt = `Generate ${count} unique video ideas for an analytical YouTube channel.

${CHANNEL_BRIEF.toPromptContext()}

IDEA REQUIREMENTS:
- Focus on hidden systems, dark patterns, behavioral design, or counterintuitive economics
- Each idea should reveal something non-obvious about everyday products/services
- Titles should be intriguing but not clickbait
- Descriptions should outline the main points to cover
${existingList}

OUTPUT FORMAT (JSON array):
[
  {
    "title": "The Exact Psychology Behind 'Limited Time Offers'",
    "description": "Explore how artificial scarcity triggers loss aversion. Cover: countdown timers, flash sales, seasonal releases. Case studies: fast fashion, airline tickets, streaming content."
  }
]

Return ONLY the JSON array, no other text.`;

  const result = await withRetry(
    async () => {
      const response = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 1.0,
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
  console.log('[DEBUG geminiScript] Ideas response length:', result.length);
  console.log('[DEBUG geminiScript] Ideas response preview:', result.slice(0, 300));

  // Try to extract JSON array - handle markdown code blocks
  let jsonString: string | null = null;

  // Pattern 1: Raw JSON array
  let jsonMatch = result.match(/\[[\s\S]*\]/);
  if (jsonMatch) {
    jsonString = jsonMatch[0];
  }

  // Pattern 2: JSON in markdown code block
  if (!jsonString) {
    const codeBlockMatch = result.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      const innerContent = codeBlockMatch[1].trim();
      const innerJsonMatch = innerContent.match(/\[[\s\S]*\]/);
      if (innerJsonMatch) {
        jsonString = innerJsonMatch[0];
      }
    }
  }

  if (!jsonString) {
    console.error('[DEBUG geminiScript] Failed to find JSON array in ideas response');
    console.error('[DEBUG geminiScript] Full response:', result);
    throw new Error(`Failed to parse ideas JSON from response. Response preview: ${result.slice(0, 300)}...`);
  }

  let ideas: IdeaInput[];
  try {
    ideas = JSON.parse(jsonString);
    console.log('[DEBUG geminiScript] Successfully parsed', ideas.length, 'ideas');
  } catch (parseError) {
    console.error('[DEBUG geminiScript] JSON parse error:', parseError);
    console.error('[DEBUG geminiScript] Attempted to parse:', jsonString.slice(0, 500));
    throw new Error(`Failed to parse ideas JSON: ${parseError instanceof Error ? parseError.message : 'Unknown error'}`);
  }

  // Filter out any that match existing titles
  const existingSet = new Set(existingTitles.map(t => t.toLowerCase()));
  return ideas.filter(idea => !existingSet.has(idea.title.toLowerCase()));
}

// Viral YouTube Strategist persona for high-CTR metadata generation
const METADATA_PROMPT = `You are an expert at YouTube CTR. You are analyzing a script about legal but unethical corporate behavior.

**Titles must follow these rules:**
- Use 'Curiosity Gaps' (e.g., 'The $50 Billion Lie No One Noticed')
- Use 'Negativity Bias' (e.g., 'They are stealing your [Subject] right now')
- Avoid generic 'How-to' or 'The Truth About...' titles. Use high-stakes, aggressive language.
- Keep them under 50 characters.

**Description must follow these rules:**
- The first two lines MUST be a hook that makes the reader want to watch.
- Do not use 'In this video we will...'
- Use a 'Story' format: 'They promised you freedom. Instead, they gave you a cage. Here is how they did it.'
- Include relevant keywords naturally in a 'deep dive' section at the end.

**Thumbnail Prompts must follow these rules:**
- Style: Minimalist stick figure, high-contrast black/white lines with vibrant accent colors to catch a user's attention while scrolling
- Content: One iconic, high-emotion visual metaphor from the script.
- Instruction: Describe the specific facial expression (e.g., 'Shocked wide eyes', 'Evil grin with glowing eyes') and the 'Visual Villain' (The Suit).`;

// JSON schema for structured metadata output
const metadataSchema = {
  type: SchemaType.OBJECT as const,
  properties: {
    titles: {
      type: SchemaType.ARRAY as const,
      items: { type: SchemaType.STRING as const },
      description: 'Exactly 5 high-CTR titles under 50 characters each',
    },
    description: {
      type: SchemaType.STRING as const,
      description: 'Story-driven description with hook opening',
    },
    thumbnailPrompts: {
      type: SchemaType.ARRAY as const,
      items: { type: SchemaType.STRING as const },
      description: 'Exactly 3 detailed thumbnail prompts for nanobanana',
    },
  },
  required: ['titles', 'description', 'thumbnailPrompts'],
};

/**
 * Generate high-CTR video metadata (titles, description, thumbnail prompts) from a script.
 * Uses psychological CTR techniques like curiosity gaps and negativity bias.
 */
export async function generateMetadata(script: string): Promise<VideoMetadata> {
  const model = genAI.getGenerativeModel({
    model: 'gemini-3-pro-preview',
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: metadataSchema,
      temperature: 0.9, // Higher creativity for CTR optimization
    },
  });

  const prompt = `${METADATA_PROMPT}

Analyze this script and generate:
1. Exactly 5 high-CTR titles (each under 50 characters)
2. A story-driven description with a hook opening
3. Exactly 3 thumbnail prompts for minimalist stick figure visuals

SCRIPT:
${script}

Generate the metadata now.`;

  const result = await withRetry(
    async () => {
      console.log('[DEBUG geminiScript] Generating metadata...');
      const response = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
      });

      const text = response.response.text();
      if (!text) {
        throw new Error('Empty response from Gemini');
      }

      console.log('[DEBUG geminiScript] Metadata response length:', text.length);
      return text;
    },
    { maxAttempts: 3 }
  );

  const metadata: VideoMetadata = JSON.parse(result);

  // Validate: exactly 5 titles, each ≤50 chars
  if (!metadata.titles || metadata.titles.length !== 5) {
    console.warn(`[WARN geminiScript] Expected 5 titles, got ${metadata.titles?.length || 0}`);
    // Pad or trim to exactly 5
    while (metadata.titles && metadata.titles.length < 5) {
      metadata.titles.push(metadata.titles[0] || 'Untitled');
    }
    if (metadata.titles) {
      metadata.titles = metadata.titles.slice(0, 5);
    }
  }

  // Validate title lengths
  metadata.titles = metadata.titles.map(title => {
    if (title.length > 50) {
      console.warn(`[WARN geminiScript] Title too long (${title.length} chars), truncating: ${title}`);
      return title.slice(0, 47) + '...';
    }
    return title;
  });

  // Validate: exactly 3 thumbnail prompts
  if (!metadata.thumbnailPrompts || metadata.thumbnailPrompts.length !== 3) {
    console.warn(`[WARN geminiScript] Expected 3 thumbnail prompts, got ${metadata.thumbnailPrompts?.length || 0}`);
    while (metadata.thumbnailPrompts && metadata.thumbnailPrompts.length < 3) {
      metadata.thumbnailPrompts.push(metadata.thumbnailPrompts[0] || 'Stick figure with shocked expression');
    }
    if (metadata.thumbnailPrompts) {
      metadata.thumbnailPrompts = metadata.thumbnailPrompts.slice(0, 3);
    }
  }

  // Validate description exists
  if (!metadata.description) {
    console.warn('[WARN geminiScript] Missing description, using fallback');
    metadata.description = 'Watch to learn the truth they don\'t want you to know.';
  }

  console.log('[DEBUG geminiScript] Metadata generated successfully');
  console.log(`  - Titles: ${metadata.titles.length} (lengths: ${metadata.titles.map(t => t.length).join(', ')})`);
  console.log(`  - Description: ${metadata.description.length} chars`);
  console.log(`  - Thumbnail prompts: ${metadata.thumbnailPrompts.length}`);

  return metadata;
}

/**
 * Generate actual thumbnail images from prompts using nanobanana's image generation.
 * Each thumbnail is a standalone, high-resolution image with style reference only (no scene continuity).
 */
export async function generateThumbnails(
  prompts: string[],
  outputDir: string
): Promise<string[]> {
  const thumbnailPaths: string[] = [];

  console.log(`[DEBUG geminiScript] Generating ${prompts.length} thumbnails...`);

  for (let i = 0; i < prompts.length; i++) {
    const outputPath = `${outputDir}/thumbnail_${i + 1}.png`;

    console.log(`[DEBUG geminiScript] Generating thumbnail ${i + 1}/${prompts.length}...`);
    console.log(`[DEBUG geminiScript] Prompt: ${prompts[i].slice(0, 100)}...`);

    const imagePath = await generateThumbnailImage(prompts[i], outputPath);
    thumbnailPaths.push(imagePath);

    // Rate limiting between thumbnail generations
    if (i < prompts.length - 1) {
      console.log('[DEBUG geminiScript] Waiting 1.5s before next thumbnail...');
      await sleep(1500);
    }
  }

  console.log(`[DEBUG geminiScript] Generated ${thumbnailPaths.length} thumbnails`);
  return thumbnailPaths;
}
