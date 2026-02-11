'use client';

import { useState, useEffect, useCallback } from 'react';

export interface Idea {
  id: string;
  title: string;
  description: string;
  used: boolean;
  createdAt: string;
  videos?: { id: string; title: string; status: string }[];
}

export interface UseIdeasResult {
  ideas: Idea[];
  total: number;
  unused: number;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  createIdea: (title: string, description: string) => Promise<Idea>;
  updateIdea: (id: string, data: { title?: string; description?: string }) => Promise<Idea>;
  deleteIdea: (id: string) => Promise<void>;
  deleteIdeas: (ids: string[]) => Promise<number>;
}

export function useIdeas(filter?: 'all' | 'used' | 'unused', channelId?: string): UseIdeasResult {
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [total, setTotal] = useState(0);
  const [unused, setUnused] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchIdeas = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      if (filter === 'used') params.set('used', 'true');
      if (filter === 'unused') params.set('used', 'false');
      if (channelId) params.set('channelId', channelId);

      const url = `/api/ideas${params.toString() ? `?${params}` : ''}`;
      const res = await fetch(url);

      if (!res.ok) {
        throw new Error('Failed to fetch ideas');
      }

      const data = await res.json();
      setIdeas(data.ideas);
      setTotal(data.total);
      setUnused(data.unused);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [filter, channelId]);

  useEffect(() => {
    fetchIdeas();
  }, [fetchIdeas]);

  const createIdeaFn = async (title: string, description: string): Promise<Idea> => {
    const res = await fetch('/api/ideas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, description }),
    });

    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'Failed to create idea');
    }

    const data = await res.json();
    await fetchIdeas();
    return data.idea;
  };

  const updateIdeaFn = async (
    id: string,
    updates: { title?: string; description?: string }
  ): Promise<Idea> => {
    const res = await fetch(`/api/ideas/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });

    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'Failed to update idea');
    }

    const data = await res.json();
    await fetchIdeas();
    return data.idea;
  };

  const deleteIdeaFn = async (id: string): Promise<void> => {
    const res = await fetch(`/api/ideas/${id}`, {
      method: 'DELETE',
    });

    if (!res.ok) {
      const data = await res.json();
      // Ignore "not found" errors - idea was already deleted
      if (res.status === 404) {
        await fetchIdeas();
        return;
      }
      throw new Error(data.error || 'Failed to delete idea');
    }

    await fetchIdeas();
  };

  const deleteIdeasFn = async (ids: string[]): Promise<number> => {
    const res = await fetch('/api/ideas', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    });

    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'Failed to delete ideas');
    }

    const data = await res.json();
    await fetchIdeas();
    return data.deletedCount;
  };

  return {
    ideas,
    total,
    unused,
    loading,
    error,
    refetch: fetchIdeas,
    createIdea: createIdeaFn,
    updateIdea: updateIdeaFn,
    deleteIdea: deleteIdeaFn,
    deleteIdeas: deleteIdeasFn,
  };
}
