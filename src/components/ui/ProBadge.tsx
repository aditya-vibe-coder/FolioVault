import { type ReactNode } from 'react';
import { Sparkles, Lock, Crown, Zap } from 'lucide-react';
import { cn } from '../../lib/formatters';

type Variant = 'pro' | 'ai' | 'premium' | 'lock';
type Size = 'xs' | 'sm' | 'md';

interface ProBadgeProps {
  variant?: Variant;
  size?: Size;
  label?: string;
  icon?: ReactNode;
  className?: string;
}

const VARIANT_STYLES: Record<Variant, string> = {
  pro:     'bg-gradient-to-r from-amber-500 to-orange-500 text-white border-amber-500/40',
  ai:      'bg-gradient-to-r from-purple-600 via-fuchsia-600 to-pink-500 text-white border-purple-500/40',
  premium: 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white border-emerald-500/40',
  lock:    'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30',
};

const VARIANT_DEFAULT_ICON: Record<Variant, ReactNode> = {
  pro:     <Crown className="w-3 h-3" />,
  ai:      <Sparkles className="w-3 h-3" />,
  premium: <Zap className="w-3 h-3" />,
  lock:    <Lock className="w-3 h-3" />,
};

const VARIANT_DEFAULT_LABEL: Record<Variant, string> = {
  pro:     'PRO',
  ai:      'AI · PRO',
  premium: 'PREMIUM',
  lock:    'PRO',
};

const SIZE_STYLES: Record<Size, string> = {
  xs: 'text-[8px] px-1.5 py-0.5 gap-0.5',
  sm: 'text-[9px] px-2 py-0.5 gap-1',
  md: 'text-[10px] px-2.5 py-1 gap-1',
};

export function ProBadge({
  variant = 'pro',
  size = 'sm',
  label,
  icon,
  className,
}: ProBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center font-black uppercase tracking-widest rounded-md border shadow-sm whitespace-nowrap',
        VARIANT_STYLES[variant],
        SIZE_STYLES[size],
        className,
      )}
      title={variant === 'ai' ? 'AI-powered premium feature' : 'FolioVault Pro feature'}
    >
      {icon ?? VARIANT_DEFAULT_ICON[variant]}
      {label ?? VARIANT_DEFAULT_LABEL[variant]}
    </span>
  );
}

interface ProPillProps {
  isPro: boolean;
  variant?: Variant;
  className?: string;
}

export function ProPill({ isPro, variant = 'pro', className }: ProPillProps) {
  if (isPro) {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-widest',
          'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30',
          className,
        )}
      >
        <Crown className="w-3 h-3" /> PRO ACTIVE
      </span>
    );
  }
  return <ProBadge variant={variant} size="sm" className={className} />;
}
