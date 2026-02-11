import prisma from './prisma';
import type { VideoStatus, StepName, StepStatus, AssetType } from '@prisma/client';
import * as fs from 'fs/promises';
import * as path from 'path';

// ── Channel CRUD ──

export async function createChannel(data: {
  name: string;
  slug: string;
  isDefault?: boolean;
  channelTheme: string;
  toneArray: string[];
  nicheConstraints: string;
  aspectRatio?: string;
  targetDuration?: string;
  targetWordCount?: number;
  pacing?: string;
  personaPrompt: string;
  scriptSections: any;
  sectionConfigs: any;
  ideaGenerationPrompt?: string | null;
  metadataPersona: string;
  visualStyleDescription: string;
  styleInstruction: string;
  styleReferencePath: string;
  characterBible: string;
  characterDisplayNames: any;
  thumbnailStylePrompt: string;
  ttsVoiceName?: string;
  ttsSpeakingStyle?: string | null;
  textGenModel?: string;
  sceneBreakdownModel?: string;
  imageGenModel?: string;
  ttsModel?: string;
  metadataModel?: string;
}) {
  return prisma.channel.create({ data });
}

export async function getChannel(id: string) {
  return prisma.channel.findUnique({ where: { id } });
}

export async function getDefaultChannel() {
  return prisma.channel.findFirst({ where: { isDefault: true } });
}

export async function getAllChannels() {
  return prisma.channel.findMany({ orderBy: { createdAt: 'asc' } });
}

export async function updateChannel(id: string, data: Record<string, any>) {
  return prisma.channel.update({ where: { id }, data });
}

export async function deleteChannel(id: string) {
  return prisma.channel.delete({ where: { id } });
}

// ── Idea CRUD ──

export async function createIdea(title: string, description: string, channelId?: string | null) {
  return prisma.idea.create({
    data: { title, description, channelId: channelId ?? undefined },
  });
}

export interface IdeasFilter {
  used?: boolean;
  channelId?: string;
}

export async function getAllIdeas(filters?: IdeasFilter) {
  const where: { used?: boolean; channelId?: string } = {};
  if (filters?.used !== undefined) {
    where.used = filters.used;
  }
  if (filters?.channelId) {
    where.channelId = filters.channelId;
  }

  return prisma.idea.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: {
      videos: {
        select: { id: true, title: true, status: true },
      },
    },
  });
}

export async function getIdea(id: string) {
  return prisma.idea.findUnique({
    where: { id },
    include: {
      videos: {
        select: { id: true, title: true, status: true },
      },
    },
  });
}

export async function updateIdea(id: string, data: { title?: string; description?: string }) {
  return prisma.idea.update({
    where: { id },
    data,
  });
}

export async function deleteIdea(id: string) {
  // Check if idea exists first to avoid "not found" error
  const idea = await prisma.idea.findUnique({ where: { id } });
  if (!idea) {
    return null; // Already deleted
  }
  return prisma.idea.delete({
    where: { id },
  });
}

export async function deleteIdeas(ids: string[]) {
  // Delete in bulk, ignoring non-existent records
  const result = await prisma.idea.deleteMany({
    where: { id: { in: ids } },
  });
  return result.count;
}

export async function getUnusedIdea(channelId?: string) {
  const where: { used: boolean; channelId?: string } = { used: false };
  if (channelId) where.channelId = channelId;
  return prisma.idea.findFirst({
    where,
    orderBy: { createdAt: 'asc' },
  });
}

export async function markIdeaUsed(ideaId: string) {
  return prisma.idea.update({
    where: { id: ideaId },
    data: { used: true },
  });
}

export async function getAllIdeaTitles(channelId?: string) {
  const where: { channelId?: string } = {};
  if (channelId) where.channelId = channelId;
  const ideas = await prisma.idea.findMany({
    where,
    select: { title: true },
  });
  return ideas.map((i: { title: string }) => i.title);
}

export async function createVideo(ideaId: string | null, title: string, channelId?: string | null) {
  return prisma.video.create({
    data: { ideaId, title, channelId: channelId ?? undefined },
  });
}

export async function updateVideoStatus(videoId: string, status: VideoStatus) {
  return prisma.video.update({
    where: { id: videoId },
    data: { status },
  });
}

export async function updateVideoScript(videoId: string, script: string) {
  return prisma.video.update({
    where: { id: videoId },
    data: { script },
  });
}

