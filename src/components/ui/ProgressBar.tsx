interface ProgressBarProps {
  progress: number; // 0-100
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
  variant?: 'default' | 'success' | 'warning' | 'error';
  animated?: boolean;
  className?: string;
}

const sizeStyles = {
  sm: 'h-1.5',
  md: 'h-2.5',
  lg: 'h-4',
};

const variantStyles = {
  default: 'none',
  success: 'bg-emerald-400',
  warning: 'bg-amber-400',
  error: 'bg-red-400',
};

export function ProgressBar({
  progress,
  size = 'md',
  showLabel = false,
  variant = 'default',
  animated = true,
  className = '',
}: ProgressBarProps) {
  const clampedProgress = Math.min(100, Math.max(0, progress));
  const useGradient = variant === 'default';

  return (
    <div className={`w-full ${className}`}>
      {showLabel && (
        <div className="flex justify-between mb-1">
          <span className="text-sm text-zinc-400">Progress</span>
          <span className="text-sm font-medium text-white">{Math.round(clampedProgress)}%</span>
        </div>
      )}
      <div className={`w-full bg-[#27272a] rounded-full overflow-hidden ${sizeStyles[size]}`}>
        <div
          className={`
            ${sizeStyles[size]} rounded-full
            transition-all duration-500 ease-out
            ${!useGradient ? variantStyles[variant] : ''}
            ${animated && clampedProgress > 0 && clampedProgress < 100 ? 'animate-pulse' : ''}
          `}
          style={{
            width: `${clampedProgress}%`,
            ...(useGradient
              ? { background: 'linear-gradient(90deg, #6366f1, #8b5cf6, #a855f7)' }
              : {}),
          }}
        />
      </div>
    </div>
  );
}
