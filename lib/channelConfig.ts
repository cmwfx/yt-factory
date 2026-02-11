import prisma from './prisma';
import type { ChannelConfig, SectionPromptConfig } from '@/types';

/**
 * Convert a Prisma Channel record to a runtime ChannelConfig.
 */
export function channelToConfig(channel: any): ChannelConfig {
  return {
    id: channel.id,
    name: channel.name,
    slug: channel.slug,
    isDefault: channel.isDefault,

    // Identity
    channelTheme: channel.channelTheme,
    toneArray: channel.toneArray,
    nicheConstraints: channel.nicheConstraints,

    // Format
    aspectRatio: channel.aspectRatio,
    targetDuration: channel.targetDuration,
    targetWordCount: channel.targetWordCount,
    pacing: channel.pacing,

    // Script Generation
    personaPrompt: channel.personaPrompt,
    scriptSections: channel.scriptSections as ChannelConfig['scriptSections'],
    sectionConfigs: channel.sectionConfigs as SectionPromptConfig[],
    ideaGenerationPrompt: channel.ideaGenerationPrompt,
    metadataPersona: channel.metadataPersona,

    // Visual Style
    visualStyleDescription: channel.visualStyleDescription,
    styleInstruction: channel.styleInstruction,
    styleReferencePath: channel.styleReferencePath,
    characterBible: channel.characterBible,
    characterDisplayNames: channel.characterDisplayNames as Record<string, string>,
    thumbnailStylePrompt: channel.thumbnailStylePrompt,

    // Voice / TTS
    ttsVoiceName: channel.ttsVoiceName,
    ttsSpeakingStyle: channel.ttsSpeakingStyle,

    // AI Models
    textGenModel: channel.textGenModel,
    sceneBreakdownModel: channel.sceneBreakdownModel,
    imageGenModel: channel.imageGenModel,
    ttsModel: channel.ttsModel,
    metadataModel: channel.metadataModel,
  };
}

/**
 * Get a channel config by ID.
 */
export async function getChannelConfig(channelId: string): Promise<ChannelConfig> {
  const channel = await prisma.channel.findUnique({ where: { id: channelId } });
  if (!channel) throw new Error(`Channel not found: ${channelId}`);
  return channelToConfig(channel);
}

/**
 * Get the default channel config.
 */
export async function getDefaultChannelConfig(): Promise<ChannelConfig> {
  const channel = await prisma.channel.findFirst({ where: { isDefault: true } });
  if (!channel) throw new Error('No default channel found');
  return channelToConfig(channel);
}

/**
 * Get channel config from a channelId, falling back to default.
 */
export async function resolveChannelConfig(channelId?: string | null): Promise<ChannelConfig> {
  if (channelId) {
    return getChannelConfig(channelId);
  }
  return getDefaultChannelConfig();
}

/**
 * Build a prompt context string from a ChannelConfig (replaces CHANNEL_BRIEF.toPromptContext()).
 */
export function buildPromptContext(config: ChannelConfig): string {
  return `
CHANNEL CONTEXT:
Theme: ${config.channelTheme}
Tone: ${config.toneArray.join(', ')}
Format: ${config.aspectRatio} videos, ${config.targetDuration}, ${config.targetWordCount} words
Pacing: ${config.pacing}
Visual Style: ${config.visualStyleDescription}
  `.trim();
}
