import { NextRequest } from 'next/server';
import { getVideo, getBatchJobsByVideoId } from '@/lib/db';
import { getDownloadProgress } from '@/ai/batchImageGen';
import { loadJson } from '@/utils/fileStore';

interface RouteContext {
  params: Promise<{ id: string }>;
}

const STEP_ORDER = [
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

export async function GET(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let isClosed = false;
      let interval: ReturnType<typeof setInterval> | null = null;

      const cleanup = () => {
        if (interval) {
          clearInterval(interval);
          interval = null;
        }
      };

      const closeStream = () => {
        if (!isClosed) {
          isClosed = true;
          cleanup();
          try {
            controller.close();
          } catch {
            // Controller already closed, ignore
          }
        }
      };

      const sendEvent = (data: object): boolean => {
        if (isClosed) {
          return false;
        }
        try {
          const message = `data: ${JSON.stringify(data)}\n\n`;
          controller.enqueue(encoder.encode(message));
          return true;
        } catch {
          // Controller closed, stop sending
          isClosed = true;
          cleanup();
          return false;
        }
      };

      const poll = async (): Promise<boolean> => {
        if (isClosed) {
          return false;
        }

        try {
          const video = await getVideo(id);

          if (!video) {
            sendEvent({ error: 'Video not found' });
            closeStream();
            return false;
          }

          // Calculate progress
          const completedSteps = video.steps.filter(s => s.status === 'success').length;
          const totalSteps = video.steps.length || STEP_ORDER.length;
          const progress = Math.round((completedSteps / totalSteps) * 100);

          // Find current step
          const runningStep = video.steps.find(s => s.status === 'running');
          const currentStep = runningStep?.step || null;

          // Format steps for response
          const steps = video.steps.map(s => ({
            step: s.step,
            status: s.status,
            error: s.error,
            durationMs: s.startedAt && s.finishedAt
              ? new Date(s.finishedAt).getTime() - new Date(s.startedAt).getTime()
              : null,
          }));

          // Check for active batch downloads
          let batchDownload: {
            batchName: string;
            phase: number;
            bytesDownloaded: number;
            elapsedMs: number;
          } | null = null;

          if (currentStep === 'images_batch1' || currentStep === 'images_batch2' || video.status.startsWith('images_batch')) {
            const batchJobs = await getBatchJobsByVideoId(video.id);
            for (const job of batchJobs) {
              if (job.status === 'running' || job.status === 'pending') {
                const dl = getDownloadProgress(job.batchName);
                if (dl) {
                  batchDownload = {
                    batchName: job.batchName,
                    phase: job.phase,
                    bytesDownloaded: dl.bytesDownloaded,
                    elapsedMs: Date.now() - dl.startedAt,
                  };
                  break;
                }
              }
            }
          }

          // Load batch phase summaries for completed phases
          let batchSummary: { phase1?: Record<string, unknown>; phase2?: Record<string, unknown> } | null = null;
          const p1 = await loadJson<Record<string, unknown>>(id, 'batch_phase1_summary.json');
          const p2 = await loadJson<Record<string, unknown>>(id, 'batch_phase2_summary.json');
          if (p1 || p2) {
            batchSummary = {};
            if (p1) batchSummary.phase1 = p1;
            if (p2) batchSummary.phase2 = p2;
          }

          if (!sendEvent({
            videoId: video.id,
            title: video.title,
            status: video.status,
            currentStep,
            progress,
            steps,
            batchDownload,
            batchSummary,
          })) {
            return false;
          }

          // Close stream if job is in a terminal or paused state
          if (['done', 'failed', 'review'].includes(video.status)) {
            closeStream();
            return false;
          }

          return true;
        } catch (error) {
          console.error('SSE poll error:', error);
          // Don't try to send error if already closed
          if (!isClosed) {
            sendEvent({ error: error instanceof Error ? error.message : 'Unknown error' });
          }
          return !isClosed; // Keep trying only if not closed
        }
      };

      // Clean up on abort
      request.signal.addEventListener('abort', () => {
        closeStream();
      });

      // Initial poll
      const shouldContinue = await poll();

      // Poll every 1 second if initial poll succeeded
      if (shouldContinue && !isClosed) {
        interval = setInterval(async () => {
          const continuePolling = await poll();
          if (!continuePolling) {
            cleanup();
          }
        }, 1000);
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
