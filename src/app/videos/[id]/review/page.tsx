'use client';

import { use, useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { HelpTooltip } from '@/components/review/HelpTooltip';
import type { ReviewSceneData } from '@/types';

export default function ReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [fileError, setFileError] = useState<string | null>(null);
  const [scenes, setScenes] = useState<ReviewSceneData[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [adjustments, setAdjustments] = useState<Map<number, number>>(new Map());
  const [alignmentConfidence, setAlignmentConfidence] = useState<number | null>(null);

  const audioRef = useRef<HTMLAudioElement>(null);

  // Load review data
  useEffect(() => {
    fetch(`/api/videos/${id}/review`)
      .then(res => {
        if (!res.ok) {
          return res.json().then(data => {
            throw new Error(data.error || 'Failed to load review data');
          });
        }
        return res.json();
      })
      .then(data => {
        setScenes(data.scenes);
        setAlignmentConfidence(data.alignmentConfidence);
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to load review data:', err);
        setFileError(err.message);
        setLoading(false);
      });
  }, [id]);

  // Track if user has interacted (to allow autoplay on scene changes)
  const [hasInteracted, setHasInteracted] = useState(false);

  // Auto-play when scene changes (only after initial user interaction)
  useEffect(() => {
    if (audioRef.current && !loading && scenes.length > 0) {
      const currentScene = scenes[currentIndex];

      const playScene = () => {
        if (!audioRef.current) return;
        // Set the audio to start at the scene's start time
        audioRef.current.currentTime = currentScene.startTime;

        // Only autoplay if user has interacted (to avoid browser autoplay policy errors)
        if (hasInteracted) {
          audioRef.current.play().catch((err) => {
            console.error('Audio playback failed:', err);
          });
        }
      };

      // Stop the audio when it reaches the end of the scene
      const handleTimeUpdate = () => {
        if (audioRef.current && audioRef.current.currentTime >= currentScene.endTime) {
          audioRef.current.pause();
        }
      };

      // If audio is ready, play immediately; otherwise wait for it to load
      if (audioRef.current.readyState >= 2) {
        playScene();
      } else {
        audioRef.current.addEventListener('loadeddata', playScene, { once: true });
      }

      audioRef.current.addEventListener('timeupdate', handleTimeUpdate);
      return () => {
        audioRef.current?.removeEventListener('timeupdate', handleTimeUpdate);
        audioRef.current?.removeEventListener('loadeddata', playScene);
      };
    }
  }, [currentIndex, loading, scenes, hasInteracted]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Ignore if user is typing in input field
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      if (e.key === 'Enter') handleApproveScene();
      if (e.key === 'ArrowUp') handleAddWord();
      if (e.key === 'ArrowDown') handleRemoveWord();
      if (e.key === 'ArrowLeft') handlePreviousScene();
      if (e.key === 'ArrowRight') handleNextScene();
      if (e.key === 'r' || e.key === 'R') handleReplay();
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  });

  const handleApproveScene = () => {
    setHasInteracted(true);
    if (currentIndex < scenes.length - 1) {
      setCurrentIndex(prev => prev + 1);
    } else {
      // Last scene - show completion message
      alert('All scenes reviewed! Click "Save & Render" to continue.');
    }
  };

  const handleAddWord = async () => {
    if (currentIndex >= scenes.length - 1) return; // Can't add to last scene

    const res = await fetch(`/api/videos/${id}/review/adjust`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sceneIndex: currentIndex, wordDelta: 1 }),
    });

    if (res.ok) {
      const { updatedScene, nextScene } = await res.json();
      const newScenes = [...scenes];
      newScenes[currentIndex] = updatedScene;
      if (nextScene) newScenes[currentIndex + 1] = nextScene;
      setScenes(newScenes);

      // Track adjustment
      const newAdj = new Map(adjustments);
      newAdj.set(currentIndex, (newAdj.get(currentIndex) || 0) + 1);
      setAdjustments(newAdj);
    }
  };

  const handleRemoveWord = async () => {
    if (currentIndex === 0) return; // Can't remove from first scene

    const res = await fetch(`/api/videos/${id}/review/adjust`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sceneIndex: currentIndex, wordDelta: -1 }),
    });

    if (res.ok) {
      const { updatedScene, nextScene } = await res.json();
      const newScenes = [...scenes];
      newScenes[currentIndex] = updatedScene;
      if (nextScene) newScenes[currentIndex + 1] = nextScene;
      setScenes(newScenes);

      // Track adjustment
      const newAdj = new Map(adjustments);
      newAdj.set(currentIndex, (newAdj.get(currentIndex) || 0) - 1);
      setAdjustments(newAdj);
    }
  };

  const handlePreviousScene = () => {
    setHasInteracted(true);
    if (currentIndex > 0) setCurrentIndex(prev => prev - 1);
  };

  const handleNextScene = () => {
    setHasInteracted(true);
    if (currentIndex < scenes.length - 1) setCurrentIndex(prev => prev + 1);
  };

  const handleReplay = () => {
    setHasInteracted(true);
    if (audioRef.current && scenes.length > 0) {
      const currentScene = scenes[currentIndex];
      audioRef.current.currentTime = currentScene.startTime;
      audioRef.current.play();
    }
  };

  const handleSaveAndRender = async () => {
    const res = await fetch(`/api/videos/${id}/review/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ renderNow: true }),
    });

    if (res.ok) {
      router.push(`/videos/${id}/progress`);
    }
  };

  const handleSaveOnly = async () => {
    await fetch(`/api/videos/${id}/review/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ renderNow: false }),
    });

    router.push(`/videos/${id}`);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#09090b] flex items-center justify-center">
        <div className="text-zinc-300">Loading review data...</div>
      </div>
    );
  }

  if (fileError) {
    return (
      <div className="min-h-screen bg-[#09090b] flex items-center justify-center">
        <Card variant="glass" className="max-w-md">
          <div className="p-8 text-center">
            <h2 className="text-xl font-semibold text-white mb-4">Error Loading Review</h2>
            <p className="text-zinc-400 mb-4">{fileError}</p>
            <Link href={`/videos/${id}`}>
              <Button variant="secondary">Back to Video Details</Button>
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  const currentScene = scenes[currentIndex];

  return (
    <div className="min-h-screen bg-[#09090b] p-8">
      {/* Header */}
      <div className="max-w-7xl mx-auto mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">Manual Review</h1>
            <p className="text-zinc-400">
              Scene {currentIndex + 1} of {scenes.length}
              {alignmentConfidence && (
                <span className="ml-4">
                  Auto-match confidence: {alignmentConfidence.toFixed(1)}%
                </span>
              )}
            </p>
          </div>
          <HelpTooltip />
        </div>
      </div>

      {/* Main review area */}
      <div className="max-w-7xl mx-auto grid grid-cols-3 gap-6 mb-8">
        {/* Previous scene (dimmed) */}
        <Card variant="glass" className="opacity-40">
          {currentIndex > 0 && (
            <div className="p-6">
              <div className="text-xs text-zinc-500 mb-2">Previous</div>
              <img
                src={scenes[currentIndex - 1].imagePath}
                alt={`Scene ${currentIndex}`}
                className="w-full h-48 object-cover rounded-lg mb-4"
              />
              <p className="text-sm text-zinc-400 line-clamp-3">
                {scenes[currentIndex - 1].text}
              </p>
            </div>
          )}
        </Card>

        {/* Current scene */}
        <Card variant="elevated" className="col-span-1">
          <div className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="text-sm font-semibold text-white">
                Current Scene
              </div>
              <Badge variant={currentScene.confidence && currentScene.confidence >= 80 ? 'success' : 'active'}>
                {currentScene.confidence}% match
              </Badge>
            </div>

            {/* Image */}
            <img
              src={currentScene.imagePath}
              alt={`Scene ${currentIndex + 1}`}
              className="w-full h-64 object-cover rounded-lg mb-4"
            />

            {/* Scene text */}
            <p className="text-white mb-4">{currentScene.text}</p>

            {/* Word count */}
            <div className="text-xs text-zinc-400 mb-4">
              {currentScene.wordCount} words • {currentScene.duration.toFixed(1)}s
              {adjustments.get(currentIndex) && (
                <span className="ml-2 text-indigo-400">
                  ({adjustments.get(currentIndex)! > 0 ? '+' : ''}
                  {adjustments.get(currentIndex)} word)
                </span>
              )}
            </div>

            {/* Audio player - single file for all scenes */}
            <audio
              ref={audioRef}
              src={scenes.length > 0 ? scenes[0].audioPath : ''}
              preload="auto"
            />

            {/* Controls */}
            <div className="grid grid-cols-2 gap-2 mt-4">
              <Button variant="secondary" size="sm" onClick={handleReplay}>
                Replay (R)
              </Button>
              <Button variant="secondary" size="sm" onClick={handleApproveScene}>
                Approve (Enter)
              </Button>
              <Button variant="secondary" size="sm" onClick={handleRemoveWord}>
                Remove Word (↓)
              </Button>
              <Button variant="secondary" size="sm" onClick={handleAddWord}>
                Add Word (↑)
              </Button>
            </div>
          </div>
        </Card>

        {/* Next scene (dimmed) */}
        <Card variant="glass" className="opacity-40">
          {currentIndex < scenes.length - 1 && (
            <div className="p-6">
              <div className="text-xs text-zinc-500 mb-2">Next</div>
              <img
                src={scenes[currentIndex + 1].imagePath}
                alt={`Scene ${currentIndex + 2}`}
                className="w-full h-48 object-cover rounded-lg mb-4"
              />
              <p className="text-sm text-zinc-400 line-clamp-3">
                {scenes[currentIndex + 1].text}
              </p>
            </div>
          )}
        </Card>
      </div>

      {/* Bottom navigation bar */}
      <div className="max-w-7xl mx-auto">
        <Card variant="glass">
          <div className="p-6 flex items-center justify-between">
            <div className="flex gap-4">
              <Button
                variant="secondary"
                onClick={handlePreviousScene}
                disabled={currentIndex === 0}
              >
                ← Previous
              </Button>
              <Button
                variant="secondary"
                onClick={handleNextScene}
                disabled={currentIndex >= scenes.length - 1}
              >
                Next →
              </Button>
            </div>

            <div className="flex gap-4">
              <Button variant="secondary" onClick={handleSaveOnly}>
                Save Only
              </Button>
              <Button variant="gradient" onClick={handleSaveAndRender}>
                Save & Render
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
