'use client';

import { useState, useEffect } from 'react';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [isSetup, setIsSetup] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    // Check if already authenticated
    fetch('/api/auth/me')
      .then(res => {
        if (res.ok) {
          window.location.href = '/';
          return;
        }
        // Check if setup mode (no users exist)
        return fetch('/api/auth/register').then(res => res?.json());
      })
      .then(data => {
        if (data?.setup) {
          setIsSetup(true);
        }
      })
      .catch(() => {})
      .finally(() => setChecking(false));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const endpoint = isSetup ? '/api/auth/register' : '/api/auth/login';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Authentication failed');
        return;
      }

      window.location.href = '/';
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  };

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#09090b]">
        <div className="text-zinc-500">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#09090b] p-4">
      <div className="w-full max-w-sm">
        <div className="rounded-2xl border border-zinc-800 bg-[#18181b] p-8">
          <div className="text-center mb-6">
            <h1 className="text-2xl font-bold text-white">
              {isSetup ? 'Create Admin Account' : 'Sign In'}
            </h1>
            <p className="text-sm text-zinc-400 mt-1">
              {isSetup ? 'Set up your first admin account' : 'YT Factory'}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm text-zinc-400 mb-1.5">Username</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-zinc-700 bg-[#09090b] text-white placeholder-zinc-600 focus:outline-none focus:border-indigo-500 transition-colors"
                placeholder="admin"
                autoFocus
                required
              />
            </div>
            <div>
              <label className="block text-sm text-zinc-400 mb-1.5">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-zinc-700 bg-[#09090b] text-white placeholder-zinc-600 focus:outline-none focus:border-indigo-500 transition-colors"
                placeholder="••••••••"
                required
              />
            </div>

            {error && (
              <p className="text-sm text-red-400">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-lg font-medium text-white transition-all disabled:opacity-50"
              style={{
                background: 'linear-gradient(135deg, #6366f1, #a855f7, #ec4899)',
                backgroundSize: '200% 200%',
              }}
            >
              {loading ? 'Please wait...' : isSetup ? 'Create Account' : 'Sign In'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
