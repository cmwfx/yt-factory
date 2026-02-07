'use client';

import { useState, useEffect } from 'react';
import { Button, Input, Textarea, Modal, ModalFooter } from '@/components/ui';
import type { Idea } from '@/hooks/useIdeas';

interface IdeaFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (title: string, description: string) => Promise<void>;
  idea?: Idea | null;
}

export function IdeaForm({ isOpen, onClose, onSubmit, idea }: IdeaFormProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEdit = !!idea;

  useEffect(() => {
    if (idea) {
      setTitle(idea.title);
      setDescription(idea.description);
    } else {
      setTitle('');
      setDescription('');
    }
    setError(null);
  }, [idea, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim() || !description.trim()) {
      setError('Title and description are required');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      await onSubmit(title.trim(), description.trim());
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEdit ? 'Edit Idea' : 'Add New Idea'}
      size="md"
    >
      <form onSubmit={handleSubmit}>
        <div className="space-y-4">
          <Input
            label="Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Enter idea title..."
            disabled={loading}
          />

          <Textarea
            label="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe the video concept, key points to cover..."
            disabled={loading}
          />

          {error && (
            <p className="text-sm text-red-400">{error}</p>
          )}
        </div>

        <ModalFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button type="submit" loading={loading}>
            {isEdit ? 'Save Changes' : 'Add Idea'}
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}
