/* eslint-disable react-hooks/set-state-in-effect */
'use client';

import { useState, useEffect, useRef } from 'react';

export interface StepProgress {
  step: string;
  status: string;
  error: string | null;
  durationMs: number | null;
}

export interface JobProgress {
  videoId: string;
  title: string;
  status: string;
  currentStep: string | null;
  progress: number;
  steps: StepProgress[];
}

export interface UseJobProgressResult {
  progress: JobProgress | null;
  error: string | null;
  isConnected: boolean;
}

export function useJobProgress(videoId: string | null): UseJobProgressResult {
  const [state, setState] = useState<{
    progress: JobProgress | null;
    error: string | null;
    isConnected: boolean;
  }>({
    progress: null,
    error: null,
    isConnected: false,
  });

  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!videoId) {
      setState({ progress: null, error: null, isConnected: false });
      return;
    }

    // Close existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const eventSource = new EventSource(`/api/jobs/${videoId}/progress`);
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      setState(prev => ({ ...prev, isConnected: true, error: null }));
    };

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.error) {
          setState(prev => ({ ...prev, error: data.error }));
          return;
        }

        setState(prev => ({ ...prev, progress: data, error: null }));

        // Close connection if job is complete
        if (data.status === 'done' || data.status === 'failed') {
          eventSource.close();
          setState(prev => ({ ...prev, isConnected: false }));
        }
      } catch (err) {
        console.error('Failed to parse SSE message:', err);
      }
    };

    eventSource.onerror = () => {
      setState(prev => ({ ...prev, isConnected: false }));
    };

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, [videoId]);

  return state;
}
