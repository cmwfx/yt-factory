'use client';

import { Badge, Button, Card } from '@/components/ui';
import type { Idea } from '@/hooks/useIdeas';

interface IdeaCardProps {
  idea: Idea;
  onEdit: (idea: Idea) => void;
  onDelete: (idea: Idea) => void;
  isSelected?: boolean;
  onToggleSelect?: (id: string) => void;
}

export function IdeaCard({ idea, onEdit, onDelete, isSelected, onToggleSelect }: IdeaCardProps) {
  return (
    <Card className={`flex flex-col h-full ${isSelected ? 'ring-2 ring-blue-500' : ''}`}>
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex items-start gap-2 flex-1 min-w-0">
          {onToggleSelect && (
            <input
              type="checkbox"
              checked={isSelected}
              onChange={() => onToggleSelect(idea.id)}
              className="mt-1 w-4 h-4 rounded border-zinc-600 bg-zinc-800 text-blue-500 focus:ring-blue-500 focus:ring-offset-zinc-900 flex-shrink-0"
            />
          )}
          <h3 className="text-lg font-medium text-white line-clamp-2">{idea.title}</h3>
        </div>
        <Badge variant={idea.used ? 'neutral' : 'success'}>
          {idea.used ? 'Used' : 'Unused'}
        </Badge>
      </div>

      <p className="text-zinc-400 text-sm flex-1 line-clamp-3 mb-4">
        {idea.description}
      </p>

      {idea.videos && idea.videos.length > 0 && (
        <div className="mb-4">
          <p className="text-xs text-zinc-500 mb-1">Videos ({idea.videos.length})</p>
          <div className="flex flex-wrap gap-1">
            {idea.videos.slice(0, 2).map((video) => (
              <Badge key={video.id} variant="info">
                {video.status}
              </Badge>
            ))}
            {idea.videos.length > 2 && (
              <Badge variant="neutral">+{idea.videos.length - 2}</Badge>
            )}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between pt-3 border-t border-zinc-700">
        <span className="text-xs text-zinc-500">
          {new Date(idea.createdAt).toLocaleDateString()}
        </span>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={() => onEdit(idea)}>
            Edit
          </Button>
          <Button variant="ghost" size="sm" onClick={() => onDelete(idea)}>
            Delete
          </Button>
        </div>
      </div>
    </Card>
  );
}
