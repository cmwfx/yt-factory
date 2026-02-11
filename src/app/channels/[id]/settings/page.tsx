'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useChannel } from '@/contexts/ChannelContext';

const TABS = [
  { key: 'identity', label: 'Identity' },
  { key: 'script', label: 'Script' },
  { key: 'visual', label: 'Visual' },
  { key: 'voice', label: 'Voice' },
  { key: 'models', label: 'Models' },
] as const;

type TabKey = (typeof TABS)[number]['key'];

const VOICE_OPTIONS = ['Charon', 'Kore', 'Fenrir', 'Algenib', 'Puck'];

export default function ChannelSettingsPage() {
  const params = useParams();
  const router = useRouter();
  const channelId = params.id as string;
  const { refreshChannels } = useChannel();

  const [tab, setTab] = useState<TabKey>('identity');
  const [channel, setChannel] = useState<Record<string, any> | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const fetchChannel = useCallback(async () => {
    try {
      const res = await fetch(`/api/channels/${channelId}`);
      if (res.ok) {
        const data = await res.json();
        setChannel(data.channel);
      }
    } finally {
      setLoading(false);
    }
  }, [channelId]);

  useEffect(() => {
    fetchChannel();
  }, [fetchChannel]);

  const updateField = (field: string, value: any) => {
    setChannel((prev) => (prev ? { ...prev, [field]: value } : prev));
    setSaved(false);
  };

  const handleSave = async () => {
    if (!channel) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/channels/${channelId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(channel),
      });
      if (res.ok) {
        setSaved(true);
        await refreshChannels();
        setTimeout(() => setSaved(false), 2000);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this channel? This cannot be undone.')) return;
    const res = await fetch(`/api/channels/${channelId}`, { method: 'DELETE' });
    if (res.ok) {
      await refreshChannels();
      router.push('/channels');
    }
  };

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center">
        <div className="text-zinc-500">Loading...</div>
      </div>
    );
  }

  if (!channel) {
    return (
      <div className="p-8">
        <div className="text-red-400">Channel not found</div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">{channel.name}</h1>
          <p className="text-sm text-zinc-500">{channel.slug}</p>
        </div>
        <div className="flex items-center gap-3">
          {!channel.isDefault && (
            <button
              onClick={handleDelete}
              className="px-3 py-1.5 rounded-lg border border-red-500/30 text-red-400 text-sm hover:bg-red-500/10 transition-colors"
            >
              Delete
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-1.5 rounded-lg bg-gradient-to-r from-indigo-500 to-purple-500 text-white text-sm font-medium disabled:opacity-50 hover:opacity-90 transition-opacity"
          >
            {saving ? 'Saving...' : saved ? 'Saved' : 'Save Changes'}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 p-1 bg-zinc-900 rounded-lg">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
              tab === t.key
                ? 'bg-zinc-700 text-white'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="space-y-6">
        {tab === 'identity' && (
          <>
            <Field label="Channel Name" value={channel.name} onChange={(v) => updateField('name', v)} />
            <Field label="Slug" value={channel.slug} onChange={(v) => updateField('slug', v)} />
            <TextArea label="Theme" value={channel.channelTheme || ''} onChange={(v) => updateField('channelTheme', v)} rows={3} />
            <Field label="Tone (comma-separated)" value={(channel.toneArray || []).join(', ')} onChange={(v) => updateField('toneArray', v.split(',').map((s: string) => s.trim()).filter(Boolean))} />
            <TextArea label="Niche Constraints" value={channel.nicheConstraints || ''} onChange={(v) => updateField('nicheConstraints', v)} rows={2} />
            <div className="grid grid-cols-3 gap-4">
              <Field label="Aspect Ratio" value={channel.aspectRatio || '16:9'} onChange={(v) => updateField('aspectRatio', v)} />
              <Field label="Target Duration" value={channel.targetDuration || '~10 minutes'} onChange={(v) => updateField('targetDuration', v)} />
              <Field label="Target Words" value={String(channel.targetWordCount || 1700)} onChange={(v) => updateField('targetWordCount', parseInt(v) || 1700)} />
            </div>
            <Field label="Pacing" value={channel.pacing || ''} onChange={(v) => updateField('pacing', v)} />
          </>
        )}

        {tab === 'script' && (
          <>
            <TextArea label="Persona Prompt" value={channel.personaPrompt || ''} onChange={(v) => updateField('personaPrompt', v)} rows={12} />
            <TextArea label="Metadata Persona" value={channel.metadataPersona || ''} onChange={(v) => updateField('metadataPersona', v)} rows={4} />
            <TextArea label="Idea Generation Prompt Override" value={channel.ideaGenerationPrompt || ''} onChange={(v) => updateField('ideaGenerationPrompt', v || null)} rows={4} placeholder="Leave empty to use the default template" />
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Script Sections (JSON)</label>
              <textarea
                value={JSON.stringify(channel.scriptSections || [], null, 2)}
                onChange={(e) => {
                  try {
                    updateField('scriptSections', JSON.parse(e.target.value));
                  } catch { /* invalid JSON, ignore */ }
                }}
                rows={10}
                className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-white text-sm font-mono focus:outline-none focus:border-indigo-500 resize-y"
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Section Configs (JSON)</label>
              <textarea
                value={JSON.stringify(channel.sectionConfigs || [], null, 2)}
                onChange={(e) => {
                  try {
                    updateField('sectionConfigs', JSON.parse(e.target.value));
                  } catch { /* invalid JSON, ignore */ }
                }}
                rows={10}
                className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-white text-sm font-mono focus:outline-none focus:border-indigo-500 resize-y"
              />
            </div>
          </>
        )}

        {tab === 'visual' && (
          <>
            <TextArea label="Visual Style Description" value={channel.visualStyleDescription || ''} onChange={(v) => updateField('visualStyleDescription', v)} rows={3} />
            <TextArea label="Style Instruction" value={channel.styleInstruction || ''} onChange={(v) => updateField('styleInstruction', v)} rows={10} />
            <TextArea label="Character Bible" value={channel.characterBible || ''} onChange={(v) => updateField('characterBible', v)} rows={8} />
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Character Display Names (JSON)</label>
              <textarea
                value={JSON.stringify(channel.characterDisplayNames || {}, null, 2)}
                onChange={(e) => {
                  try {
                    updateField('characterDisplayNames', JSON.parse(e.target.value));
                  } catch { /* invalid JSON, ignore */ }
                }}
                rows={5}
                className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-white text-sm font-mono focus:outline-none focus:border-indigo-500 resize-y"
              />
            </div>
            <TextArea label="Thumbnail Style Prompt" value={channel.thumbnailStylePrompt || ''} onChange={(v) => updateField('thumbnailStylePrompt', v)} rows={4} />
            <div>
              <label className="block text-xs text-zinc-400 mb-2">Style Reference Image</label>
              <p className="text-xs text-zinc-600 mb-2">Current: {channel.styleReferencePath || 'None'}</p>
              <input
                type="file"
                accept="image/*"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const formData = new FormData();
                  formData.append('file', file);
                  const res = await fetch(`/api/channels/${channelId}/style-reference`, {
                    method: 'POST',
                    body: formData,
                  });
                  if (res.ok) {
                    const data = await res.json();
                    updateField('styleReferencePath', data.path);
                  }
                }}
                className="text-sm text-zinc-400"
              />
            </div>
          </>
        )}

        {tab === 'voice' && (
          <>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">TTS Voice</label>
              <select
                value={channel.ttsVoiceName || 'Algenib'}
                onChange={(e) => updateField('ttsVoiceName', e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-white text-sm focus:outline-none focus:border-indigo-500"
              >
                {VOICE_OPTIONS.map((v) => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
            </div>
            <TextArea label="Speaking Style Override" value={channel.ttsSpeakingStyle || ''} onChange={(v) => updateField('ttsSpeakingStyle', v || null)} rows={3} placeholder="Leave empty for default" />
          </>
        )}

        {tab === 'models' && (
          <>
            <Field label="Text Generation Model" value={channel.textGenModel || ''} onChange={(v) => updateField('textGenModel', v)} />
            <Field label="Scene Breakdown Model" value={channel.sceneBreakdownModel || ''} onChange={(v) => updateField('sceneBreakdownModel', v)} />
            <Field label="Image Generation Model" value={channel.imageGenModel || ''} onChange={(v) => updateField('imageGenModel', v)} />
            <Field label="TTS Model" value={channel.ttsModel || ''} onChange={(v) => updateField('ttsModel', v)} />
            <Field label="Metadata Model" value={channel.metadataModel || ''} onChange={(v) => updateField('metadataModel', v)} />
          </>
        )}
      </div>
    </div>
  );
}

function Field({ label, value, onChange, placeholder }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-xs text-zinc-400 mb-1">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-white text-sm focus:outline-none focus:border-indigo-500"
      />
    </div>
  );
}

function TextArea({ label, value, onChange, rows = 4, placeholder }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-xs text-zinc-400 mb-1">{label}</label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        placeholder={placeholder}
        className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-white text-sm focus:outline-none focus:border-indigo-500 resize-y"
      />
    </div>
  );
}