export async function getVideo(videoId: string) {
  return prisma.video.findUnique({
    where: { id: videoId },
    include: { idea: true, assets: true, steps: true },
  });
}

export async function getLatestVideo() {
  return prisma.video.findFirst({
    orderBy: { createdAt: 'desc' },
    include: { idea: true },
  });
}

export async function createStep(videoId: string, step: StepName) {
  return prisma.step.create({
    data: {
      videoId,
      step,
      status: 'pending',
    },
  });
}

export async function startStep(stepId: string) {
  return prisma.step.update({
    where: { id: stepId },
    data: {
      status: 'running',
      startedAt: new Date(),
    },
  });
}

export async function completeStep(stepId: string) {
  return prisma.step.update({
    where: { id: stepId },
    data: {
      status: 'success',
      finishedAt: new Date(),
    },
  });
}

export async function failStep(stepId: string, error: string) {
  return prisma.step.update({
    where: { id: stepId },
    data: {
      status: 'failed',
      error,
      finishedAt: new Date(),
    },
  });
}

export async function getStepByName(videoId: string, stepName: StepName) {
  return prisma.step.findFirst({
    where: { videoId, step: stepName },
  });
}

export async function createAsset(
  videoId: string,
  type: AssetType,
  filename: string,
  path: string,
  metadata?: Record<string, unknown>
) {
  return prisma.asset.create({
    data: {
      videoId,
      type,
      filename,
      path,
      metadata: metadata ? JSON.parse(JSON.stringify(metadata)) : undefined,
    },
  });
}

export async function getAssetsByType(videoId: string, type: AssetType) {
  return prisma.asset.findMany({
    where: { videoId, type },
    orderBy: { createdAt: 'asc' },
  });
}

export async function deleteAssetsByVideoId(videoId: string) {
  return prisma.asset.deleteMany({
    where: { videoId },
  });
}

export async function resetStepsFromStep(videoId: string, fromStep: StepName) {
  const stepOrder: StepName[] = [
    'ideas',
    'pick_idea',
    'scripting',
    'scenes',
    'images',
    'images_batch1',
    'images_batch2',
    'audio',
    'transcribe',
    'align',
    'review',
    'render',
  ];

  const fromIndex = stepOrder.indexOf(fromStep);
  const stepsToReset = stepOrder.slice(fromIndex);

  return prisma.step.updateMany({
    where: {
      videoId,
      step: { in: stepsToReset },
    },
    data: {
      status: 'pending',
      error: null,
      startedAt: null,
      finishedAt: null,
    },
  });
}

export interface VideosFilter {
  status?: VideoStatus;
  channelId?: string;
}

export async function getAllVideos(filters?: VideosFilter) {
  const where: { status?: VideoStatus; channelId?: string } = {};
  if (filters?.status) {
    where.status = filters.status;
  }
  if (filters?.channelId) {
    where.channelId = filters.channelId;
  }

  return prisma.video.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: {
      idea: {
        select: { id: true, title: true },
      },
      steps: {
        orderBy: { step: 'asc' },
      },
      assets: true,
    },
  });
}

export async function deleteVideo(id: string) {
  // Get video to find associated files
  const video = await prisma.video.findUnique({
    where: { id },
    include: { assets: true },
  });

  if (!video) {
    throw new Error('Video not found');
  }

  // Delete asset files from disk
  for (const asset of video.assets) {
    try {
      await fs.unlink(asset.path);
    } catch {
      // File may not exist, continue
    }
  }

  // Delete video directory if it exists
  const videoDir = path.join(process.cwd(), 'public', 'jobs', id);
  try {
    await fs.rm(videoDir, { recursive: true, force: true });
  } catch {
    // Directory may not exist
  }

  // Delete from database (cascade deletes assets and steps)
  return prisma.video.delete({
    where: { id },
  });
}

export async function updateVideoMeta(
  id: string,
  data: {
    clickbaitTitles?: string[];
    seoDescription?: string;
    seoKeywords?: string[];
    thumbnailPrompts?: string[];
  }
) {
  return prisma.video.update({
    where: { id },
    data,
  });
}

export async function updateVideoCost(
  id: string,
  costCents: number,
  costBreakdown: {
    geminiText: number;
    geminiTTS: number;
    geminiImage: number;
    assemblyAI: number;
    totalCents: number;
  }
) {
  return prisma.video.update({
    where: { id },
    data: {
      costCents,
      costBreakdown: JSON.parse(JSON.stringify(costBreakdown)),
    },
  });
}

