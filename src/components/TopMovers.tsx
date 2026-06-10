import { TrendingUp, TrendingDown } from 'lucide-react';
import { formatCurrency, formatPercent, cn } from '../lib/formatters';
import { HOLDING_TYPE_COLORS } from '../types/extra';
import type { HoldingWithMetrics } from '../types';

interface Props {
  holdings: HoldingWithMetrics[];
  limit?: number;
}

export function TopMovers({ holdings, limit = 5 }: Props) {
  const active = holdings.filter((h) => h.isActive && h.currentValue > 0);
  if (active.length === 0) {
    return <p className="text-xs text-slate-400 text-center py-6">No active holdings yet.</p>;
  }

  const gainers = [...active].sort((a, b) => b.absoluteGainPercent - a.absoluteGainPercent).slice(0, limit);
  const losers  = [...active].sort((a, b) => a.absoluteGainPercent - b.absoluteGainPercent).slice(0, limit);

  const top = [...gainers.slice(0, 3), ...losers.slice(0, 2)].slice(0, limit);

  return (
    <div className="space-y-2">
      {top.map((h) => {
        const isUp = h.absoluteGainPercent >= 0;
        return (
          <div key={h.id} className="flex items-center gap-2 p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
            <div className="w-1 h-8 rounded-full" style={{ background: HOLDING_TYPE_COLORS[h.type] ?? '#64748B' }} />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold truncate">{h.name}</p>
              <p className="text-[10px] text-slate-400">{formatCurrency(h.currentValue, { compact: true })} · {h.aggregates.transactionCount} tx</p>
            </div>
            <div className="text-right">
              <p className={cn(
                'text-xs font-mono font-bold flex items-center gap-0.5 justify-end',
                isUp ? 'text-emerald-500' : 'text-red-500',
              )}>
                {isUp ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                {isUp ? '+' : ''}{formatPercent(h.absoluteGainPercent, { decimals: 1 })}
              </p>
              {h.xirr !== null && (
                <p className="text-[10px] text-slate-400 font-mono">XIRR {formatPercent(h.xirr * 100, { decimals: 1 })}</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
