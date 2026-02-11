import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

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

const SCRIPT_SECTIONS = [
  {
    type: 'cold_open',
    title: 'Cold Open',
    targetWordRange: [80, 120],
    percentageOfTotal: 6,
    purpose: 'Name topic sentence 1. Personal stakes. Curiosity loop.',
  },
  {
    type: 'stakes',
    title: 'The Stakes',
    targetWordRange: [200, 260],
    percentageOfTotal: 14,
    purpose: 'Front-load personal pain. Transform bad luck into active betrayal.',
  },
  {
    type: 'villain_reveal',
    title: 'The Villain Reveal',
    targetWordRange: [250, 320],
    percentageOfTotal: 17,
    purpose: 'Named villain. Proof Anchor. Shocking stat. Open loop.',
  },
  {
    type: 'mechanism',
    title: 'The Mechanism',
    targetWordRange: [420, 520],
    percentageOfTotal: 29,
    purpose: '3 escalating tactics with pattern interrupts. Never peak early.',
  },
  {
    type: 'twist',
    title: 'The Twist',
    targetWordRange: [280, 350],
    percentageOfTotal: 19,
    purpose: 'Recontextualize everything at 65%. Recapture dropping viewers.',
  },
  {
    type: 'takeaway',
    title: 'The Takeaway',
    targetWordRange: [170, 230],
    percentageOfTotal: 12,
    purpose: 'Emotional payoff. Quotable mic-drop closer.',
  },
];

