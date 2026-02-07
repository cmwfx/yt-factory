/* eslint-disable react-hooks/set-state-in-effect */
'use client';

import { useEffect, useState, useRef } from 'react';
import { Card, ProgressBar, Badge, getStatusBadgeVariant, Spinner } from '@/components/ui';
import { useJobProgress, StepProgress } from '@/hooks/useJobProgress';

interface JobProgressProps {
  videoId: string | null;
  onComplete?: (status: 'done' | 'failed') => void;
}

const STEP_LABELS: Record<string, string> = {
  ideas: 'Generating Ideas',
  pick_idea: 'Picking Idea',
  scripting: 'Writing Script',
  scenes: 'Parsing Scenes',
  images: 'Generating Images',
  audio: 'Generating Audio',
  transcribe: 'Transcribing Audio',
  align: 'Aligning Scenes',
  render: 'Rendering Video',
};

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
}

function useElapsedTime(isActive: boolean) {
  const [elapsedTime, setElapsedTime] = useState(0);
  const startTimeRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isActive) {
      setElapsedTime(0);
      startTimeRef.current = null;
      return;
    }

    // Set start time when becoming active
    startTimeRef.current = Date.now();

    const interval = setInterval(() => {
      if (startTimeRef.current) {
        setElapsedTime(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [isActive]);

  return elapsedTime;
}

export function JobProgress({ videoId, onComplete }: JobProgressProps) {
  const { progress, error, isConnected } = useJobProgress(videoId);
  const elapsedTime = useElapsedTime(!!videoId);

  // Notify on completion
  useEffect(() => {
    if (progress && (progress.status === 'done' || progress.status === 'failed')) {
      onComplete?.(progress.status as 'done' | 'failed');
    }
  }, [progress, onComplete]);

  if (!videoId) {
    return null;
  }

  if (error) {
    return (
      <Card className="border-red-600/30">
        <div className="flex items-center gap-3">
          <Badge variant="error">Error</Badge>
          <span className="text-red-400">{error}</span>
        </div>
      </Card>
    );
  }

  if (!progress) {
    return (
      <Card>
        <div className="flex items-center gap-3">
          <Spinner size="sm" />
          <span className="text-zinc-400">Connecting to job...</span>
        </div>
      </Card>
    );
  }

  const isDone = progress.status === 'done';
  const isFailed = progress.status === 'failed';
  const isRunning = !isDone && !isFailed;

  return (
    <Card>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          {isRunning && <Spinner size="sm" />}
          <div>
            <h3 className="font-medium text-white">{progress.title}</h3>
            <p className="text-sm text-zinc-400">
              {progress.currentStep
                ? STEP_LABELS[progress.currentStep] || progress.currentStep
                : isDone
                ? 'Completed'
                : 'Waiting...'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant={getStatusBadgeVariant(progress.status)}>
            {progress.status}
          </Badge>
          <span className="text-sm text-zinc-500">{formatTime(elapsedTime)}</span>
        </div>
      </div>

      {/* Progress bar */}
      <ProgressBar
        progress={progress.progress}
        size="md"
        showLabel
        variant={isFailed ? 'error' : isDone ? 'success' : 'default'}
        animated={isRunning}
      />

      {/* Step list */}
      <div className="mt-4 space-y-2">
        {progress.steps.map((step) => (
          <StepRow key={step.step} step={step} />
        ))}
      </div>

      {/* Connection status */}
      <div className="mt-4 pt-3 border-t border-zinc-700 flex items-center gap-2">
        <div
          className={`w-2 h-2 rounded-full ${
            isConnected ? 'bg-green-500' : 'bg-zinc-500'
          }`}
        />
        <span className="text-xs text-zinc-500">
          {isConnected ? 'Live updates' : 'Disconnected'}
        </span>
      </div>
    </Card>
  );
}

function StepRow({ step }: { step: StepProgress }) {
  const isRunning = step.status === 'running';
  const isSuccess = step.status === 'success';
  const isFailed = step.status === 'failed';

  return (
    <div className="flex items-center justify-between py-1.5">
      <div className="flex items-center gap-2">
        {isRunning ? (
          <Spinner size="sm" className="text-blue-400" />
        ) : isSuccess ? (
          <svg className="w-4 h-4 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        ) : isFailed ? (
          <svg className="w-4 h-4 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : (
          <div className="w-4 h-4 rounded-full border border-zinc-600" />
        )}
        <span
          className={`text-sm ${
            isRunning ? 'text-white' : isSuccess || isFailed ? 'text-zinc-400' : 'text-zinc-500'
          }`}
        >
          {STEP_LABELS[step.step] || step.step}
        </span>
      </div>

      {step.durationMs && (
        <span className="text-xs text-zinc-500">
          {(step.durationMs / 1000).toFixed(1)}s
        </span>
      )}
    </div>
  );
}
