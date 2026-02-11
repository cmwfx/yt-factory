'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect, useRef } from 'react';
import { useChannel } from '@/contexts/ChannelContext';

const navItems = [
  { href: '/', label: 'Dashboard', icon: DashboardIcon },
  { href: '/ideas', label: 'Ideas', icon: IdeasIcon },
  { href: '/history', label: 'History', icon: HistoryIcon },
];

export function Sidebar() {
  const pathname = usePathname();
  const [dbStatus, setDbStatus] = useState<'ok' | 'error' | 'loading'>('loading');
  const [channelDropdownOpen, setChannelDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { activeChannel, channels, setActiveChannel } = useChannel();

  useEffect(() => {
    fetch('/api/health')
      .then((res) => res.json())
      .then((data) => setDbStatus(data.db === 'ok' ? 'ok' : 'error'))
      .catch(() => setDbStatus('error'));
  }, []);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setChannelDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <aside className="fixed inset-y-0 left-0 w-60 bg-[#18181b] border-r border-zinc-800 flex flex-col z-40">
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-6 border-b border-zinc-800">
        <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500">
          <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
            <path d="M8 5v14l11-7z" />
          </svg>
        </div>
        <span className="text-lg font-semibold text-white tracking-tight">YT Factory</span>
      </div>

      {/* Channel Switcher */}
      <div className="px-3 py-3 border-b border-zinc-800" ref={dropdownRef}>
        <button
          onClick={() => setChannelDropdownOpen(!channelDropdownOpen)}
          className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-zinc-800/50 hover:bg-zinc-700/50 transition-colors text-sm"
        >
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-2 h-2 rounded-full bg-indigo-400 shrink-0" />
            <span className="text-zinc-200 truncate">{activeChannel?.name || 'Loading...'}</span>
          </div>
          <svg
            className={`w-4 h-4 text-zinc-500 shrink-0 transition-transform ${channelDropdownOpen ? 'rotate-180' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {channelDropdownOpen && (
          <div className="mt-1 bg-zinc-800 border border-zinc-700 rounded-lg overflow-hidden shadow-xl">
            {channels.map((ch) => (
              <button
                key={ch.id}
                onClick={() => {
                  setActiveChannel(ch.id);
                  setChannelDropdownOpen(false);
                }}
                className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                  ch.id === activeChannel?.id
                    ? 'bg-indigo-500/10 text-indigo-400'
                    : 'text-zinc-300 hover:bg-zinc-700/50'
                }`}
              >
                {ch.name}
              </button>
            ))}
            <Link
              href="/channels"
              onClick={() => setChannelDropdownOpen(false)}
              className="block w-full text-left px-3 py-2 text-xs text-zinc-500 hover:text-zinc-300 border-t border-zinc-700 transition-colors"
            >
              Manage Channels
            </Link>
          </div>
        )}
      </div>

      {/* Nav links */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== '/' && pathname.startsWith(item.href));
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`
                flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors
                border-l-2
                ${
                  isActive
                    ? 'bg-indigo-500/10 text-indigo-400 border-l-indigo-500'
                    : 'text-zinc-400 border-l-transparent hover:bg-zinc-700/50 hover:text-zinc-200'
                }
              `}
            >
              <Icon className={`w-4.5 h-4.5 ${isActive ? 'text-indigo-400' : ''}`} />
              {item.label}
            </Link>
          );
        })}

        {/* Settings link */}
        {activeChannel && (
          <Link
            href={`/channels/${activeChannel.id}/settings`}
            className={`
              flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors
              border-l-2
              ${
                pathname.includes('/settings')
                  ? 'bg-indigo-500/10 text-indigo-400 border-l-indigo-500'
                  : 'text-zinc-400 border-l-transparent hover:bg-zinc-700/50 hover:text-zinc-200'
              }
            `}
          >
            <SettingsIcon className={`w-4.5 h-4.5 ${pathname.includes('/settings') ? 'text-indigo-400' : ''}`} />
            Settings
          </Link>
        )}
      </nav>

      {/* Bottom status */}
      <div className="px-5 py-4 border-t border-zinc-800">
        <div className="flex items-center gap-2">
          <div
            className={`w-2 h-2 rounded-full ${
              dbStatus === 'ok' ? 'bg-emerald-400' : dbStatus === 'error' ? 'bg-red-400' : 'bg-zinc-600'
            }`}
          />
          <span className="text-xs text-zinc-500">
            {dbStatus === 'ok' ? 'Database connected' : dbStatus === 'error' ? 'Database error' : 'Checking...'}
          </span>
        </div>
      </div>
    </aside>
  );
}

function DashboardIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <rect x="3" y="3" width="7" height="7" rx="1" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="14" y="3" width="7" height="7" rx="1" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="3" y="14" width="7" height="7" rx="1" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="14" y="14" width="7" height="7" rx="1" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IdeasIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
    </svg>
  );
}

function HistoryIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function SettingsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}
