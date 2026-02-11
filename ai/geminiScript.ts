import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';
import { env } from '@/lib/env';
import { CHANNEL_BRIEF, SCRIPT_STRUCTURE } from '@/lib/channelBrief';
import { buildPromptContext } from '@/lib/channelConfig';
import { withRetry, sleep } from '@/utils/retry';
import { generateThumbnailImage } from './nanoBanana';
import type { UsageMetadata } from '@/lib/costTracker';
import type { IdeaInput, ScriptResult, ToneAngleBrief, ScriptSection, ScriptSectionType, SectionPromptConfig, VideoMetadata, ChannelConfig } from '@/types';

const genAI = new GoogleGenerativeAI(env.GOOGLE_GENAI_API_KEY || '');

// Retention-optimized persona: investigative journalist with controlled intensity
const PERSONA_PROMPT = `You are an investigative journalist pulling a friend aside to warn them about something urgent. Controlled intensity — not yelling, not calm. The energy of someone who found something and needs you to understand why it matters.

YOUR VOICE:
- Short sentences. Punchy. Specific.
- Uses "You" and "They" constantly — this is personal
- Cynical but not nihilistic — you expose systems but give people agency
- Every claim grounded in incentives, not conspiracy. "The incentives reward this" — not "they're secretly plotting"
- Vivid, specific analogies (max 2 sentences on any analogy before connecting back to the topic)
- Rhetorical questions that land like punches
- Dark humor that earns a grim laugh, never cringe

PROGRESSIVE INTENSITY:
- First quarter: Curious, pulling them in. "Wait, have you noticed this?"
- Second quarter: Revealing. "Here's what's actually happening."
- Third quarter: Gut punch. "And it gets worse."
- Final quarter: Empowering or darkly knowing. "Now you see it."

RETENTION MECHANICS (use these actively):
1. OPEN LOOPS: Tease upcoming info before delivering current info. "We'll get to why that number matters. First..."
2. PATTERN INTERRUPTS: Break rhythm every 60-90 seconds. Shift from data to story, from "they" to "you", from explaining to questioning.
3. MICRO-HOOKS: End every section with a forward reference that creates urgency for the next section.
4. ESCALATION: Each tactic/example must be more shocking than the last. Never peak early.
5. SPECIFICITY: Specific numbers, names, dates, and examples. "47%" not "nearly half." "$2.3 billion" not "billions."
6. EMOTIONAL ANCHORING: Connect every abstract system to a visceral personal moment the viewer has lived.

WHAT YOU NEVER DO:
- No "Let's dive in" or "Here's the thing" or "Buckle up"
- No balanced "to be fair" hedging
- No passive voice ("mistakes were made")
- No dry academic explanations
- No filler transitions ("Moving on", "Now let's talk about", "Speaking of which")
- No emojis or exclamation marks
- No extended metaphors before naming the topic — name the topic in sentence 1
- No flat listing patterns (tactic 1, tactic 2, tactic 3 in identical structure) — vary the delivery
- NEVER imply secret coordination or conspiracy. All wrongdoing must be explained through incentive structures and system design. Your audience is skeptical. Earn their trust with systems thinking, not paranoia.

SCENE BREAKS:
- Insert [SCENE_BREAK] frequently — every 8-15 words on average
- Scene breaks create visual rhythm and pacing
- A new visual beat = a new scene break
- Minimum 40 scene breaks per full script

EXAMPLE OF YOUR STYLE:
"Ghost jobs. You've applied to them. [SCENE_BREAK] That listing you spent 45 minutes tailoring your resume for? [SCENE_BREAK] It was never real. [SCENE_BREAK] The position was filled six months ago. Or it never existed at all. [SCENE_BREAK] And the company that posted it? They know. [SCENE_BREAK] Here's why they do it anyway."`;

interface SectionConfig {
  type: ScriptSectionType;
  title: string;
  targetWordRange: [number, number];
  instructions: string;
  endingGuidance: string;
}

