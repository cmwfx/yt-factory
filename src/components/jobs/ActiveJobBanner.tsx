'use client';

import Link from 'next/link';
import { useActiveJobs } from '@/hooks/useActiveJobs';
import { ProgressBar } from '@/components/ui';

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

export function ActiveJobBanner() {
  const activeJobs = useActiveJobs();

  if (activeJobs.length === 0) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-3 animate-slideInRight">
      {activeJobs.map((job) => (
        <Link
          key={job.id}
          href={`/videos/${job.id}/progress`}
          className="block w-72 bg-[#18181b] border border-zinc-700 rounded-xl p-4 shadow-xl shadow-black/40 hover:border-indigo-600/50 transition-colors"
        >
          <div className="flex items-center gap-3 mb-2.5">
            {/* Spinning loader */}
            <div className="w-8 h-8 rounded-full bg-indigo-500/10 flex items-center justify-center flex-shrink-0">
              <svg className="animate-spin w-4.5 h-4.5 text-indigo-400" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            </div>

            <div className="min-w-0 flex-1">
              <p className="text-white text-sm font-medium truncate">{job.title}</p>
              <p className="text-zinc-500 text-xs">
                {job.currentStep ? STEP_LABELS[job.currentStep] || job.currentStep : 'Starting...'} · {job.progress}%
              </p>
            </div>
          </div>

          <ProgressBar progress={job.progress} size="sm" />
        </Link>
      ))}
    </div>
  );
}
