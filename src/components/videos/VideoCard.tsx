'use client';

import Link from 'next/link';
import { Badge, getStatusBadgeVariant, Button, Card, ProgressBar } from '@/components/ui';
import type { VideoSummary } from '@/hooks/useVideos';

interface VideoCardProps {
  video: VideoSummary;
  onDelete: (video: VideoSummary) => void;
}

export function VideoCard({ video, onDelete }: VideoCardProps) {
  const progress = video.stepCount > 0
    ? Math.round((video.completedSteps / video.stepCount) * 100)
    : 0;

  const isInProgress = !['done', 'failed', 'queued'].includes(video.status);

  return (
    <Card className="flex flex-col h-full">
      <div className="flex items-start justify-between gap-2 mb-3">
        <Link href={`/videos/${video.id}`} className="hover:underline">
          <h3 className="text-lg font-medium text-white line-clamp-2">{video.title}</h3>
        </Link>
        <Badge variant={getStatusBadgeVariant(video.status)}>
          {video.status}
        </Badge>
      </div>

      {video.ideaTitle && (
        <p className="text-zinc-500 text-sm mb-2">
          From: {video.ideaTitle}
        </p>
      )}

      {/* Progress */}
      <div className="mb-4">
        <div className="flex items-center justify-between text-xs text-zinc-400 mb-1">
          <span>Steps: {video.completedSteps}/{video.stepCount}</span>
          <span>{progress}%</span>
        </div>
        <ProgressBar
          progress={progress}
          size="sm"
          variant={video.status === 'failed' ? 'error' : video.status === 'done' ? 'success' : 'default'}
          animated={isInProgress}
        />
      </div>

      <div className="flex items-center justify-between pt-3 border-t border-zinc-700 mt-auto">
        <span className="text-xs text-zinc-500">
          {new Date(video.createdAt).toLocaleDateString()}
        </span>
        <div className="flex gap-2">
          <Link href={`/videos/${video.id}`}>
            <Button variant="ghost" size="sm">
              View
            </Button>
          </Link>
          {video.hasVideo && (
            <Link href={`/api/videos/${video.id}/download`} target="_blank">
              <Button variant="ghost" size="sm">
                Download
              </Button>
            </Link>
          )}
          <Button variant="ghost" size="sm" onClick={() => onDelete(video)}>
            Delete
          </Button>
        </div>
      </div>
    </Card>
  );
}
