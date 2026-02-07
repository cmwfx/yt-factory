'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button, Card, Badge, getStatusBadgeVariant, ProgressBar } from '@/components/ui';
import { useVideos, VideoSummary } from '@/hooks/useVideos';

type FilterType = 'all' | 'done' | 'failed' | 'in_progress';

export default function HistoryPage() {
  const [filter, setFilter] = useState<FilterType>('all');
  const [deleteConfirm, setDeleteConfirm] = useState<VideoSummary | null>(null);

  const getStatusFilter = () => {
    if (filter === 'in_progress') return undefined;
    if (filter === 'all') return undefined;
    return filter;
  };

  const { videos, statusCounts, total, loading, error, refetch, deleteVideo } = useVideos(
    getStatusFilter()
  );

  const filteredVideos = filter === 'in_progress'
    ? videos.filter(v => !['done', 'failed', 'queued'].includes(v.status))
    : videos;

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    try {
      await deleteVideo(deleteConfirm.id);
      setDeleteConfirm(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete video');
    }
  };

  const filterOptions: { value: FilterType; label: string; count?: number }[] = [
    { value: 'all', label: 'All', count: total },
    { value: 'done', label: 'Done', count: statusCounts.done || 0 },
    { value: 'failed', label: 'Failed', count: statusCounts.failed || 0 },
    {
      value: 'in_progress',
      label: 'In Progress',
      count: Object.entries(statusCounts)
        .filter(([k]) => !['done', 'failed', 'queued'].includes(k))
        .reduce((sum, [, v]) => sum + v, 0),
    },
  ];

  return (
    <div className="min-h-screen p-8 animate-fadeInUp">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold text-white">Video History</h1>
            <p className="text-zinc-400 mt-1">{total} videos generated</p>
          </div>
          <Button variant="secondary" onClick={refetch}>Refresh</Button>
        </div>

        {/* Stat Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {filterOptions.map((option) => (
            <Card
              key={option.value}
              variant="glass"
              padding="sm"
              className={`cursor-pointer transition-all duration-200 hover:scale-[1.02] ${
                filter === option.value ? 'ring-2 ring-indigo-500' : ''
              }`}
              onClick={() => setFilter(option.value)}
            >
              <div className="text-2xl font-bold text-white">{option.count}</div>
              <div className="text-sm text-zinc-400">{option.label}</div>
            </Card>
          ))}
        </div>

        {/* Filter Tabs (pill style) */}
        <div className="mb-6">
          <div className="inline-flex gap-1 p-1 bg-[#18181b] rounded-full border border-zinc-800">
            {filterOptions.map((option) => (
              <button
                key={option.value}
                onClick={() => setFilter(option.value)}
                className={`
                  px-4 py-1.5 rounded-full text-sm font-medium transition-all duration-200
                  ${filter === option.value
                    ? 'bg-white text-[#09090b]'
                    : 'text-zinc-400 hover:text-white'
                  }
                `}
              >
                {option.label}
                {option.count !== undefined && (
                  <span className="ml-1.5 text-xs opacity-60">({option.count})</span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Error */}
        {error && (
          <Card className="mb-6 border-red-600/50">
            <div className="flex items-center gap-3">
              <Badge variant="error">Error</Badge>
              <span className="text-red-400">{error}</span>
              <Button variant="ghost" size="sm" onClick={refetch}>Retry</Button>
            </div>
          </Card>
        )}

        {/* Video List */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <svg className="animate-spin w-8 h-8 text-indigo-400" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          </div>
        ) : filteredVideos.length === 0 ? (
          <Card variant="default" className="text-center py-16">
            <div className="w-14 h-14 mx-auto mb-4 bg-[#27272a] rounded-full flex items-center justify-center">
              <svg className="w-7 h-7 text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-white mb-1">No videos found</h3>
            <p className="text-zinc-400 text-sm">Start a new job from the Dashboard to generate videos.</p>
          </Card>
        ) : (
          <div className="space-y-3">
            {filteredVideos.map((video) => {
              const isInProgress = !['done', 'failed', 'queued'].includes(video.status);
              const progress = video.stepCount > 0
                ? Math.round((video.completedSteps / video.stepCount) * 100)
                : 0;

              return (
                <Card key={video.id} variant="glass" padding="none" className="overflow-hidden">
                  <div className="flex items-center gap-4 p-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Link
                          href={`/videos/${video.id}`}
                          className="text-white font-medium hover:text-indigo-400 transition-colors truncate"
                        >
                          {video.title}
                        </Link>
                        <Badge variant={getStatusBadgeVariant(video.status)}>
                          {video.status}
                        </Badge>
                      </div>
                      {video.ideaTitle && (
                        <p className="text-zinc-500 text-xs">From: {video.ideaTitle}</p>
                      )}
                    </div>

                    {/* Actions column */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {isInProgress && (
                        <Link href={`/videos/${video.id}/progress`}>
                          <Badge variant="active" className="cursor-pointer hover:bg-indigo-500/30 transition-colors">
                            View Progress
                          </Badge>
                        </Link>
                      )}
                      {video.hasVideo && (
                        <Link href={`/api/videos/${video.id}/download`} target="_blank">
                          <Button variant="ghost" size="sm">Download</Button>
                        </Link>
                      )}
                      <Button variant="ghost" size="sm" onClick={() => setDeleteConfirm(video)}>Delete</Button>
                    </div>
                  </div>

                  {/* Progress bar at bottom for in-progress and partially done videos */}
                  {(isInProgress || (video.status === 'failed' && progress > 0)) && (
                    <ProgressBar
                      progress={progress}
                      size="sm"
                      variant={video.status === 'failed' ? 'error' : 'default'}
                    />
                  )}
                  {video.status === 'done' && (
                    <ProgressBar progress={100} size="sm" variant="success" animated={false} />
                  )}
                </Card>
              );
            })}
          </div>
        )}

        {/* Delete Modal */}
        {deleteConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div
              className="absolute inset-0 bg-black/70 backdrop-blur-sm"
              onClick={() => setDeleteConfirm(null)}
            />
            <Card className="relative max-w-md w-full" variant="elevated">
              <h3 className="text-lg font-semibold text-white mb-4">Delete Video</h3>
              <p className="text-zinc-400 mb-2">
                Are you sure you want to delete &quot;{deleteConfirm.title}&quot;?
              </p>
              <p className="text-zinc-500 text-sm mb-6">
                This will also delete all associated files (images, audio, video).
              </p>
              <div className="flex justify-end gap-3">
                <Button variant="ghost" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
                <Button variant="danger" onClick={handleDelete}>Delete</Button>
              </div>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