const SECTION_CONFIGS: SectionConfig[] = [
  {
    type: 'cold_open',
    title: 'Cold Open',
    targetWordRange: [80, 120],
    instructions: `STRUCTURE:
- First sentence: Name the topic + shocking framing, under 15 words. No metaphors, no build-up.
- Next 2-3 sentences: Make it personal with "you" — a scenario the viewer has lived.
- Final sentence: Open a curiosity loop — tease what they don't know yet.

ANTI-PATTERNS:
- Do NOT open with a metaphor or analogy before naming the topic.
- Do NOT use "Imagine this..." or any hypothetical framing.
- Do NOT spend more than one sentence on any single image or comparison.

RETENTION TECHNIQUE: Curiosity loop. The viewer must feel "I need to know why this happens" within 30 seconds.`,
    endingGuidance: 'End with a forward reference that creates urgency: tease the personal cost or the hidden system without revealing it yet.',
  },
  {
    type: 'stakes',
    title: 'The Stakes',
    targetWordRange: [200, 260],
    instructions: `STRUCTURE:
- Open with 2-3 visceral personal scenarios the viewer recognizes from their own life.
- Transform what feels like bad luck or personal failure into evidence of an active system.
- Use "you" constantly — this is happening TO them, not around them.
- End by pivoting from personal pain to systemic cause: "This isn't bad luck. This is a business model."

ANTI-PATTERNS:
- Do NOT use vague emotional language ("it's frustrating"). Use specific scenarios instead.
- Do NOT save the emotional punch for later — front-load it here.
- Do NOT explain the system yet — just make the viewer feel the pain and suspect a cause.

RETENTION TECHNIQUE: Emotional anchoring. The viewer commits because they feel personally attacked by the topic — not intellectually interested, emotionally invested.`,
    endingGuidance: 'Transition to villain reveal: "And there is a reason this keeps happening to you."',
  },
  {
    type: 'villain_reveal',
    title: 'The Villain Reveal',
    targetWordRange: [250, 320],
    instructions: `STRUCTURE:
- Name the specific villain (company, industry body, system, incentive structure).
- Include exactly ONE "Proof Anchor" — a specific, verifiable detail the viewer could look up themselves. Examples: a timestamped job listing reposted monthly since 2023, specific SEC filing language, an earnings call quote, a policy clause, a public data point. Frame it as: "Don't take my word for it — [specific thing] is right there if you look."
- Deliver the most shocking statistic from the creative brief.
- End with an open loop teasing the mechanism.

ANTI-PATTERNS:
- Do NOT use vague "they" without eventually naming who "they" are.
- Do NOT present the villain as cartoonishly evil — present them as rationally following incentives.
- Do NOT imply conspiracy — show how the system rewards this behavior.

RETENTION TECHNIQUE: Proof Anchor + open loop. Trust goes up (verifiable claim), curiosity stays high (mechanism teased but not revealed).`,
    endingGuidance: 'End by teasing the mechanism: "And the way they pull it off is almost elegant — if it weren\'t ruining your life."',
  },
  {
    type: 'mechanism',
    title: 'The Mechanism',
    targetWordRange: [420, 520],
    instructions: `STRUCTURE:
- Break down 3 specific tactics or steps, each more shocking than the last. ESCALATE — never peak on tactic 1.
- Vary the delivery structure for each tactic: lead with a story for one, lead with a number for another, lead with a rhetorical question for the third.
- Insert a PATTERN INTERRUPT between tactics: shift from "they" to "you", from data to anecdote, from serious to darkly funny, or drop a one-line gut punch.
- Use specific numbers, percentages, dates, and named examples. "47% of listings" not "nearly half."
- Make complex systems feel obvious in hindsight — "Of course they do this. The incentives practically demand it."

ANTI-PATTERNS:
- Do NOT use identical parallel structure for all tactics (e.g., "Tactic 1: ... Tactic 2: ... Tactic 3: ...").
- Do NOT explain all tactics at the same energy level — build intensity.
- Do NOT use generic analogies. Every comparison must be specific and connect back to the topic within 2 sentences.
- Do NOT let any single tactic run longer than 180 words without a pattern interrupt.

RETENTION TECHNIQUE: Escalation + pattern interrupts. Viewers who think "I get it" after tactic 1 are surprised by tactic 2, and shocked by tactic 3. The varied structure prevents the "list fatigue" that kills mid-video retention.`,
    endingGuidance: 'Transition to the twist: "But here is the part that changes everything."',
  },
  {
    type: 'twist',
    title: 'The Twist',
    targetWordRange: [280, 350],
    instructions: `STRUCTURE:
- Recontextualize everything the viewer just learned. The twist should make them rethink the entire video.
- This is NOT new information — it's a new LENS on the information already presented.
- Examples of good twists: "The system isn't broken — it's working exactly as designed", revealing the viewer is complicit, showing the problem is far bigger than the specific topic, revealing an unexpected beneficiary.
- Use the twist from the creative brief as the foundation.
- Build to the highest emotional intensity in the script here.

ANTI-PATTERNS:
- Do NOT introduce entirely new topics or tangents.
- Do NOT make the twist feel like a conspiracy theory — ground it in incentives and systems.
- Do NOT let the twist feel like a letdown after the mechanism — it must ELEVATE, not deflate.

RETENTION TECHNIQUE: Recontextualization at the 65% mark. This is placed precisely where retention typically drops hardest. Viewers who were considering leaving now feel they have to stay because the entire video just changed meaning.`,
    endingGuidance: 'Transition to takeaway with the weight of the recontextualization: "So where does that leave you?"',
  },
  {
    type: 'takeaway',
    title: 'The Takeaway',
    targetWordRange: [170, 230],
    instructions: `STRUCTURE:
- Do NOT summarize the video. The viewer just watched it — they don't need a recap.
- Deliver emotional payoff: the feeling the viewer should walk away with.
- Choose ONE approach based on the topic:
  A) EMPOWERING: Concrete, specific actions the viewer can take. Not vague advice — actual steps.
  B) DARKLY KNOWING: "Now you see it. And you can't unsee it." The viewer joins the club of people who understand.
- Final 1-2 sentences must be quotable. The kind of line someone screenshots and posts.

ANTI-PATTERNS:
- Do NOT recap the video's points.
- Do NOT hedge with "it's complicated" or "there are no easy answers."
- Do NOT end with a question unless it's genuinely haunting, not lazy.

RETENTION TECHNIQUE: Emotional payoff + quotable closer. Viewers who stay to the end should feel rewarded, not lectured. The final line is the one they remember and share.`,
    endingGuidance: 'Final line should be quotable, punchy, and land like a mic drop. This is the line they screenshot.',
  },
];

