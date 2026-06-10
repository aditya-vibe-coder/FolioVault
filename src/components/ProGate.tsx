import { type ReactNode } from 'react';
import { Lock, Sparkles } from 'lucide-react';
import { useLicense } from '../hooks/useLicense';
import { cn } from '../lib/formatters';

interface ProGateProps {
  feature: string;
  children: ReactNode;
  onUpgrade: () => void;
  /** When true, always show the lock (e.g. always-Pro-only). */
  forceLock?: boolean;
  className?: string;
  inline?: boolean;
}

/**
 * Wraps any Pro-only feature. If the user is not on a Pro plan, shows
 * a tasteful overlay with a "Unlock with Pro" CTA.
 */
export function ProGate({
  feature,
  children,
  onUpgrade,
  forceLock = false,
  className,
  inline = false,
}: ProGateProps) {
  const { isPro } = useLicense();
  if (isPro && !forceLock) {
    return <>{children}</>;
  }

  if (inline) {
    return (
      <button
        onClick={onUpgrade}
        className={cn(
          'inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest',
          'text-amber-600 dark:text-amber-400 hover:text-amber-500 transition-colors',
          className,
        )}
        title={`Unlock "${feature}" with FolioVault Pro`}
      >
        <Lock className="w-3 h-3" /> Pro
      </button>
    );
  }

  return (
    <div className={cn('relative', className)}>
      <div className="pointer-events-none opacity-40 blur-[2px] select-none">{children}</div>
      <div className="absolute inset-0 flex items-center justify-center z-10">
        <div className="bg-white/95 dark:bg-slate-900/95 border border-amber-500/30 rounded-2xl shadow-2xl px-6 py-5 max-w-sm text-center space-y-3 backdrop-blur-md">
          <div className="w-12 h-12 rounded-full bg-amber-500/10 flex items-center justify-center mx-auto">
            <Sparkles className="w-6 h-6 text-amber-500" />
          </div>
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-amber-600 dark:text-amber-400">
              Pro Feature
            </p>
            <p className="text-sm font-bold text-slate-900 dark:text-slate-100 mt-1">
              {feature}
            </p>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Upgrade to FolioVault Pro to unlock this and many more powerful analytics.
          </p>
          <button
            onClick={onUpgrade}
            className="w-full py-2 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-lg text-xs transition-colors shadow-sm"
          >
            Unlock with Pro
          </button>
        </div>
      </div>
    </div>
  );
}
