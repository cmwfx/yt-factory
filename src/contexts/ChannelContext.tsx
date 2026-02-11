'use client';

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';

export interface Channel {
  id: string;
  name: string;
  slug: string;
  isDefault: boolean;
  channelTheme: string;
  toneArray: string[];
  nicheConstraints: string;
  visualStyleDescription: string;
  ttsVoiceName: string;
}

interface ChannelContextValue {
  activeChannel: Channel | null;
  channels: Channel[];
  loading: boolean;
  setActiveChannel: (channelId: string) => Promise<void>;
  refreshChannels: () => Promise<void>;
}

const ChannelContext = createContext<ChannelContextValue>({
  activeChannel: null,
  channels: [],
  loading: true,
  setActiveChannel: async () => {},
  refreshChannels: async () => {},
});

export function ChannelProvider({ children }: { children: ReactNode }) {
  const [activeChannel, setActiveChannelState] = useState<Channel | null>(null);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchChannels = useCallback(async () => {
    try {
      const res = await fetch('/api/channels');
      if (res.ok) {
        const data = await res.json();
        setChannels(data.channels || []);
      }
    } catch {
      // silent
    }
  }, []);

  const fetchActiveChannel = useCallback(async () => {
    try {
      const res = await fetch('/api/channels/active');
      if (res.ok) {
        const data = await res.json();
        setActiveChannelState(data.channel || null);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    Promise.all([fetchChannels(), fetchActiveChannel()]);
  }, [fetchChannels, fetchActiveChannel]);

  const setActiveChannel = useCallback(async (channelId: string) => {
    try {
      const res = await fetch('/api/channels/active', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId }),
      });
      if (res.ok) {
        const data = await res.json();
        setActiveChannelState(data.channel || null);
      }
    } catch {
      // silent
    }
  }, []);

  return (
    <ChannelContext.Provider
      value={{
        activeChannel,
        channels,
        loading,
        setActiveChannel,
        refreshChannels: fetchChannels,
      }}
    >
      {children}
    </ChannelContext.Provider>
  );
}

export function useChannel() {
  return useContext(ChannelContext);
}
