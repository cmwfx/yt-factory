-- CreateTable
CREATE TABLE "Channel" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "channelTheme" TEXT NOT NULL,
    "toneArray" TEXT[],
    "nicheConstraints" TEXT NOT NULL,
    "aspectRatio" TEXT NOT NULL DEFAULT '16:9',
    "targetDuration" TEXT NOT NULL DEFAULT '~10 minutes',
    "targetWordCount" INTEGER NOT NULL DEFAULT 1700,
    "pacing" TEXT NOT NULL DEFAULT 'Fast pacing with frequent visual changes (every ~2-5s)',
    "personaPrompt" TEXT NOT NULL,
    "scriptSections" JSONB NOT NULL,
    "sectionConfigs" JSONB NOT NULL,
    "ideaGenerationPrompt" TEXT,
    "metadataPersona" TEXT NOT NULL,
    "visualStyleDescription" TEXT NOT NULL,
    "styleInstruction" TEXT NOT NULL,
    "styleReferencePath" TEXT NOT NULL,
    "characterBible" TEXT NOT NULL,
    "characterDisplayNames" JSONB NOT NULL,
    "thumbnailStylePrompt" TEXT NOT NULL,
    "ttsVoiceName" TEXT NOT NULL DEFAULT 'Algenib',
    "ttsSpeakingStyle" TEXT,
    "textGenModel" TEXT NOT NULL DEFAULT 'gemini-3-pro-preview',
    "sceneBreakdownModel" TEXT NOT NULL DEFAULT 'gemini-2.0-flash',
    "imageGenModel" TEXT NOT NULL DEFAULT 'gemini-3-pro-image-preview',
    "ttsModel" TEXT NOT NULL DEFAULT 'gemini-2.5-pro-preview-tts',
    "metadataModel" TEXT NOT NULL DEFAULT 'gemini-3-pro-preview',

    CONSTRAINT "Channel_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Channel_name_key" ON "Channel"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Channel_slug_key" ON "Channel"("slug");

-- AlterTable: Add channelId to Idea
ALTER TABLE "Idea" ADD COLUMN "channelId" TEXT;

-- AlterTable: Add channelId to Video
ALTER TABLE "Video" ADD COLUMN "channelId" TEXT;

-- AlterTable: Add channelId to Schedule
ALTER TABLE "Schedule" ADD COLUMN "channelId" TEXT;

-- AddForeignKey
ALTER TABLE "Idea" ADD CONSTRAINT "Idea_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Video" ADD CONSTRAINT "Video_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Schedule" ADD CONSTRAINT "Schedule_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE SET NULL ON UPDATE CASCADE;
