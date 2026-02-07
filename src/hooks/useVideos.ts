'use client';

import { useState, useEffect, useCallback } from 'react';

export interface VideoSummary {
  id: string;
  title: string;
  status: string;
  ideaTitle: string | null;
  createdAt: string;
  updatedAt: string;
  stepCount: number;
  completedSteps: number;
  hasVideo: boolean;
}

export interface CostBreakdown {
  geminiText: number;
  geminiTTS: number;
  geminiImage: number;
  assemblyAI: number;
  totalCents: number;
}

export interface VideoDetail {
  id: string;
  title: string;
  status: string;
  script: string | null;
  createdAt: string;
  updatedAt: string;
  idea: { id: string; title: string } | null;
  videoPath: string | null;
  totalDurationMs: number;
  clickbaitTitles: string[];
  seoDescription: string | null;
  seoKeywords: string[];
  thumbnailPrompts: string[];
  costCents: number | null;
  costBreakdown: CostBreakdown | null;
  steps: {
    id: string;
    step: string;
    status: string;
    error: string | null;
    startedAt: string | null;
    finishedAt: string | null;
    durationMs: number | null;
  }[];
  assets: {
    id: string;
    type: string;
    filename: string;
    path: string;
    metadata: Record<string, unknown> | null;
  }[];
}

export interface UseVideosResult {
  videos: VideoSummary[];
  statusCounts: Record<string, number>;
  total: number;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  deleteVideo: (id: string) => Promise<void>;
}

export function useVideos(statusFilter?: string): UseVideosResult {
  const [videos, setVideos] = useState<VideoSummary[]>([]);
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchVideos = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      if (statusFilter && statusFilter !== 'all') {
        params.set('status', statusFilter);
      }

      const url = `/api/videos${params.toString() ? `?${params}` : ''}`;
      const res = await fetch(url);

      if (!res.ok) {
        throw new Error('Failed to fetch videos');
      }

      const data = await res.json();
      setVideos(data.videos);
      setStatusCounts(data.statusCounts);
      setTotal(data.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    fetchVideos();
  }, [fetchVideos]);

  const deleteVideoFn = async (id: string): Promise<void> => {
    const res = await fetch(`/api/videos/${id}`, {
      method: 'DELETE',
    });

    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'Failed to delete video');
    }

    await fetchVideos();
  };

  return {
    videos,
    statusCounts,
    total,
    loading,
    error,
    refetch: fetchVideos,
    deleteVideo: deleteVideoFn,
  };
}

export function useVideo(id: string | null) {
  const [video, setVideo] = useState<VideoDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchVideo = useCallback(async () => {
    if (!id) {
      setVideo(null);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const res = await fetch(`/api/videos/${id}`);

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to fetch video');
      }

      const data = await res.json();
      setVideo(data.video);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setVideo(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchVideo();
  }, [fetchVideo]);

  return {
    video,
    loading,
    error,
    refetch: fetchVideo,
  };
}
