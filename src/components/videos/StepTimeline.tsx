'use client';

import { Badge, getStatusBadgeVariant, Spinner } from '@/components/ui';

interface Step {
  id: string;
  step: string;
  status: string;
  error: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  durationMs: number | null;
}

interface StepTimelineProps {
  steps: Step[];
  className?: string;
}

const STEP_LABELS: Record<string, string> = {
  ideas: 'Generate Ideas',
  pick_idea: 'Pick Idea',
  scripting: 'Write Script',
  scenes: 'Parse Scenes',
  images: 'Generate Images',
  audio: 'Generate Audio',
  transcribe: 'Transcribe Audio',
  align: 'Align Scenes',
  render: 'Render Video',
};

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
}

export function StepTimeline({ steps, className = '' }: StepTimelineProps) {
  return (
    <div className={`space-y-3 ${className}`}>
      {steps.map((step, index) => {
        const isLast = index === steps.length - 1;
        const isRunning = step.status === 'running';
        const isSuccess = step.status === 'success';
        const isFailed = step.status === 'failed';
        const isPending = step.status === 'pending';

        return (
          <div key={step.id} className="flex gap-3">
            {/* Timeline indicator */}
            <div className="flex flex-col items-center">
              <div
                className={`
                  w-8 h-8 rounded-full flex items-center justify-center
                  ${isSuccess ? 'bg-green-600/20 text-green-400' : ''}
                  ${isFailed ? 'bg-red-600/20 text-red-400' : ''}
                  ${isRunning ? 'bg-blue-600/20 text-blue-400' : ''}
                  ${isPending ? 'bg-zinc-700 text-zinc-500' : ''}
                `}
              >
                {isRunning ? (
                  <Spinner size="sm" />
                ) : isSuccess ? (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                ) : isFailed ? (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                ) : (
                  <span className="text-xs">{index + 1}</span>
                )}
              </div>
              {!isLast && (
                <div
                  className={`w-0.5 flex-1 min-h-[20px] ${
                    isSuccess ? 'bg-green-600/30' : 'bg-zinc-700'
                  }`}
                />
              )}
            </div>

            {/* Step content */}
            <div className="flex-1 pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-white">
                    {STEP_LABELS[step.step] || step.step}
                  </span>
                  <Badge variant={getStatusBadgeVariant(step.status)}>
                    {step.status}
                  </Badge>
                </div>
                {step.durationMs && (
                  <span className="text-sm text-zinc-500">
                    {formatDuration(step.durationMs)}
                  </span>
                )}
              </div>

              {step.error && (
                <div className="mt-2 p-2 bg-red-900/20 border border-red-700/30 rounded text-sm text-red-400">
                  {step.error}
                </div>
              )}

              {step.startedAt && (
                <div className="mt-1 text-xs text-zinc-500">
                  Started: {new Date(step.startedAt).toLocaleString()}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
