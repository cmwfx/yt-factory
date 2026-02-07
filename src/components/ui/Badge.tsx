import { ReactNode } from 'react';

type BadgeVariant = 'success' | 'warning' | 'error' | 'neutral' | 'info' | 'active';

interface BadgeProps {
  variant?: BadgeVariant;
  children: ReactNode;
  className?: string;
}

const variantStyles: Record<BadgeVariant, string> = {
  success: 'bg-emerald-600/20 text-emerald-400 border-emerald-600/30',
  warning: 'bg-amber-600/20 text-amber-400 border-amber-600/30',
  error: 'bg-red-600/20 text-red-400 border-red-600/30',
  neutral: 'bg-zinc-600/20 text-zinc-400 border-zinc-600/30',
  info: 'bg-sky-600/20 text-sky-400 border-sky-600/30',
  active: 'bg-indigo-600/20 text-indigo-400 border-indigo-600/30',
};

export function Badge({ variant = 'neutral', children, className = '' }: BadgeProps) {
  return (
    <span
      className={`
        ${variantStyles[variant]}
        inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border
        ${className}
      `}
    >
      {children}
    </span>
  );
}

export function getStatusBadgeVariant(status: string): BadgeVariant {
  switch (status) {
    case 'done':
    case 'success':
    case 'ok':
      return 'success';
    case 'failed':
    case 'error':
      return 'error';
    case 'running':
    case 'in_progress':
    case 'scripting':
    case 'scenes':
    case 'images':
    case 'images_batch1':
    case 'images_batch2':
    case 'audio':
    case 'align':
    case 'render':
    case 'render_queued':
      return 'active';
    case 'queued':
    case 'pending':
      return 'neutral';
    default:
      return 'neutral';
  }
}