// ── User CRUD ──

export async function createUser(username: string, passwordHash: string, isAdmin: boolean = false) {
  return prisma.user.create({
    data: { username, passwordHash, isAdmin },
  });
}

export async function getUserByUsername(username: string) {
  return prisma.user.findUnique({ where: { username } });
}

export async function getUserCount() {
  return prisma.user.count();
}

export async function getAllUsers() {
  return prisma.user.findMany({
    select: { id: true, username: true, isAdmin: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  });
}

// ── BatchJob CRUD ──

export async function createBatchJob(data: {
  videoId: string;
  phase: number;
  batchName: string;
  sceneIndices: number[];
}) {
  return prisma.batchJob.create({
    data: {
      videoId: data.videoId,
      phase: data.phase,
      batchName: data.batchName,
      status: 'pending',
      sceneIndices: data.sceneIndices,
    },
  });
}

export async function updateBatchJobStatus(id: string, status: string, resultFile?: string) {
  return prisma.batchJob.update({
    where: { id },
    data: { status, ...(resultFile ? { resultFile } : {}) },
  });
}

export async function getPendingBatchJobs() {
  return prisma.batchJob.findMany({
    where: { status: { in: ['pending', 'running'] } },
    include: { video: true },
  });
}

export async function getBatchJobsByVideoId(videoId: string) {
  return prisma.batchJob.findMany({
    where: { videoId },
    orderBy: { phase: 'asc' },
  });
}

// ── Schedule CRUD ──

export async function createSchedule(data: {
  intervalHours: number;
  enabled?: boolean;
  generateIdeas?: boolean;
  enableReview?: boolean;
  channelId?: string | null;
}) {
  const now = new Date();
  const nextRunAt = new Date(now.getTime() + data.intervalHours * 60 * 60 * 1000);
  return prisma.schedule.create({
    data: {
      intervalHours: data.intervalHours,
      enabled: data.enabled ?? true,
      generateIdeas: data.generateIdeas ?? true,
      enableReview: data.enableReview ?? false,
      channelId: data.channelId ?? undefined,
      nextRunAt,
    },
  });
}

export async function updateSchedule(id: string, data: {
  intervalHours?: number;
  enabled?: boolean;
  generateIdeas?: boolean;
  enableReview?: boolean;
}) {
  return prisma.schedule.update({
    where: { id },
    data,
  });
}

export async function deleteSchedule(id: string) {
  return prisma.schedule.delete({ where: { id } });
}

export async function getAllSchedules(channelId?: string) {
  const where: { channelId?: string } = {};
  if (channelId) where.channelId = channelId;
  return prisma.schedule.findMany({ where, orderBy: { createdAt: 'desc' } });
}

export async function getDueSchedules() {
  return prisma.schedule.findMany({
    where: {
      enabled: true,
      nextRunAt: { lte: new Date() },
    },
    include: { channel: true },
  });
}

export async function updateScheduleRun(id: string, intervalHours: number) {
  const now = new Date();
  return prisma.schedule.update({
    where: { id },
    data: {
      lastRunAt: now,
      nextRunAt: new Date(now.getTime() + intervalHours * 60 * 60 * 1000),
    },
  });
}

// ── RenderLock ──

export async function ensureRenderLock() {
  const existing = await prisma.renderLock.findUnique({ where: { id: 'singleton' } });
  if (!existing) {
    await prisma.renderLock.create({ data: { id: 'singleton', videoId: null } });
  }
}

export async function acquireRenderLockDb(videoId: string): Promise<boolean> {
  // Attempt to acquire lock atomically
  const result = await prisma.renderLock.updateMany({
    where: { id: 'singleton', videoId: null },
    data: { videoId, lockedAt: new Date() },
  });
  return result.count > 0;
}

export async function releaseRenderLockDb(videoId: string) {
  return prisma.renderLock.updateMany({
    where: { id: 'singleton', videoId },
    data: { videoId: null, lockedAt: null },
  });
}

export async function getRenderLock() {
  return prisma.renderLock.findUnique({ where: { id: 'singleton' } });
}

export { prisma };
export type { VideoStatus, StepName, StepStatus, AssetType };
