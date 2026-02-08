export const CHANNEL_BRIEF = {
  theme: `An exposé channel that makes viewers feel like insiders. Reveals hidden, legal-but-predatory systems behind everyday corporate behavior. Every video should feel like a friend pulling you aside to warn you about something urgent that directly affects your life.`,

  tone: ['Controlled intensity', 'Incentive-driven urgency', 'Sharp-witted', 'Specific over vague', 'Escalating stakes', 'No moralizing'] as const,

  format: {
    aspectRatio: '16:9',
    targetDuration: '~10 minutes',
    targetWordCount: 1700,
    pacing: 'Fast pacing with frequent visual changes (every ~2–5s)',
    visualStyle: 'Stick-figure-like editorial illustrations on textured paper backgrounds',
  },

  toPromptContext(): string {
    return `
CHANNEL CONTEXT:
Theme: ${this.theme}
Tone: ${this.tone.join(', ')}
Format: ${this.format.aspectRatio} videos, ${this.format.targetDuration}, ${this.format.targetWordCount} words
Pacing: ${this.format.pacing}
Visual Style: ${this.format.visualStyle}
    `.trim();
  },
};

// Script structure for section-chained generation (6-section retention-optimized)
export const SCRIPT_STRUCTURE = {
  sections: [
    {
      type: 'cold_open' as const,
      title: 'Cold Open',
      targetWordRange: [80, 120] as [number, number],
      percentageOfTotal: 6,
      purpose: 'Name topic sentence 1. Personal stakes. Curiosity loop.',
    },
    {
      type: 'stakes' as const,
      title: 'The Stakes',
      targetWordRange: [200, 260] as [number, number],
      percentageOfTotal: 14,
      purpose: 'Front-load personal pain. Transform bad luck into active betrayal.',
    },
    {
      type: 'villain_reveal' as const,
      title: 'The Villain Reveal',
      targetWordRange: [250, 320] as [number, number],
      percentageOfTotal: 17,
      purpose: 'Named villain. Proof Anchor. Shocking stat. Open loop.',
    },
    {
      type: 'mechanism' as const,
      title: 'The Mechanism',
      targetWordRange: [420, 520] as [number, number],
      percentageOfTotal: 29,
      purpose: '3 escalating tactics with pattern interrupts. Never peak early.',
    },
    {
      type: 'twist' as const,
      title: 'The Twist',
      targetWordRange: [280, 350] as [number, number],
      percentageOfTotal: 19,
      purpose: 'Recontextualize everything at 65%. Recapture dropping viewers.',
    },
    {
      type: 'takeaway' as const,
      title: 'The Takeaway',
      targetWordRange: [170, 230] as [number, number],
      percentageOfTotal: 12,
      purpose: 'Emotional payoff. Quotable mic-drop closer.',
    },
  ],
  totalTargetWords: 1700,
  minSceneBreaks: 40,
  sceneBreakDensity: 15, // 1 scene break per ~15 words minimum
} as const;

export const NANOBANANA_STYLE_INSTRUCTION = `
CRITICAL: Copy the EXACT style and background from the attached reference image.
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
- 16:9 aspect ratio, 1920x1080
`.trim();

export default CHANNEL_BRIEF;
