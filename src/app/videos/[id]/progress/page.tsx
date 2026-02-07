'use client';

import { use } from 'react';
import Link from 'next/link';
import { CircularProgress } from '@/components/ui/CircularProgress';
import { useJobProgress } from '@/hooks/useJobProgress';

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
