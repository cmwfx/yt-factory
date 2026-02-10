'use client';

import { use } from 'react';
import Link from 'next/link';
import { CircularProgress } from '@/components/ui/CircularProgress';
import { useJobProgress, type BatchPhaseSummary } from '@/hooks/useJobProgress';

interface PageProps {
  params: Promise<{ id: string }>;
}

const STEP_LABELS: Record<string, string> = {
  ideas: 'Generating Ideas',
  pick_idea: 'Picking Idea',
  scripting: 'Writing Script',
  scenes: 'Parsing Scenes',
  images: 'Generating Images',
  images_batch1: 'Image Batch Phase 1',
  images_batch2: 'Image Batch Phase 2',
  audio: 'Generating Audio',
  transcribe: 'Transcribing Audio',
  align: 'Aligning Scenes',
  review: 'Manual Review',
  render: 'Rendering Video',
};

const STEP_DESCRIPTIONS: Record<string, string> = {
  scripting: 'Crafting your video script with AI...',
  scenes: 'Breaking the script into visual scenes...',
  images: 'Submitting image generation batch...',
  images_batch1: 'Generating images (Phase 1)... waiting for batch',
  images_batch2: 'Generating images (Phase 2)... waiting for batch',
  audio: 'Recording AI voiceover narration...',
  transcribe: 'Transcribing audio for sync...',
  align: 'Syncing visuals to audio timing...',
  review: 'Waiting for manual review and approval...',
  render: 'Assembling the final video...',
};

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

function formatSpeed(bytesPerSec: number): string {
  if (bytesPerSec < 1024) return `${bytesPerSec.toFixed(0)} B/s`;
  if (bytesPerSec < 1024 * 1024) return `${(bytesPerSec / 1024).toFixed(0)} KB/s`;
  return `${(bytesPerSec / 1024 / 1024).toFixed(1)} MB/s`;
}

