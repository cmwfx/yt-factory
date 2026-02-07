export const CHANNEL_BRIEF = {
  theme: `A calm, analytical explainer channel revealing hidden systems behind everyday products and behaviors (subscriptions, free trials, friction, defaults, incentives).`,

  tone: ['Calm', 'Skeptical', 'Analytical', 'No hype', 'No moralizing'] as const,

  format: {
    aspectRatio: '16:9',
    targetDuration: '~10 minutes',
    targetWordCount: 1500,
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

// Script structure for section-chained generation
export const SCRIPT_STRUCTURE = {
  sections: [
    {
      type: 'hook' as const,
      title: 'The Hook',
      targetWordRange: [150, 200] as [number, number],
      percentageOfTotal: 10,
      purpose: 'Lie vs Truth contrast. Cliffhanger ending.',
    },
    {
      type: 'villain_reveal' as const,
      title: 'The Villain Reveal',
      targetWordRange: [250, 320] as [number, number],
      percentageOfTotal: 18,
      purpose: 'Personify the antagonist. "They" language, deliberate design.',
    },
    {
      type: 'mechanism' as const,
      title: 'The Mechanism',
      targetWordRange: [410, 500] as [number, number],
      percentageOfTotal: 28,
      purpose: 'Explain with cynical/funny analogies. NOT dry facts.',
    },
    {
      type: 'consequence' as const,
      title: 'The Consequence',
      targetWordRange: [310, 390] as [number, number],
      percentageOfTotal: 22,
      purpose: 'Make it personal. Build anger. Uses "you".',
    },
    {
      type: 'takeaway' as const,
      title: 'The Takeaway',
      targetWordRange: [180, 250] as [number, number],
      percentageOfTotal: 12,
      purpose: 'Cynical or empowering conclusion. Memorable ending.',
    },
  ],
  totalTargetWords: 1500,
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
