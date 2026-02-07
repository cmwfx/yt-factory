import { ReactNode, MouseEventHandler } from 'react';

type CardVariant = 'default' | 'glass' | 'elevated';

interface CardProps {
  children: ReactNode;
  className?: string;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  variant?: CardVariant;
  onClick?: MouseEventHandler<HTMLDivElement>;
}

const paddingStyles = {
  none: '',
  sm: 'p-4',
  md: 'p-6',
  lg: 'p-8',
};

const variantStyles: Record<CardVariant, string> = {
  default: 'bg-[#18181b] border border-zinc-800',
  glass: 'bg-[#18181b]/60 backdrop-blur-xl border border-zinc-800/50',
  elevated: 'bg-[#18181b] border border-zinc-700 shadow-xl shadow-black/30',
};

export function Card({ children, className = '', padding = 'md', variant = 'default', onClick }: CardProps) {
  return (
    <div
      onClick={onClick}
      className={`
        rounded-xl ${variantStyles[variant]}
        ${paddingStyles[padding]}
        ${onClick ? 'cursor-pointer' : ''}
        ${className}
      `}
    >
      {children}
    </div>
  );
}

interface CardHeaderProps {
  children: ReactNode;
  className?: string;
}

export function CardHeader({ children, className = '' }: CardHeaderProps) {
  return (
    <div className={`flex items-center justify-between mb-4 ${className}`}>
      {children}
    </div>
  );
}

interface CardTitleProps {
  children: ReactNode;
  className?: string;
}

export function CardTitle({ children, className = '' }: CardTitleProps) {
  return (
    <h2 className={`text-xl font-semibold text-white ${className}`}>
      {children}
    </h2>
  );
}

interface CardContentProps {
  children: ReactNode;
  className?: string;
}

export function CardContent({ children, className = '' }: CardContentProps) {
  return <div className={className}>{children}</div>;
}