const SECTION_CONFIGS = [
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
- Include exactly ONE "Proof Anchor" — a specific, verifiable detail the viewer could look up themselves.
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
- Vary the delivery structure for each tactic.
- Insert a PATTERN INTERRUPT between tactics.
- Use specific numbers, percentages, dates, and named examples.
- Make complex systems feel obvious in hindsight.

ANTI-PATTERNS:
- Do NOT use identical parallel structure for all tactics.
- Do NOT explain all tactics at the same energy level — build intensity.
- Do NOT use generic analogies.
- Do NOT let any single tactic run longer than 180 words without a pattern interrupt.

RETENTION TECHNIQUE: Escalation + pattern interrupts. Viewers who think "I get it" after tactic 1 are surprised by tactic 2, and shocked by tactic 3.`,
    endingGuidance: 'Transition to the twist: "But here is the part that changes everything."',
  },
  {
    type: 'twist',
    title: 'The Twist',
    targetWordRange: [280, 350],
    instructions: `STRUCTURE:
- Recontextualize everything the viewer just learned. The twist should make them rethink the entire video.
- This is NOT new information — it's a new LENS on the information already presented.
- Build to the highest emotional intensity in the script here.

ANTI-PATTERNS:
- Do NOT introduce entirely new topics or tangents.
- Do NOT make the twist feel like a conspiracy theory — ground it in incentives and systems.
- Do NOT let the twist feel like a letdown after the mechanism — it must ELEVATE, not deflate.

RETENTION TECHNIQUE: Recontextualization at the 65% mark. This is placed precisely where retention typically drops hardest.`,
    endingGuidance: 'Transition to takeaway with the weight of the recontextualization: "So where does that leave you?"',
  },
  {
    type: 'takeaway',
    title: 'The Takeaway',
    targetWordRange: [170, 230],
    instructions: `STRUCTURE:
- Do NOT summarize the video. The viewer just watched it.
- Deliver emotional payoff: the feeling the viewer should walk away with.
- Choose ONE approach: EMPOWERING (concrete actions) or DARKLY KNOWING ("Now you see it").
- Final 1-2 sentences must be quotable.

ANTI-PATTERNS:
- Do NOT recap the video's points.
- Do NOT hedge with "it's complicated."
- Do NOT end with a lazy question.

RETENTION TECHNIQUE: Emotional payoff + quotable closer.`,
    endingGuidance: 'Final line should be quotable, punchy, and land like a mic drop.',
  },
];

const NANOBANANA_STYLE_INSTRUCTION = `CRITICAL: Copy the EXACT style and background from the attached reference image.
The reference image shows a crumpled brown/tan paper texture background - YOU MUST USE THIS EXACT BACKGROUND TEXTURE.
DO NOT use a plain beige or cream background. The background MUST have visible paper wrinkles/creases like the reference.

Style requirements from reference:
- Crumpled/wrinkled brown paper texture background (COPY EXACTLY from reference)
- Black ink stick figure character with purple accent details (clothing, outlines, or highlights)
- Minimalist line art style
- Warm brown/tan color palette matching the paper
- Single recurring male protagonist with simple features
- No white background
- No neon colors (purple accents must be deep/muted, not neon)
- No cartoon exaggeration
- 16:9 aspect ratio, 1920x1080`;

const CHARACTER_BIBLE = `CHARACTER DEFINITIONS (use these EXACTLY):
- THE_VICTIM: Simple stick figure, round head, dot eyes, with subtle purple accent on clothing or outline. This is "you" - the viewer/consumer.
- THE_SUIT: Stick figure with a purple tie OR top hat. Represents corporations, companies, "them".
- THE_SYSTEM: Abstract representation - gears, flowcharts, money symbols. Use sparingly.

RULES:
- Only introduce new characters if absolutely necessary
- THE_VICTIM appears in 70% of scenes
- THE_SUIT appears when discussing corporate/company actions
- Keep character designs IDENTICAL across all scenes`;

const METADATA_PERSONA = `You are an expert at YouTube CTR. You are analyzing a script about legal but unethical corporate behavior.

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
- Instruction: Describe the specific facial expression and the 'Visual Villain' (The Suit).`;

const THUMBNAIL_STYLE_PROMPT = `Generate a YouTube thumbnail image.
- Background: HYPER-REALISTIC, vibrant real-world environment. NOT flat, NOT illustrated, NOT paper texture.
- Characters: 2D MINIMALIST WHITE STICK FIGURES composited into the realistic scene. Simple dot eyes, thin black lines.
- Text: Bold, large, high-contrast colored text overlay (red, white, or yellow on dark, or black on bright). 1-3 words max.
- Composition: Rule of thirds. Eye-catching. YouTube thumbnail proportions (16:9, 1920x1080).
- Color: Saturated, high contrast. Cinematic lighting.
- DO NOT include any crumpled paper texture. DO NOT use a flat/illustrated background.`;

async function main() {
  console.log('Seeding "Sketchy Truths" channel...');

  // Check if channel already exists
  const existing = await prisma.channel.findUnique({ where: { slug: 'sketchy-truths' } });
  if (existing) {
    console.log('Channel "Sketchy Truths" already exists, skipping creation.');
    console.log(`Channel ID: ${existing.id}`);

    // Backfill existing records
    await backfill(existing.id);
    return;
  }

  const channel = await prisma.channel.create({
    data: {
      name: 'Sketchy Truths',
      slug: 'sketchy-truths',
      isDefault: true,
      channelTheme: 'An exposé channel that makes viewers feel like insiders. Reveals hidden, legal-but-predatory systems behind everyday corporate behavior. Every video should feel like a friend pulling you aside to warn you about something urgent that directly affects your life.',
      toneArray: ['Controlled intensity', 'Incentive-driven urgency', 'Sharp-witted', 'Specific over vague', 'Escalating stakes', 'No moralizing'],
      nicheConstraints: 'legal but unethical corporate behavior',
      aspectRatio: '16:9',
      targetDuration: '~10 minutes',
      targetWordCount: 1700,
      pacing: 'Fast pacing with frequent visual changes (every ~2-5s)',
      personaPrompt: PERSONA_PROMPT,
      scriptSections: SCRIPT_SECTIONS,
      sectionConfigs: SECTION_CONFIGS,
      metadataPersona: METADATA_PERSONA,
      visualStyleDescription: 'Stick-figure-like editorial illustrations on textured paper backgrounds',
      styleInstruction: NANOBANANA_STYLE_INSTRUCTION,
      styleReferencePath: process.env.STYLE_REFERENCE_PATH || './assets/style-reference.png',
      characterBible: CHARACTER_BIBLE,
      characterDisplayNames: {
        THE_VICTIM: 'the ordinary person',
        THE_SUIT: 'the man in the suit',
        THE_SYSTEM: 'the abstract system',
      },
      thumbnailStylePrompt: THUMBNAIL_STYLE_PROMPT,
      ttsVoiceName: 'Algenib',
      textGenModel: 'gemini-3-pro-preview',
      sceneBreakdownModel: 'gemini-2.0-flash',
      imageGenModel: 'gemini-3-pro-image-preview',
      ttsModel: 'gemini-2.5-pro-preview-tts',
      metadataModel: 'gemini-3-pro-preview',
    },
  });

  console.log(`Created channel: ${channel.name} (${channel.id})`);

  // Backfill existing records
  await backfill(channel.id);
}

async function backfill(channelId: string) {
  // Backfill Videos
  const videoResult = await prisma.video.updateMany({
    where: { channelId: null },
    data: { channelId },
  });
  console.log(`Backfilled ${videoResult.count} videos`);

  // Backfill Ideas
  const ideaResult = await prisma.idea.updateMany({
    where: { channelId: null },
    data: { channelId },
  });
  console.log(`Backfilled ${ideaResult.count} ideas`);

  // Backfill Schedules
  const scheduleResult = await prisma.schedule.updateMany({
    where: { channelId: null },
    data: { channelId },
  });
  console.log(`Backfilled ${scheduleResult.count} schedules`);

  console.log('Backfill complete!');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
