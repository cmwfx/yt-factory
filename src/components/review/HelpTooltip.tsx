'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';

export function HelpTooltip() {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <Button
        variant="secondary"
        size="sm"
        onClick={() => setOpen(!open)}
      >
        Keyboard Shortcuts (?)
      </Button>

      {open && (
        <Card variant="glass" className="absolute top-12 right-0 w-80 z-50">
          <div className="p-4">
            <h3 className="text-white font-semibold mb-4">Keyboard Shortcuts</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-zinc-400">Approve scene</span>
                <kbd className="bg-zinc-800 px-2 py-1 rounded text-zinc-300">Enter</kbd>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-400">Add word to scene</span>
                <kbd className="bg-zinc-800 px-2 py-1 rounded text-zinc-300">↑</kbd>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-400">Remove word from scene</span>
                <kbd className="bg-zinc-800 px-2 py-1 rounded text-zinc-300">↓</kbd>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-400">Previous scene</span>
                <kbd className="bg-zinc-800 px-2 py-1 rounded text-zinc-300">←</kbd>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-400">Next scene</span>
                <kbd className="bg-zinc-800 px-2 py-1 rounded text-zinc-300">→</kbd>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-400">Replay audio</span>
                <kbd className="bg-zinc-800 px-2 py-1 rounded text-zinc-300">R</kbd>
              </div>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
