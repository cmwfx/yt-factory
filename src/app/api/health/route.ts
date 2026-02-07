import { NextResponse } from 'next/server';
import { prisma, getLatestVideo } from '@/lib/db';
import { checkFFmpegAvailable } from '@/utils/ffmpeg';

export async function GET() {
  const health: Record<string, unknown> = {
    status: 'ok',
    timestamp: new Date().toISOString(),
  };

  // Check database connection
  try {
    await prisma.$queryRaw`SELECT 1`;
    health.db = 'ok';
  } catch (error) {
    health.db = 'error';
    health.dbError = error instanceof Error ? error.message : 'Unknown error';
    health.status = 'degraded';
  }

  // Check FFmpeg availability
  try {
    const ffmpegOk = await checkFFmpegAvailable();
    health.ffmpeg = ffmpegOk ? 'ok' : 'missing';
    if (!ffmpegOk) {
      health.status = 'degraded';
    }
  } catch {
    health.ffmpeg = 'error';
    health.status = 'degraded';
  }

  // Get latest job info
  try {
    const latestVideo = await getLatestVideo();
    if (latestVideo) {
      health.lastJob = {
        id: latestVideo.id,
        title: latestVideo.title,
        status: latestVideo.status,
        updatedAt: latestVideo.updatedAt,
      };
    } else {
      health.lastJob = null;
    }
  } catch {
    health.lastJob = null;
  }

  // Check environment variables
  const envCheck = {
    GOOGLE_GENAI_API_KEY: !!process.env.GOOGLE_GENAI_API_KEY,
    ASSEMBLYAI_API_KEY: !!process.env.ASSEMBLYAI_API_KEY,
    STYLE_REFERENCE_PATH: !!process.env.STYLE_REFERENCE_PATH,
    DATABASE_URL: !!process.env.DATABASE_URL,
  };

  const missingEnv = Object.entries(envCheck)
    .filter(([_, v]) => !v)
    .map(([k]) => k);

  if (missingEnv.length > 0) {
    health.status = 'degraded';
    health.missingEnv = missingEnv;
  }

  health.env = envCheck;

  const statusCode = health.status === 'ok' ? 200 : 503;
  return NextResponse.json(health, { status: statusCode });
}
