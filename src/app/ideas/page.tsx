'use client';

import { useState, useMemo } from 'react';
import { Button, Input, Card, Badge } from '@/components/ui';
import { IdeaList, IdeaForm } from '@/components/ideas';
import { useIdeas, Idea } from '@/hooks/useIdeas';
import { useChannel } from '@/contexts/ChannelContext';

type FilterType = 'all' | 'unused' | 'used';

export default function IdeasPage() {
  const { activeChannel } = useChannel();
  const [filter, setFilter] = useState<FilterType>('all');
  const [search, setSearch] = useState('');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingIdea, setEditingIdea] = useState<Idea | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<Idea | null>(null);
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const { ideas, total, unused, loading, error, refetch, createIdea, updateIdea, deleteIdea, deleteIdeas } = useIdeas(
    filter === 'all' ? undefined : filter,
    activeChannel?.id
  );

  const filteredIdeas = useMemo(() => {
    if (!search.trim()) return ideas;
    const searchLower = search.toLowerCase();
    return ideas.filter(
      (idea) =>
        idea.title.toLowerCase().includes(searchLower) ||
        idea.description.toLowerCase().includes(searchLower)
    );
  }, [ideas, search]);

  const handleCreate = async (title: string, description: string) => {
    await createIdea(title, description);
  };

  const handleUpdate = async (title: string, description: string) => {
    if (!editingIdea) return;
    await updateIdea(editingIdea.id, { title, description });
    setEditingIdea(null);
  };

  const handleDelete = async () => {
    if (!deleteConfirm || deleting) return;
    try {
      setDeleting(true);
      await deleteIdea(deleteConfirm.id);
      setDeleteConfirm(null);
    } catch (err) {
      console.error('Failed to delete idea:', err);
      alert(err instanceof Error ? err.message : 'Failed to delete idea');
    } finally {
      setDeleting(false);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0 || deleting) return;
    try {
      setDeleting(true);
      await deleteIdeas(Array.from(selectedIds));
      setSelectedIds(new Set());
      setBulkDeleteConfirm(false);
    } catch (err) {
      console.error('Failed to delete ideas:', err);
      alert(err instanceof Error ? err.message : 'Failed to delete ideas');
    } finally {
      setDeleting(false);
    }
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredIdeas.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredIdeas.map(i => i.id)));
    }
  };

  const toggleSelect = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const handleGenerateIdeas = async () => {
    try {
      setGenerating(true);
      const res = await fetch('/api/ideas/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ count: 10, channelId: activeChannel?.id }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to generate ideas');
      }

      await refetch();
    } catch (err) {
      console.error('Failed to generate ideas:', err);
      alert(err instanceof Error ? err.message : 'Failed to generate ideas');
    } finally {
      setGenerating(false);
    }
  };

  const filterOptions: { value: FilterType; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'unused', label: 'Unused' },
    { value: 'used', label: 'Used' },
  ];

  return (
    <div className="min-h-screen bg-zinc-900 text-white p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold mb-1">Video Ideas</h1>
            <p className="text-zinc-400">
              {total} ideas total, {unused} unused
            </p>
          </div>
          <div className="flex gap-3">
            <Button variant="secondary" onClick={handleGenerateIdeas} loading={generating}>
              Generate Ideas
            </Button>
            <Button onClick={() => setIsFormOpen(true)}>
              Add Idea
            </Button>
          </div>
        </div>

        {/* Filters and Search */}
        <Card className="mb-6">
          <div className="flex flex-col md:flex-row gap-4">
            {/* Filter Tabs */}
            <div className="flex gap-1 p-1 bg-zinc-900 rounded-lg">
              {filterOptions.map((option) => (
                <button
                  key={option.value}
                  onClick={() => setFilter(option.value)}
                  className={`
                    px-4 py-2 rounded-md text-sm font-medium transition-colors
                    ${filter === option.value
                      ? 'bg-zinc-700 text-white'
                      : 'text-zinc-400 hover:text-white'
                    }
                  `}
                >
                  {option.label}
                </button>
              ))}
            </div>

            {/* Search */}
            <div className="flex-1">
              <Input
                placeholder="Search ideas..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full"
              />
            </div>
          </div>
        </Card>

        {/* Selection Controls */}
        {filteredIdeas.length > 0 && (
          <div className="flex items-center gap-4 mb-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={selectedIds.size === filteredIdeas.length && filteredIdeas.length > 0}
                onChange={toggleSelectAll}
                className="w-4 h-4 rounded border-zinc-600 bg-zinc-800 text-blue-500 focus:ring-blue-500 focus:ring-offset-zinc-900"
              />
              <span className="text-sm text-zinc-400">
                Select All ({filteredIdeas.length})
              </span>
            </label>
            {selectedIds.size > 0 && (
              <>
                <span className="text-sm text-zinc-500">
                  {selectedIds.size} selected
                </span>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => setBulkDeleteConfirm(true)}
                >
                  Delete Selected
                </Button>
              </>
            )}
          </div>
        )}

        {/* Error State */}
        {error && (
          <Card className="mb-6 border-red-600/50">
            <div className="flex items-center gap-3">
              <Badge variant="error">Error</Badge>
              <span className="text-red-400">{error}</span>
              <Button variant="ghost" size="sm" onClick={refetch}>
                Retry
              </Button>
            </div>
          </Card>
        )}

        {/* Ideas List */}
        <IdeaList
          ideas={filteredIdeas}
          loading={loading}
          onEdit={(idea) => setEditingIdea(idea)}
          onDelete={(idea) => setDeleteConfirm(idea)}
          selectedIds={selectedIds}
          onToggleSelect={toggleSelect}
        />

        {/* Add/Edit Form Modal */}
        <IdeaForm
          isOpen={isFormOpen || !!editingIdea}
          onClose={() => {
            setIsFormOpen(false);
            setEditingIdea(null);
          }}
          onSubmit={editingIdea ? handleUpdate : handleCreate}
          idea={editingIdea}
        />

        {/* Delete Confirmation Modal */}
        {deleteConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div
              className="absolute inset-0 bg-black/70 backdrop-blur-sm"
              onClick={() => !deleting && setDeleteConfirm(null)}
            />
            <Card className="relative max-w-md w-full">
              <h3 className="text-lg font-semibold mb-4">Delete Idea</h3>
              <p className="text-zinc-400 mb-6">
                Are you sure you want to delete &quot;{deleteConfirm.title}&quot;? This action cannot be undone.
              </p>
              <div className="flex justify-end gap-3">
                <Button variant="ghost" onClick={() => setDeleteConfirm(null)} disabled={deleting}>
                  Cancel
                </Button>
                <Button variant="danger" onClick={handleDelete} loading={deleting}>
                  Delete
                </Button>
              </div>
            </Card>
          </div>
        )}

        {/* Bulk Delete Confirmation Modal */}
        {bulkDeleteConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div
              className="absolute inset-0 bg-black/70 backdrop-blur-sm"
              onClick={() => !deleting && setBulkDeleteConfirm(false)}
            />
            <Card className="relative max-w-md w-full">
              <h3 className="text-lg font-semibold mb-4">Delete {selectedIds.size} Ideas</h3>
              <p className="text-zinc-400 mb-6">
                Are you sure you want to delete {selectedIds.size} selected ideas? This action cannot be undone.
              </p>
              <div className="flex justify-end gap-3">
                <Button variant="ghost" onClick={() => setBulkDeleteConfirm(false)} disabled={deleting}>
                  Cancel
                </Button>
                <Button variant="danger" onClick={handleBulkDelete} loading={deleting}>
                  Delete {selectedIds.size} Ideas
                </Button>
              </div>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
