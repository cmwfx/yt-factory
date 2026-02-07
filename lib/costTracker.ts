/**
 * Cost tracking utility for API usage.
 * Tracks token usage from Gemini APIs and audio duration from AssemblyAI.
 */

// Gemini pricing (as of 2024) - prices per 1M tokens in USD
// These are estimates and should be updated based on actual pricing
const GEMINI_PRICING = {
  // gemini-3-pro-preview (text generation)
  'gemini-3-pro-preview': {
    inputPerMillion: 1.25,   // $1.25 per 1M input tokens
    outputPerMillion: 5.00,  // $5.00 per 1M output tokens
    thinkingPerMillion: 1.25, // Thinking tokens charged as input
  },
  // gemini-2.5-pro-preview-tts (text-to-speech)
  'gemini-2.5-pro-preview-tts': {
    inputPerMillion: 0.15,   // Lower rate for TTS input
    outputPerMillion: 3.50,  // Audio output tokens
  },
  // gemini-3-pro-image-preview (image generation)
  'gemini-3-pro-image-preview': {
    inputPerMillion: 1.25,
    outputPerMillion: 30.00,
    imagePerGeneration: 0.039, // 1290 tokens × $30/1M
    thinkingPerMillion: 1.25,
  },
};

// AssemblyAI pricing
const ASSEMBLYAI_PRICING = {
  perSecond: 0.00025, // $0.00025 per second of audio
};

export interface UsageMetadata {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  totalTokenCount?: number;
  thoughtsTokenCount?: number;
  promptTokensDetails?: Array<{ modality: string; tokenCount: number }>;
  candidatesTokensDetails?: Array<{ modality: string; tokenCount: number }>;
}

export interface CostBreakdown {
  geminiText: number;    // Cost in cents
  geminiTTS: number;     // Cost in cents
  geminiImage: number;   // Cost in cents
  assemblyAI: number;    // Cost in cents
  totalCents: number;    // Total cost in cents
}

/**
 * Calculate cost from Gemini text generation usage metadata.
 */
export function calculateGeminiTextCost(usage: UsageMetadata): number {
  const pricing = GEMINI_PRICING['gemini-3-pro-preview'];

  const inputTokens = usage.promptTokenCount || 0;
  const outputTokens = usage.candidatesTokenCount || 0;
  const thinkingTokens = usage.thoughtsTokenCount || 0;

  const inputCost = (inputTokens / 1_000_000) * pricing.inputPerMillion;
  const outputCost = (outputTokens / 1_000_000) * pricing.outputPerMillion;
  const thinkingCost = (thinkingTokens / 1_000_000) * pricing.thinkingPerMillion;

  // Return cost in cents
  return Math.round((inputCost + outputCost + thinkingCost) * 100);
}

/**
 * Calculate cost from Gemini TTS usage metadata.
 */
export function calculateGeminiTTSCost(usage: UsageMetadata): number {
  const pricing = GEMINI_PRICING['gemini-2.5-pro-preview-tts'];

  const inputTokens = usage.promptTokenCount || 0;
  const outputTokens = usage.candidatesTokenCount || 0;

  const inputCost = (inputTokens / 1_000_000) * pricing.inputPerMillion;
  const outputCost = (outputTokens / 1_000_000) * pricing.outputPerMillion;

  // Return cost in cents
  return Math.round((inputCost + outputCost) * 100);
}

/**
 * Calculate cost from Gemini image generation usage metadata.
 */
export function calculateGeminiImageCost(usage: UsageMetadata, imageCount: number = 1, isBatch: boolean = false): number {
  const pricing = GEMINI_PRICING['gemini-3-pro-image-preview'];

  const inputTokens = usage.promptTokenCount || 0;
  const outputTokens = usage.candidatesTokenCount || 0;
  const thinkingTokens = usage.thoughtsTokenCount || 0;

  const inputCost = (inputTokens / 1_000_000) * pricing.inputPerMillion;
  const outputCost = (outputTokens / 1_000_000) * pricing.outputPerMillion;
  const thinkingCost = (thinkingTokens / 1_000_000) * pricing.thinkingPerMillion;
  const imageCost = imageCount * pricing.imagePerGeneration;
  const totalCost = inputCost + outputCost + thinkingCost + imageCost;

  // Batch API gives 50% discount
  const finalCost = isBatch ? totalCost * 0.5 : totalCost;

  // Return cost in cents
  return Math.round(finalCost * 100);
}

/**
 * Calculate cost from AssemblyAI transcription.
 */
export function calculateAssemblyAICost(audioDurationSeconds: number): number {
  const cost = audioDurationSeconds * ASSEMBLYAI_PRICING.perSecond;
  // Return cost in cents
  return Math.round(cost * 100);
}

/**
 * Cost accumulator for tracking costs across a video generation pipeline.
 */
export class CostAccumulator {
  private geminiTextCents: number = 0;
  private geminiTTSCents: number = 0;
  private geminiImageCents: number = 0;
  private assemblyAICents: number = 0;

  /**
   * Add Gemini text generation cost.
   */
  addGeminiText(usage: UsageMetadata): void {
    this.geminiTextCents += calculateGeminiTextCost(usage);
  }

  /**
   * Add Gemini TTS cost.
   */
  addGeminiTTS(usage: UsageMetadata): void {
    this.geminiTTSCents += calculateGeminiTTSCost(usage);
  }

  /**
   * Add Gemini image generation cost.
   */
  addGeminiImage(usage: UsageMetadata, imageCount: number = 1, isBatch: boolean = false): void {
    this.geminiImageCents += calculateGeminiImageCost(usage, imageCount, isBatch);
  }

  /**
   * Add AssemblyAI transcription cost.
   */
  addAssemblyAI(audioDurationSeconds: number): void {
    this.assemblyAICents += calculateAssemblyAICost(audioDurationSeconds);
  }

  /**
   * Get the total cost breakdown.
   */
  getBreakdown(): CostBreakdown {
    const totalCents = this.geminiTextCents + this.geminiTTSCents +
                       this.geminiImageCents + this.assemblyAICents;

    return {
      geminiText: this.geminiTextCents,
      geminiTTS: this.geminiTTSCents,
      geminiImage: this.geminiImageCents,
      assemblyAI: this.assemblyAICents,
      totalCents,
    };
  }

  /**
   * Get total cost in cents.
   */
  getTotalCents(): number {
    return this.geminiTextCents + this.geminiTTSCents +
           this.geminiImageCents + this.assemblyAICents;
  }

  /**
   * Format total cost as a dollar string.
   */
  formatTotal(): string {
    const dollars = this.getTotalCents() / 100;
    return `$${dollars.toFixed(2)}`;
  }

  /**
   * Reset all costs.
   */
  reset(): void {
    this.geminiTextCents = 0;
    this.geminiTTSCents = 0;
    this.geminiImageCents = 0;
    this.assemblyAICents = 0;
  }
}

/**
 * Format cents as a dollar string.
 */
export function formatCost(cents: number): string {
  const dollars = cents / 100;
  return `$${dollars.toFixed(2)}`;
}
