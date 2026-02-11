import { NextRequest, NextResponse } from 'next/server';
import { getAllChannels, createChannel, getChannel } from '@/lib/db';
import { channelToConfig } from '@/lib/channelConfig';

export async function GET() {
  try {
    const channels = await getAllChannels();
    return NextResponse.json({ channels });
  } catch (error) {
    console.error('Failed to get channels:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Support cloning from an existing channel
    if (body.cloneFromId) {
      const source = await getChannel(body.cloneFromId);
      if (!source) {
        return NextResponse.json({ error: 'Source channel not found' }, { status: 404 });
      }

      const config = channelToConfig(source);
      const channel = await createChannel({
        name: body.name || `${config.name} (copy)`,
        slug: body.slug || `${config.slug}-copy`,
        channelTheme: config.channelTheme,
        toneArray: config.toneArray,
        nicheConstraints: config.nicheConstraints,
        aspectRatio: config.aspectRatio,
        targetDuration: config.targetDuration,
        targetWordCount: config.targetWordCount,
        pacing: config.pacing,
        personaPrompt: config.personaPrompt,
        scriptSections: config.scriptSections,
        sectionConfigs: config.sectionConfigs,
        metadataPersona: config.metadataPersona,
        visualStyleDescription: config.visualStyleDescription,
        styleInstruction: config.styleInstruction,
        styleReferencePath: config.styleReferencePath,
        characterBible: config.characterBible,
        characterDisplayNames: config.characterDisplayNames,
        thumbnailStylePrompt: config.thumbnailStylePrompt,
        ttsVoiceName: config.ttsVoiceName,
        textGenModel: config.textGenModel,
        sceneBreakdownModel: config.sceneBreakdownModel,
        imageGenModel: config.imageGenModel,
        ttsModel: config.ttsModel,
        metadataModel: config.metadataModel,
      });

      return NextResponse.json({ channel }, { status: 201 });
    }

    // Create new blank channel
    if (!body.name || !body.slug) {
      return NextResponse.json(
        { error: 'name and slug are required' },
        { status: 400 }
      );
    }

    const channel = await createChannel(body);
    return NextResponse.json({ channel }, { status: 201 });
  } catch (error) {
    console.error('Failed to create channel:', error);

    if (error instanceof Error && error.message.includes('Unique constraint')) {
      return NextResponse.json(
        { error: 'A channel with this name or slug already exists' },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
