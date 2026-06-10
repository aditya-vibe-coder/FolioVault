import { ShieldCheck } from 'lucide-react';
import { cn } from '../../lib/formatters';

interface PrivacyBadgeProps {
  className?: string;
  label?: string;
}

export function PrivacyBadge({ className, label = 'Private by Design' }: PrivacyBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold tracking-wider uppercase',
        'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20',
        className,
      )}
      title="All data is stored locally in your browser. No servers see your holdings."
    >
      <ShieldCheck className="w-3 h-3" />
      {label}
    </span>
  );
}
