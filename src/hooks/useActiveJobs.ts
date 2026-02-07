'use client';

import { useState, useEffect, useCallback } from 'react';

export interface ActiveJob {
  id: string;
  title: string;
  status: string;
  currentStep: string | null;
  progress: number;
}

const TERMINAL_STATUSES = ['done', 'failed', 'queued'];
const POLL_INTERVAL_MS = 5000;

export function useActiveJobs(): ActiveJob[] {
  const [activeJobs, setActiveJobs] = useState<ActiveJob[]>([]);

  const fetchJobs = useCallback(async () => {
    try {
      const res = await fetch('/api/videos');
      if (!res.ok) return;
      const data = await res.json();

      const videos: Array<{
        id: string;
        title: string;
        status: string;
        completedSteps: number;
        stepCount: number;
      }> = data.videos || [];

      const active = videos
        .filter((v) => !TERMINAL_STATUSES.includes(v.status))
        .map((v) => ({
          id: v.id,
          title: v.title,
          status: v.status,
          currentStep: v.status !== 'queued' ? v.status : null,
          progress: v.stepCount > 0 ? Math.round((v.completedSteps / v.stepCount) * 100) : 0,
        }));

      setActiveJobs(active);
    } catch {
      // silent — banner just won't show
    }
  }, []);

  useEffect(() => {
    fetchJobs();
    const interval = setInterval(fetchJobs, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchJobs]);

  return activeJobs;
}