/**
 * Generate the Tone & Angle Brief - the retention-optimized creative foundation for the script.
 */
async function generateToneAngleBrief(idea: IdeaInput, channelConfig?: ChannelConfig): Promise<{ brief: ToneAngleBrief; usageMetadata?: UsageMetadata }> {
  const modelName = channelConfig?.textGenModel || 'gemini-3-pro-preview';
  const model = genAI.getGenerativeModel({ model: modelName });

  const prompt = `Analyze this video topic and create a retention-optimized creative brief for an exposé-style script.

TOPIC: ${idea.title}
DESCRIPTION: ${idea.description}

Create a brief that answers:
1. WHO is the villain? (a specific named entity — company, industry body, or system. Not vague "corporations")
2. What's the COLD OPEN? (Write the actual first sentence of the script. Under 15 words. Must name the topic directly. No metaphors, no build-up.)
3. What's the LIE people believe vs the TRUTH?
4. What are 3 SHOCK FACTS? (The first must be a verifiable proof anchor — something the viewer could look up themselves, like a specific filing, policy clause, or public data point. The other two should be specific statistics or named examples.)
5. What's the TWIST? (How does this recontextualize everything at the 65% mark? Not new info — a new lens on existing info. Example: "The system isn't broken — it's working exactly as designed.")
6. What's the EMOTIONAL JOURNEY? (What should viewers feel at each quarter: Q1 curiosity, Q2 recognition, Q3 anger/shock, Q4 empowerment or dark knowledge?)
7. How SAVAGE should we be? (mild/moderate/savage — based on how egregious the topic is)

OUTPUT FORMAT (JSON only, no markdown):
{
  "villain": "specific named entity or system",
  "coldOpen": "First sentence of the script, under 15 words, names the topic directly",
  "lieTruthContrast": {
    "lie": "what people believe",
    "truth": "the reality"
  },
  "shockFacts": [
    "verifiable proof anchor (something the viewer could look up)",
    "specific statistic with source context",
    "specific statistic or named example"
  ],
  "twist": "the recontextualization that changes the meaning of everything before it",
  "emotionalJourney": {
    "q1": "emotion at 0-25%",
    "q2": "emotion at 25-50%",
    "q3": "emotion at 50-75%",
    "q4": "emotion at 75-100%"
  },
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
  previousSections: ScriptSection[],
  channelConfig?: ChannelConfig
): Promise<{ section: ScriptSection; usageMetadata?: UsageMetadata }> {
  const modelName = channelConfig?.textGenModel || 'gemini-3-pro-preview';
  const model = genAI.getGenerativeModel({ model: modelName });

  const personaPrompt = channelConfig?.personaPrompt || PERSONA_PROMPT;

  const previousContext = previousSections.length > 0
    ? `\n\nPREVIOUS SECTIONS (for continuity):\n${previousSections.map(s => `[${s.title}]\n${s.content}`).join('\n\n')}`
    : '';

  const prompt = `${personaPrompt}

TOPIC: ${idea.title}
DESCRIPTION: ${idea.description}

CREATIVE BRIEF:
- Villain: ${brief.villain}
- Cold Open (use this as the first sentence): ${brief.coldOpen}
- The Lie: ${brief.lieTruthContrast.lie}
- The Truth: ${brief.lieTruthContrast.truth}
- Shock Facts: 1) ${brief.shockFacts[0]} 2) ${brief.shockFacts[1]} 3) ${brief.shockFacts[2]}
- The Twist (for recontextualization at 65%): ${brief.twist}
- Emotional Journey: Q1=${brief.emotionalJourney.q1}, Q2=${brief.emotionalJourney.q2}, Q3=${brief.emotionalJourney.q3}, Q4=${brief.emotionalJourney.q4}
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
export async function generateScript(idea: IdeaInput, channelConfig?: ChannelConfig): Promise<ScriptResult & { usageMetadata: UsageMetadata }> {
  console.log('[DEBUG] Starting section-chained script generation for:', idea.title);

  // Accumulate usage metadata across all text generation calls
  const accumulatedUsage: UsageMetadata = { promptTokenCount: 0, candidatesTokenCount: 0, totalTokenCount: 0, thoughtsTokenCount: 0 };

  // Step 1: Generate Tone & Angle Brief
  const { brief, usageMetadata: briefUsage } = await generateToneAngleBrief(idea, channelConfig);
  if (briefUsage) {
    accumulatedUsage.promptTokenCount! += briefUsage.promptTokenCount || 0;
    accumulatedUsage.candidatesTokenCount! += briefUsage.candidatesTokenCount || 0;
    accumulatedUsage.totalTokenCount! += briefUsage.totalTokenCount || 0;
    accumulatedUsage.thoughtsTokenCount! += briefUsage.thoughtsTokenCount || 0;
  }

  // Step 2: Generate each section in sequence
  const sections: ScriptSection[] = [];
  const sectionConfigs: SectionConfig[] = channelConfig?.sectionConfigs || SECTION_CONFIGS;

  for (const config of sectionConfigs) {
    console.log(`[DEBUG] Generating section: ${config.title}`);
    const { section, usageMetadata: sectionUsage } = await generateSection(idea, brief, config, sections, channelConfig);
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
  count: number = 10,
  channelConfig?: ChannelConfig
): Promise<IdeaInput[]> {
  const modelName = channelConfig?.textGenModel || 'gemini-3-pro-preview';
  const model = genAI.getGenerativeModel({ model: modelName });

  const existingList = existingTitles.length > 0
    ? `\n\nEXISTING IDEAS (do not repeat these):\n${existingTitles.map(t => `- ${t}`).join('\n')}`
    : '';

  const channelContext = channelConfig ? buildPromptContext(channelConfig) : CHANNEL_BRIEF.toPromptContext();

  const prompt = `Generate ${count} unique video ideas for a YouTube channel.

${channelContext}

IDEA REQUIREMENTS:
- The viewer must be PERSONALLY affected by the topic (job market, subscriptions, housing, healthcare, banking, education, food, tech platforms)
- There must be a clear, NAMED villain (specific company, industry body, or incentive structure — not vague "corporations")
- There must be a TWIST that recontextualizes the topic (the system isn't broken — it's working as designed; the viewer is unknowingly complicit; the problem is far bigger than it seems)
- Titles must use curiosity gaps or negativity bias — NOT generic "How X Works" or "The Truth About X"
- Descriptions should outline: the personal pain point, the villain, the mechanism, and the twist
${existingList}

OUTPUT FORMAT (JSON array):
[
  {
    "title": "Your Landlord's Favorite Legal Loophole",
    "description": "Most renters think rent increases are market-driven. They're not. Cover: how REITs use algorithmic pricing software (RealPage) to coordinate rent increases across competing properties without technically colluding. The twist: renters are funding the software through their own rent payments. Villain: RealPage and institutional landlords. Personal impact: average $150/month overcharge."
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
export async function generateMetadata(script: string, channelConfig?: ChannelConfig): Promise<VideoMetadata> {
  const modelName = channelConfig?.metadataModel || 'gemini-3-pro-preview';
  const model = genAI.getGenerativeModel({
    model: modelName,
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: metadataSchema,
      temperature: 0.9, // Higher creativity for CTR optimization
    },
  });

  const metaPersona = channelConfig?.metadataPersona || METADATA_PROMPT;

  const prompt = `${metaPersona}

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