export default function ProgressPage({ params }: PageProps) {
  const { id } = use(params);
  const { progress, isConnected } = useJobProgress(id);

  const isDone = progress?.status === 'done';
  const isFailed = progress?.status === 'failed';
  const isReview = progress?.status === 'review';
  const isRunning = progress && !isDone && !isFailed && !isReview;

  const handleRetry = async () => {
    const failedStep = progress?.steps.find(s => s.status === 'failed');
    if (!failedStep) return;
    try {
      const res = await fetch('/api/jobs/retry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoId: id, fromStep: failedStep.step }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to retry');
      }
      // Page will auto-update via SSE reconnect
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to retry');
    }
  };

  return (
    <div className="min-h-screen bg-[#09090b] flex flex-col">
      {/* Subtle background orbs */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/3 w-72 h-72 rounded-full opacity-8 blur-3xl" style={{ background: '#8b5cf6' }} />
        <div className="absolute bottom-1/3 right-1/4 w-56 h-56 rounded-full opacity-6 blur-3xl" style={{ background: '#6366f1' }} />
      </div>

      {/* Top bar */}
      <header className="relative z-10 flex items-center justify-between px-8 py-4 border-b border-zinc-800">
        <Link href="/" className="inline-flex items-center gap-2 text-zinc-400 hover:text-white transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Dashboard
        </Link>

        <div className="flex items-center gap-3">
          {progress?.title && (
            <span className="text-white font-medium text-sm">{progress.title}</span>
          )}
          <div className="flex items-center gap-1.5">
            <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-600'}`} />
            <span className="text-xs text-zinc-500">{isConnected ? 'Live' : 'Offline'}</span>
          </div>
        </div>
      </header>

      {/* Main content */}
      <div className="flex-1 flex flex-col items-center justify-center relative z-10 px-8 py-12">
        {/* Loading state */}
        {!progress && (
          <div className="flex flex-col items-center gap-4">
            <svg className="animate-spin w-10 h-10 text-indigo-400" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            <p className="text-zinc-400">Connecting to job...</p>
          </div>
        )}

        {progress && (
          <div className="w-full max-w-2xl flex flex-col items-center gap-10">
            {/* Circular progress */}
            <CircularProgress value={progress.progress} size={200} />

            {/* Current step info */}
            <div className="text-center">
              <h2 className="text-2xl font-bold text-white">
                {isDone
                  ? 'Video Complete!'
                  : isFailed
                  ? 'Video Failed'
                  : isReview
                  ? 'Ready for Manual Review'
                  : progress.currentStep
                  ? STEP_LABELS[progress.currentStep] || progress.currentStep
                  : 'Starting...'}
              </h2>
              <p className="text-zinc-500 mt-1">
                {isDone
                  ? 'Your video has been generated successfully.'
                  : isFailed
                  ? 'An error occurred during generation.'
                  : isReview
                  ? 'The video has been aligned and is ready for your review.'
                  : progress.currentStep
                  ? STEP_DESCRIPTIONS[progress.currentStep] || ''
                  : 'Waiting for the pipeline to begin...'}
              </p>
            </div>

            {/* Batch download progress */}
            {progress.batchDownload && (
              <div className="w-full bg-[#18181b] border border-indigo-600/30 rounded-xl p-5">
                <div className="flex items-center gap-2 mb-3">
                  <svg className="w-4 h-4 text-indigo-400 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  <span className="text-sm font-medium text-white">
                    Downloading Batch Phase {progress.batchDownload.phase}
                  </span>
                </div>

                {/* Download stats */}
                <div className="grid grid-cols-3 gap-4 mb-3">
                  <div>
                    <div className="text-xs text-zinc-500">Downloaded</div>
                    <div className="text-lg font-semibold text-white">
                      {formatBytes(progress.batchDownload.bytesDownloaded)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-zinc-500">Speed</div>
                    <div className="text-lg font-semibold text-white">
                      {progress.batchDownload.elapsedMs > 0
                        ? formatSpeed((progress.batchDownload.bytesDownloaded / progress.batchDownload.elapsedMs) * 1000)
                        : '...'}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-zinc-500">Elapsed</div>
                    <div className="text-lg font-semibold text-white">
                      {formatDuration(progress.batchDownload.elapsedMs)}
                    </div>
                  </div>
                </div>

                {/* Progress bar (indeterminate since we don't know total size) */}
                <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full animate-pulse"
                    style={{ width: '100%', opacity: 0.6 }}
                  />
                </div>
                <p className="text-xs text-zinc-500 mt-2">
                  Streaming batch results from Google API...
                </p>
              </div>
            )}

            {/* Batch retry summary */}
            {progress.batchSummary && (() => {
              const phases = [progress.batchSummary!.phase1, progress.batchSummary!.phase2].filter(
                (p): p is BatchPhaseSummary => !!p && p.retriedDirectly > 0
              );
              if (phases.length === 0) return null;
              const allRetriesOk = phases.every(p => p.retriedSucceeded === p.retriedDirectly);
              return (
                <div className={`w-full bg-[#18181b] border rounded-xl p-5 ${allRetriesOk ? 'border-emerald-600/30' : 'border-amber-600/30'}`}>
                  <div className="flex items-center gap-2 mb-3">
                    <svg className={`w-4 h-4 ${allRetriesOk ? 'text-emerald-400' : 'text-amber-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    <span className="text-sm font-medium text-white">Batch Image Summary</span>
                  </div>
                  <div className="space-y-1.5">
                    {phases.map(p => (
                      <div key={p.phase} className="flex items-center gap-2 text-sm">
                        <span className="text-zinc-400">Phase {p.phase}:</span>
                        <span className="text-white">{p.batchSucceeded} from batch</span>
                        <span className="text-zinc-600">·</span>
                        <span className={allRetriesOk ? 'text-emerald-400' : 'text-amber-400'}>
                          {p.retriedSucceeded}/{p.retriedDirectly} regenerated directly
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* Step pipeline list */}
            <div className="w-full space-y-1.5">
              {progress.steps.map((step) => {
                const isStepRunning = step.status === 'running';
                const isStepDone = step.status === 'success';
                const isStepFailed = step.status === 'failed';
                const isStepActive = isStepRunning;

                return (
                  <div
                    key={step.step}
                    className={`flex items-center gap-3 px-4 py-2.5 rounded-lg transition-colors duration-300 ${
                      isStepActive
                        ? 'bg-indigo-500/10 border border-indigo-600/40'
                        : 'border border-transparent'
                    }`}
                  >
                    {/* Status indicator */}
                    <div
                      className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${
                        isStepDone
                          ? 'bg-emerald-500/20'
                          : isStepFailed
                          ? 'bg-red-500/20'
                          : isStepRunning
                          ? 'bg-indigo-500/20 animate-pulse-ring'
                          : 'bg-[#27272a]'
                      }`}
                    >
                      {isStepDone ? (
                        <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      ) : isStepFailed ? (
                        <svg className="w-3.5 h-3.5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      ) : isStepRunning ? (
                        <svg className="animate-spin w-3.5 h-3.5 text-indigo-400" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                      ) : (
                        <div className="w-2 h-2 rounded-full bg-zinc-600" />
                      )}
                    </div>

                    {/* Label */}
                    <span
                      className={`text-sm flex-1 ${
                        isStepRunning
                          ? 'text-white font-medium'
                          : isStepDone
                          ? 'text-zinc-400'
                          : isStepFailed
                          ? 'text-red-400'
                          : 'text-zinc-500'
                      }`}
                    >
                      {STEP_LABELS[step.step] || step.step}
                    </span>

                    {/* Description for active step */}
                    {isStepActive && STEP_DESCRIPTIONS[step.step] && (
                      <span className="text-xs text-indigo-400/70">{STEP_DESCRIPTIONS[step.step]}</span>
                    )}

                    {/* Duration badge */}
                    {step.durationMs && (
                      <span className="text-xs text-zinc-600 bg-[#27272a] px-2 py-0.5 rounded-full">
                        {formatDuration(step.durationMs)}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Bottom bar */}
      <footer className="relative z-10 border-t border-zinc-800 px-8 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-400' : 'bg-zinc-600'}`} />
          <span className="text-xs text-zinc-500">
            {isConnected ? 'Live updates enabled' : 'Disconnected'}
          </span>
        </div>

        <div className="flex items-center gap-3">
          {isDone && (
            <Link href={`/videos/${id}`}>
              <button className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition-colors">
                View Video Details
              </button>
            </Link>
          )}
          {isReview && (
            <Link href={`/videos/${id}/review`}>
              <button className="px-5 py-2 bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 text-white text-sm font-medium rounded-lg transition-all shadow-lg shadow-indigo-500/50">
                Start Review
              </button>
            </Link>
          )}
          {isFailed && (
            <button
              onClick={handleRetry}
              className="px-5 py-2 bg-red-600 hover:bg-red-500 text-white text-sm font-medium rounded-lg transition-colors"
            >
              Retry
            </button>
          )}
          {isRunning && (
            <Link href="/">
              <button className="px-4 py-2 text-zinc-400 hover:text-white text-sm font-medium rounded-lg hover:bg-[#27272a] transition-colors">
                Back to Dashboard
              </button>
            </Link>
          )}
        </div>
      </footer>
    </div>
  );
}
