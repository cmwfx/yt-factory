'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button, Card, Badge, getStatusBadgeVariant } from '@/components/ui';
import { useChannel } from '@/contexts/ChannelContext';

interface HealthStatus {
  status: string;
  db: string;
  ffmpeg: string;
  lastJob?: {
    id: string;
    title: string;
    status: string;
    updatedAt: string;
  };
}

interface QuickStats {
  unusedIdeas: number;
  totalVideos: number;
  doneVideos: number;
  failedVideos: number;
}

interface RecentVideo {
  id: string;
  title: string;
  status: string;
  createdAt: string;
}

interface Schedule {
  id: string;
  intervalHours: number;
  enabled: boolean;
  generateIdeas: boolean;
  enableReview: boolean;
  lastRunAt: string | null;
  nextRunAt: string | null;
}

const STAT_COLORS = [
  { accent: '#6366f1', icon: '💡' },
  { accent: '#a855f7', icon: '🎬' },
  { accent: '#34d399', icon: '✓'  },
  { accent: '#f87171', icon: '✕'  },
];

export default function Home() {
  const router = useRouter();
  const { activeChannel } = useChannel();
  const [loading, setLoading] = useState(false);
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [stats, setStats] = useState<QuickStats | null>(null);
  const [recentVideos, setRecentVideos] = useState<RecentVideo[]>([]);
  const [generateIdeas, setGenerateIdeas] = useState(false);
  const [testMode, setTestMode] = useState(false);
  const [enableManualReview, setEnableManualReview] = useState(false);

  // Schedule state
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [showScheduleForm, setShowScheduleForm] = useState(false);
  const [newScheduleHours, setNewScheduleHours] = useState(6);
  const [newScheduleGenIdeas, setNewScheduleGenIdeas] = useState(true);
  const [newScheduleReview, setNewScheduleReview] = useState(false);

  // User management
  const [showUserForm, setShowUserForm] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [userMessage, setUserMessage] = useState('');

  const fetchStats = useCallback(async () => {
    try {
      const channelParam = activeChannel?.id ? `?channelId=${activeChannel.id}` : '';
      const [ideasRes, videosRes] = await Promise.all([
        fetch(`/api/ideas${channelParam}`),
        fetch(`/api/videos${channelParam}`),
      ]);
      const ideasData = await ideasRes.json();
      const videosData = await videosRes.json();

      setStats({
        unusedIdeas: ideasData.unused || 0,
        totalVideos: videosData.total || 0,
        doneVideos: videosData.statusCounts?.done || 0,
        failedVideos: videosData.statusCounts?.failed || 0,
      });
      setRecentVideos(videosData.videos?.slice(0, 5) || []);
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    }
  }, [activeChannel?.id]);

  const checkHealth = useCallback(async () => {
    try {
      const res = await fetch('/api/health');
      const data = await res.json();
      setHealth(data);
    } catch {
      setHealth({ status: 'error', db: 'unknown', ffmpeg: 'unknown' });
    }
  }, []);

  const fetchSchedules = useCallback(async () => {
    try {
      const res = await fetch('/api/schedule');
      const data = await res.json();
      setSchedules(data.schedules || []);
    } catch {
      // Schedule API might not be available yet
    }
  }, []);

  useEffect(() => {
    checkHealth();
    fetchStats();
    fetchSchedules();
  }, [checkHealth, fetchStats, fetchSchedules]);

  const startJob = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/jobs/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ generateIdeas, testMode, enableManualReview, channelId: activeChannel?.id }),
      });
      const data = await res.json();
      if (data.videoId) {
        router.push(`/videos/${data.videoId}/progress`);
      }
    } catch (error) {
      console.error('Failed to start job:', error);
      alert(error instanceof Error ? error.message : 'Failed to start job');
    } finally {
      setLoading(false);
    }
  };

  const createNewSchedule = async () => {
    try {
      await fetch('/api/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          intervalHours: newScheduleHours,
          generateIdeas: newScheduleGenIdeas,
          enableReview: newScheduleReview,
          channelId: activeChannel?.id,
        }),
      });
      setShowScheduleForm(false);
      fetchSchedules();
    } catch (error) {
      console.error('Failed to create schedule:', error);
    }
  };

  const toggleSchedule = async (id: string, enabled: boolean) => {
    try {
      await fetch(`/api/schedule/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      });
      fetchSchedules();
    } catch (error) {
      console.error('Failed to toggle schedule:', error);
    }
  };

  const removeSchedule = async (id: string) => {
    try {
      await fetch(`/api/schedule/${id}`, { method: 'DELETE' });
      fetchSchedules();
    } catch (error) {
      console.error('Failed to delete schedule:', error);
    }
  };

  const createNewUser = async () => {
    setUserMessage('');
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: newUsername, password: newPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        setUserMessage(data.error || 'Failed');
        return;
      }
      setUserMessage(`User "${newUsername}" created`);
      setNewUsername('');
      setNewPassword('');
      setShowUserForm(false);
    } catch {
      setUserMessage('Network error');
    }
  };

  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
  };

  const statCards = [
    { label: 'Unused Ideas', value: stats?.unusedIdeas ?? 0, href: '/ideas?filter=unused', ...STAT_COLORS[0] },
    { label: 'Total Videos', value: stats?.totalVideos ?? 0, href: '/history', ...STAT_COLORS[1] },
    { label: 'Completed', value: stats?.doneVideos ?? 0, href: '/history?filter=done', ...STAT_COLORS[2] },
    { label: 'Failed', value: stats?.failedVideos ?? 0, href: '/history?filter=failed', ...STAT_COLORS[3] },
  ];

  return (
    <div className="min-h-screen p-8 animate-fadeInUp">
      <div className="max-w-7xl mx-auto">

        {/* HERO */}
        <section
          className="relative rounded-2xl overflow-hidden border border-zinc-800 p-8 mb-8"
          style={{ background: 'linear-gradient(135deg, #1e1b4b 0%, #09090b 60%)' }}
        >
          <div className="absolute -top-20 -right-20 w-64 h-64 rounded-full opacity-20 blur-3xl" style={{ background: '#8b5cf6' }} />
          <div className="absolute -bottom-16 left-1/4 w-48 h-48 rounded-full opacity-15 blur-3xl" style={{ background: '#6366f1' }} />

          <div className="relative z-10 flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div>
              <h1 className="text-3xl font-bold text-white">Video Factory</h1>
              <p className="text-zinc-400 mt-1">
                {activeChannel ? `Channel: ${activeChannel.name}` : 'Create AI-powered YouTube videos'}
              </p>
            </div>

            <div className="flex items-center gap-4 flex-wrap">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={generateIdeas}
                  onChange={(e) => setGenerateIdeas(e.target.checked)}
                  className="w-4 h-4 rounded border-zinc-600 bg-zinc-800 accent-indigo-500"
                />
                <span className="text-sm text-zinc-300">Generate ideas</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={testMode}
                  onChange={(e) => setTestMode(e.target.checked)}
                  className="w-4 h-4 rounded border-zinc-600 bg-zinc-800 accent-indigo-500"
                />
                <span className="text-sm text-zinc-300">Test mode</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={enableManualReview}
                  onChange={(e) => setEnableManualReview(e.target.checked)}
                  className="w-4 h-4 rounded border-zinc-600 bg-zinc-800 accent-indigo-500"
                />
                <span className="text-sm text-zinc-300">Enable manual review</span>
              </label>
              <Button
                variant="gradient"
                size="lg"
                onClick={startJob}
                loading={loading}
              >
                Start New Video
              </Button>
              <Button variant="ghost" size="sm" onClick={logout}>
                Logout
              </Button>
            </div>
          </div>

          {stats?.unusedIdeas === 0 && !generateIdeas && (
            <p className="relative z-10 mt-3 text-sm text-amber-400">
              No unused ideas available. Enable "Generate ideas" or add ideas manually.
            </p>
          )}
        </section>

        {/* STAT CARDS */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {statCards.map((card) => (
            <Link key={card.label} href={card.href}>
              <Card
                variant="glass"
                padding="sm"
                className="relative overflow-hidden hover:scale-[1.02] transition-transform duration-200 cursor-pointer"
              >
                <div
                  className="absolute top-0 left-0 right-0 h-0.5"
                  style={{ background: card.accent }}
                />
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-3xl font-bold text-white">{card.value}</div>
                    <div className="text-sm text-zinc-400 mt-0.5">{card.label}</div>
                  </div>
                  <span className="text-xl opacity-40">{card.icon}</span>
                </div>
              </Card>
            </Link>
          ))}
        </div>

        {/* MAIN CONTENT: 2/3 + 1/3 */}
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Left 2/3 — Recent Videos */}
          <div className="lg:col-span-2 space-y-6">
            <Card variant="elevated">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-lg font-semibold text-white">Recent Videos</h2>
                <Link href="/history">
                  <Button variant="ghost" size="sm">View All</Button>
                </Link>
              </div>

              {recentVideos.length > 0 ? (
                <div className="space-y-2">
                  {recentVideos.map((video, i) => {
                    const isInProgress = !['done', 'failed', 'queued'].includes(video.status);
                    return (
                      <Link
                        key={video.id}
                        href={isInProgress ? `/videos/${video.id}/progress` : `/videos/${video.id}`}
                        className="flex items-center justify-between p-3.5 rounded-lg border border-zinc-800 hover:border-zinc-700 hover:bg-[#27272a]/50 transition-colors"
                        style={{ animationDelay: `${i * 50}ms` }}
                      >
                        <div className="flex-1 min-w-0 mr-4">
                          <p className="text-white text-sm font-medium truncate">{video.title}</p>
                          <p className="text-xs text-zinc-500 mt-0.5">
                            {new Date(video.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                        <Badge variant={getStatusBadgeVariant(video.status)}>
                          {video.status}
                        </Badge>
                      </Link>
                    );
                  })}
                </div>
              ) : (
                <p className="text-zinc-500 text-center py-8">No videos yet. Start your first job!</p>
              )}
            </Card>

            {/* Scheduling Card */}
            <Card variant="elevated">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-white">Scheduling</h2>
                <Button variant="secondary" size="sm" onClick={() => setShowScheduleForm(!showScheduleForm)}>
                  {showScheduleForm ? 'Cancel' : 'New Schedule'}
                </Button>
              </div>

              {showScheduleForm && (
                <div className="border border-zinc-700 rounded-lg p-4 mb-4 space-y-3">
                  <div className="flex items-center gap-3">
                    <label className="text-sm text-zinc-400">Every</label>
                    <input
                      type="number"
                      min={1}
                      max={168}
                      value={newScheduleHours}
                      onChange={(e) => setNewScheduleHours(Number(e.target.value))}
                      className="w-20 px-2 py-1 rounded border border-zinc-700 bg-[#09090b] text-white text-sm"
                    />
                    <span className="text-sm text-zinc-400">hours</span>
                  </div>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 text-sm text-zinc-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={newScheduleGenIdeas}
                        onChange={(e) => setNewScheduleGenIdeas(e.target.checked)}
                        className="accent-indigo-500"
                      />
                      Generate ideas
                    </label>
                    <label className="flex items-center gap-2 text-sm text-zinc-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={newScheduleReview}
                        onChange={(e) => setNewScheduleReview(e.target.checked)}
                        className="accent-indigo-500"
                      />
                      Manual review
                    </label>
                  </div>
                  <Button variant="gradient" size="sm" onClick={createNewSchedule}>
                    Create Schedule
                  </Button>
                </div>
              )}

              {schedules.length > 0 ? (
                <div className="space-y-2">
                  {schedules.map((sched) => (
                    <div
                      key={sched.id}
                      className="flex items-center justify-between p-3 rounded-lg border border-zinc-800"
                    >
                      <div>
                        <p className="text-sm text-white">
                          Every {sched.intervalHours}h
                          {sched.generateIdeas ? ' + ideas' : ''}
                          {sched.enableReview ? ' + review' : ''}
                        </p>
                        <p className="text-xs text-zinc-500 mt-0.5">
                          {sched.nextRunAt
                            ? `Next: ${new Date(sched.nextRunAt).toLocaleString()}`
                            : 'Not scheduled'}
                          {sched.lastRunAt && ` | Last: ${new Date(sched.lastRunAt).toLocaleString()}`}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => toggleSchedule(sched.id, !sched.enabled)}
                          className={`px-2 py-1 rounded text-xs font-medium ${
                            sched.enabled
                              ? 'bg-emerald-500/20 text-emerald-400'
                              : 'bg-zinc-700/50 text-zinc-400'
                          }`}
                        >
                          {sched.enabled ? 'On' : 'Off'}
                        </button>
                        <button
                          onClick={() => removeSchedule(sched.id)}
                          className="px-2 py-1 rounded text-xs text-red-400 hover:bg-red-500/10"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-zinc-500 text-sm">No schedules configured.</p>
              )}
            </Card>
          </div>

          {/* Right 1/3 */}
          <div className="space-y-6">
            {/* Quick Actions */}
            <Card variant="elevated">
              <h2 className="text-lg font-semibold text-white mb-4">Quick Actions</h2>
              <div className="grid grid-cols-2 gap-3">
                <Link href="/ideas">
                  <Button variant="secondary" className="w-full">Manage Ideas</Button>
                </Link>
                <Link href="/history">
                  <Button variant="secondary" className="w-full">View History</Button>
                </Link>
              </div>
            </Card>

            {/* User Management */}
            <Card variant="default">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-lg font-semibold text-white">Users</h2>
                <Button variant="ghost" size="sm" onClick={() => setShowUserForm(!showUserForm)}>
                  {showUserForm ? 'Cancel' : 'Add User'}
                </Button>
              </div>

              {showUserForm && (
                <div className="space-y-2 mb-3">
                  <input
                    type="text"
                    placeholder="Username"
                    value={newUsername}
                    onChange={(e) => setNewUsername(e.target.value)}
                    className="w-full px-3 py-1.5 rounded border border-zinc-700 bg-[#09090b] text-white text-sm"
                  />
                  <input
                    type="password"
                    placeholder="Password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full px-3 py-1.5 rounded border border-zinc-700 bg-[#09090b] text-white text-sm"
                  />
                  <Button variant="secondary" size="sm" onClick={createNewUser}>
                    Create Admin
                  </Button>
                  {userMessage && (
                    <p className="text-xs text-zinc-400">{userMessage}</p>
                  )}
                </div>
              )}
            </Card>

            {/* System Status */}
            <Card variant="default">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-lg font-semibold text-white">System Status</h2>
                <Button variant="ghost" size="sm" onClick={checkHealth}>Refresh</Button>
              </div>
              {health ? (
                <div className="space-y-2">
                  {[
                    { label: 'Database', value: health.db },
                    { label: 'FFmpeg', value: health.ffmpeg },
                    { label: 'Status', value: health.status },
                  ].map((item) => (
                    <div key={item.label} className="flex items-center justify-between">
                      <span className="text-sm text-zinc-400">{item.label}</span>
                      <div className="flex items-center gap-1.5">
                        <div
                          className={`w-1.5 h-1.5 rounded-full ${
                            item.value === 'ok' ? 'bg-emerald-400' : item.value === 'error' || item.value === 'missing' ? 'bg-red-400' : 'bg-amber-400'
                          }`}
                        />
                        <span className="text-xs text-zinc-300">{item.value}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-zinc-500 text-sm">Loading...</p>
              )}
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
