'use client';

import { ReactNode } from 'react';
import { Sidebar } from './Sidebar';
import { ActiveJobBanner } from '@/components/jobs/ActiveJobBanner';
import { ChannelProvider } from '@/contexts/ChannelContext';

interface LayoutClientProps {
  children: ReactNode;
}

export function LayoutClient({ children }: LayoutClientProps) {
  return (
    <ChannelProvider>
      <div className="flex min-h-screen bg-[#09090b]">
        <Sidebar />
        <div className="flex-1 ml-60">
          <main>{children}</main>
          <ActiveJobBanner />
        </div>
      </div>
    </ChannelProvider>
  );
}
