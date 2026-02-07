'use client';

import { IdeaCard } from './IdeaCard';
import { Spinner } from '@/components/ui';
import type { Idea } from '@/hooks/useIdeas';

interface IdeaListProps {
  ideas: Idea[];
  loading: boolean;
  onEdit: (idea: Idea) => void;
  onDelete: (idea: Idea) => void;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
}

export function IdeaList({ ideas, loading, onEdit, onDelete, selectedIds, onToggleSelect }: IdeaListProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner size="lg" />
      </div>
    );
  }

  if (ideas.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="w-16 h-16 mx-auto mb-4 bg-zinc-800 rounded-full flex items-center justify-center">
          <svg className="w-8 h-8 text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
        </div>
        <h3 className="text-lg font-medium text-white mb-1">No ideas found</h3>
        <p className="text-zinc-400 text-sm">
          Add your first idea or generate some using AI.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {ideas.map((idea) => (
        <IdeaCard
          key={idea.id}
          idea={idea}
          onEdit={onEdit}
          onDelete={onDelete}
          isSelected={selectedIds?.has(idea.id) ?? false}
          onToggleSelect={onToggleSelect}
        />
      ))}
    </div>
  );
}
