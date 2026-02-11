'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useChannel } from '@/contexts/ChannelContext';

export default function ChannelsPage() {
  const { channels, refreshChannels } = useChannel();
  const [creating, setCreating] = useState(false);
  const [cloneFromId, setCloneFromId] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [newSlug, setNewSlug] = useState('');

  const handleCreate = async () => {
    if (!newName || !newSlug) return;
    setCreating(true);
    try {
      const body: Record<string, string> = { name: newName, slug: newSlug };
      if (cloneFromId) body.cloneFromId = cloneFromId;

      const res = await fetch('/api/channels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        setNewName('');
        setNewSlug('');
        setCloneFromId(null);
        await refreshChannels();
      }
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold text-white">Channels</h1>
      </div>

      {/* Channel Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        {channels.map((ch) => (
          <Link
            key={ch.id}
            href={`/channels/${ch.id}/settings`}
            className="block p-5 rounded-xl bg-[#18181b] border border-zinc-800 hover:border-zinc-600 transition-colors"
          >
            <div className="flex items-center gap-2 mb-2">
              <div className="w-2 h-2 rounded-full bg-indigo-400" />
              <h3 className="text-white font-semibold">{ch.name}</h3>
              {ch.isDefault && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-400">Default</span>
              )}
            </div>
            <p className="text-sm text-zinc-400 line-clamp-2">{ch.nicheConstraints || ch.channelTheme}</p>
            <p className="text-xs text-zinc-600 mt-2">{ch.slug}</p>
          </Link>
        ))}
      </div>

      {/* New Channel */}
      <div className="p-5 rounded-xl bg-[#18181b] border border-zinc-800">
        <h2 className="text-lg font-semibold text-white mb-4">New Channel</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Name</label>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="My New Channel"
              className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-white text-sm focus:outline-none focus:border-indigo-500"
            />
          </div>
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Slug</label>
            <input
              value={newSlug}
              onChange={(e) => setNewSlug(e.target.value)}
              placeholder="my-new-channel"
              className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-white text-sm focus:outline-none focus:border-indigo-500"
            />
          </div>
        </div>
        <div className="mb-4">
          <label className="block text-xs text-zinc-400 mb-1">Clone from (optional)</label>
          <select
            value={cloneFromId || ''}
            onChange={(e) => setCloneFromId(e.target.value || null)}
            className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-white text-sm focus:outline-none focus:border-indigo-500"
          >
            <option value="">Start blank</option>
            {channels.map((ch) => (
              <option key={ch.id} value={ch.id}>{ch.name}</option>
            ))}
          </select>
        </div>
        <button
          onClick={handleCreate}
          disabled={!newName || !newSlug || creating}
          className="px-4 py-2 rounded-lg bg-gradient-to-r from-indigo-500 to-purple-500 text-white text-sm font-medium disabled:opacity-50 hover:opacity-90 transition-opacity"
        >
          {creating ? 'Creating...' : 'Create Channel'}
        </button>
      </div>
    </div>
  );
}
