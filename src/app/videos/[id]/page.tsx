'use client';

import { useState, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button, Card, CardHeader, CardTitle, Badge, getStatusBadgeVariant, Spinner } from '@/components/ui';
import { StepTimeline } from '@/components/videos';
import { useVideo } from '@/hooks/useVideos';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function VideoDetailsPage({ params }: PageProps) {
  const resolvedParams = use(params);
  const router = useRouter();
  const { video, loading, error, refetch } = useVideo(resolvedParams.id);
  const [scriptExpanded, setScriptExpanded] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [selectedRetryStep, setSelectedRetryStep] = useState<string | null>(null);
  const [generatingTitles, setGeneratingTitles] = useState(false);
  const [generatingDescription, setGeneratingDescription] = useState(false);
  const [generatingThumbnails, setGeneratingThumbnails] = useState(false);

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this video?')) return;
    try {
      setDeleting(true);
      const res = await fetch(`/api/videos/${resolvedParams.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to delete');
      }
      router.push('/history');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete video');
      setDeleting(false);
    }
  };

  const handleRetry = async (fromStep: string) => {
    try {
      setRetrying(true);
      const res = await fetch('/api/jobs/retry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoId: resolvedParams.id, fromStep }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to retry');
      }
      await refetch();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to retry job');
    } finally {
      setRetrying(false);
      setSelectedRetryStep(null);
    }
  };

  const handleGenerateTitles = async () => {
    try {
      setGeneratingTitles(true);
      const res = await fetch(`/api/videos/${resolvedParams.id}/metadata`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'titles' }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to generate titles');
      }
      await refetch();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to generate titles');
    } finally {
      setGeneratingTitles(false);
    }
  };

  const handleGenerateDescription = async () => {
    try {
      setGeneratingDescription(true);
      const res = await fetch(`/api/videos/${resolvedParams.id}/metadata`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'description' }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to generate description');
      }
      await refetch();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to generate description');
    } finally {
      setGeneratingDescription(false);
    }
  };

  const handleGenerateThumbnails = async () => {
    try {
      setGeneratingThumbnails(true);
      const res = await fetch(`/api/videos/${resolvedParams.id}/metadata`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'thumbnails' }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to generate thumbnails');
      }
      await refetch();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to generate thumbnails');
    } finally {
      setGeneratingThumbnails(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen p-8">
        <div className="max-w-4xl mx-auto flex items-center justify-center py-12">
          <Spinner size="lg" />
        </div>
      </div>
    );
  }

  if (error || !video) {
    return (
      <div className="min-h-screen p-8">
        <div className="max-w-4xl mx-auto">
          <Card className="text-center py-12">
            <h2 className="text-xl font-semibold text-white mb-2">Video not found</h2>
            <p className="text-zinc-400 mb-4">{error || 'This video does not exist.'}</p>
            <Link href="/history">
              <Button>Back to History</Button>
            </Link>
          </Card>
        </div>
      </div>
    );
  }

  const videoAsset = video.assets.find(a => a.type === 'video');
  const failedSteps = video.steps.filter(s => s.status === 'failed');
  const retryableSteps = video.steps.filter(s => s.status !== 'pending');
  const isInProgress = !['done', 'failed', 'queued'].includes(video.status);

  return (
    <div className="min-h-screen p-8 animate-fadeInUp">
      <div className="max-w-4xl mx-auto">
        {/* Back */}
        <div className="flex items-center gap-4 mb-6">
          <Link href="/history" className="inline-flex items-center gap-2 text-zinc-400 hover:text-white transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to History
          </Link>
          {isInProgress && (
            <Link href={`/videos/${resolvedParams.id}/progress`}>
              <Badge variant="active" className="cursor-pointer hover:bg-indigo-500/30 transition-colors">
                View Live Progress
              </Badge>
            </Link>
          )}
        </div>

        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-8">
          <div>
            <div className="flex items-center gap-3 mb-2 flex-wrap">
              <h1 className="text-3xl font-bold text-white">{video.title}</h1>
              <Badge variant={getStatusBadgeVariant(video.status)}>{video.status}</Badge>
            </div>
            {video.idea && (
              <p className="text-zinc-400">Based on idea: {video.idea.title}</p>
            )}
            <p className="text-zinc-500 text-sm mt-1">
              Created: {new Date(video.createdAt).toLocaleString()}
            </p>
          </div>
          <div className="flex gap-2">
            {videoAsset && (
              <a href={`/api/videos/${resolvedParams.id}/download`} download>
                <Button variant="primary">Download Video</Button>
              </a>
            )}
            <Button variant="danger" onClick={handleDelete} loading={deleting}>Delete</Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
          {[
            { label: 'Total Steps', value: video.steps.length, color: 'text-white' },
            { label: 'Completed', value: video.steps.filter(s => s.status === 'success').length, color: 'text-emerald-400' },
            { label: 'Failed', value: failedSteps.length, color: 'text-red-400' },
            {
              label: 'Total Time',
              value: video.totalDurationMs > 0 ? `${Math.round(video.totalDurationMs / 1000)}s` : '-',
              color: 'text-white',
            },
            {
              label: 'Est. Cost',
              value: video.costCents != null ? `$${(video.costCents / 100).toFixed(2)}` : '-',
              color: 'text-amber-400',
            },
          ].map((stat) => (
            <Card key={stat.label} variant="glass" padding="sm">
              <div className={`text-2xl font-bold ${stat.color}`}>{stat.value}</div>
              <div className="text-sm text-zinc-400">{stat.label}</div>
            </Card>
          ))}
        </div>

        {/* Cost Breakdown */}
        {video.costBreakdown && (
          <Card className="mb-8">
            <CardHeader>
              <CardTitle>Cost Breakdown</CardTitle>
              <Badge variant="warning">${(video.costCents! / 100).toFixed(2)} total</Badge>
            </CardHeader>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: 'Gemini Text', value: video.costBreakdown.geminiText, color: 'text-indigo-400' },
                { label: 'Gemini TTS', value: video.costBreakdown.geminiTTS, color: 'text-purple-400' },
                { label: 'Gemini Image', value: video.costBreakdown.geminiImage, color: 'text-emerald-400' },
                { label: 'AssemblyAI', value: video.costBreakdown.assemblyAI, color: 'text-orange-400' },
              ].map((item) => (
                <div key={item.label} className="p-3 bg-[#27272a] rounded-lg">
                  <div className={`text-lg font-semibold ${item.color}`}>
                    ${(item.value / 100).toFixed(3)}
                  </div>
                  <div className="text-xs text-zinc-400">{item.label}</div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Retry */}
        {(video.status === 'failed' || failedSteps.length > 0) && (
          <Card className="mb-8 border-amber-600/30">
            <CardHeader>
              <CardTitle>Retry Options</CardTitle>
            </CardHeader>
            <p className="text-zinc-400 mb-4">Select a step to retry the pipeline from that point.</p>
            <div className="flex flex-wrap gap-2">
              {retryableSteps.map((step) => (
                <Button
                  key={step.id}
                  variant={step.status === 'failed' ? 'danger' : 'secondary'}
                  size="sm"
                  onClick={() => handleRetry(step.step)}
                  loading={retrying && selectedRetryStep === step.step}
                  disabled={retrying}
                >
                  From: {step.step}
                </Button>
              ))}
            </div>
          </Card>
        )}

        {/* Script */}
        {video.script && (
          <Card className="mb-8">
            <CardHeader>
              <CardTitle>Script</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => setScriptExpanded(!scriptExpanded)}>
                {scriptExpanded ? 'Collapse' : 'Expand'}
              </Button>
            </CardHeader>
            <div className={`text-zinc-300 text-sm font-mono whitespace-pre-wrap ${scriptExpanded ? '' : 'max-h-48 overflow-hidden relative'}`}>
              {video.script}
              {!scriptExpanded && (
                <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-[#18181b] to-transparent" />
              )}
            </div>
            <div className="mt-2 text-xs text-zinc-500">{video.script.split(/\s+/).length} words</div>
          </Card>
        )}

        {/* AI Metadata */}
        {video.script && (
          <Card className="mb-8">
            <CardHeader>
              <CardTitle>AI Metadata</CardTitle>
            </CardHeader>

            <div className="mb-6">
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-medium text-white">Clickbait Titles</h4>
                <Button variant="secondary" size="sm" onClick={handleGenerateTitles} loading={generatingTitles}>
                  {video.clickbaitTitles.length > 0 ? 'Regenerate' : 'Generate'}
                </Button>
              </div>
              {video.clickbaitTitles.length > 0 ? (
                <ul className="space-y-2">
                  {video.clickbaitTitles.map((title, idx) => (
                    <li key={idx} className="flex items-center gap-2 p-2 bg-[#27272a] rounded text-sm">
                      <span className="text-zinc-500">{idx + 1}.</span>
                      <span className="text-white">{title}</span>
                      <button
                        onClick={() => navigator.clipboard.writeText(title)}
                        className="ml-auto text-zinc-400 hover:text-white"
                        title="Copy"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-zinc-500 text-sm">No titles generated yet.</p>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-medium text-white">SEO Description</h4>
                <Button variant="secondary" size="sm" onClick={handleGenerateDescription} loading={generatingDescription}>
                  {video.seoDescription ? 'Regenerate' : 'Generate'}
                </Button>
              </div>
              {video.seoDescription ? (
                <div>
                  <div className="p-3 bg-[#27272a] rounded text-sm text-zinc-300 mb-3">{video.seoDescription}</div>
                  {video.seoKeywords.length > 0 && (
                    <div>
                      <p className="text-xs text-zinc-500 mb-2">Keywords:</p>
                      <div className="flex flex-wrap gap-2">
                        {video.seoKeywords.map((keyword, idx) => (
                          <Badge key={idx} variant="neutral">{keyword}</Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-zinc-500 text-sm">No description generated yet.</p>
              )}
            </div>
          </Card>
        )}

        {/* Thumbnails */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Thumbnails</CardTitle>
            <Button variant="secondary" size="sm" onClick={handleGenerateThumbnails} loading={generatingThumbnails}>
              {video.thumbnailPrompts.length > 0 ? 'Regenerate' : 'Generate'}
            </Button>
          </CardHeader>

          {video.thumbnailPrompts.length > 0 ? (
            <div className="grid grid-cols-3 gap-4">
              {video.thumbnailPrompts.map((prompt, idx) => (
                <div key={idx} className="space-y-2">
                  <img
                    src={`/jobs/${video.id}/thumbnail_${idx + 1}.png`}
                    alt={`Thumbnail ${idx + 1}`}
                    className="w-full rounded-lg border border-[#27272a] hover:scale-[1.02] transition-transform cursor-pointer"
                  />
                  <details className="text-xs text-zinc-500">
                    <summary className="cursor-pointer hover:text-zinc-300 transition-colors">Show prompt</summary>
                    <p className="mt-1 p-2 bg-[#27272a] rounded">{prompt}</p>
                  </details>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-zinc-500 text-sm">No thumbnails generated yet.</p>
          )}
        </Card>

        {/* Pipeline Steps */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Pipeline Steps</CardTitle>
            <Button variant="ghost" size="sm" onClick={refetch}>Refresh</Button>
          </CardHeader>
          <StepTimeline steps={video.steps} />
        </Card>

        {/* Assets */}
        {video.assets.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Generated Assets</CardTitle>
            </CardHeader>
            <div className="space-y-2">
              {video.assets.map((asset) => (
                <div key={asset.id} className="flex items-center justify-between p-3 bg-[#27272a] rounded-lg">
                  <div className="flex items-center gap-3">
                    <Badge variant="info">{asset.type}</Badge>
                    <span className="text-zinc-300">{asset.filename}</span>
                  </div>
                  {asset.type === 'video' ? (
                    <a href={`/api/videos/${resolvedParams.id}/download`} download className="text-indigo-400 hover:text-indigo-300 text-sm">
                      Download
                    </a>
                  ) : (
                    <span className="text-zinc-500 text-sm">{asset.filename}</span>
                  )}
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
