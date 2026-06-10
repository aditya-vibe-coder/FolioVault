import { useMemo } from 'react';
import { cn } from '../lib/formatters';
import type { Transaction } from '../types';

interface Props {
  transactions: Transaction[];
  compact?: boolean;
}

/**
 * GitHub-style contribution heatmap of investment activity.
 * Each cell represents one day; intensity is proportional to amount invested
 * that day (only inflow transactions count).
 */
export function ActivityHeatmap({ transactions, compact = false }: Props) {
  const { weeks, max, monthLabels } = useMemo(() => {
    // Build a map of date → total inflow
    const map = new Map<string, number>();
    transactions.forEach((t) => {
      if (!['buy', 'sip', 'switch_in', 'bonus', 'interest'].includes(t.type)) return;
      const d = new Date(t.date);
      const key = d.toISOString().split('T')[0];
      map.set(key, (map.get(key) ?? 0) + t.amount);
    });
    const max = Math.max(1, ...Array.from(map.values()));

    // 26 weeks × 7 days back from today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const start = new Date(today);
    start.setDate(start.getDate() - 26 * 7);
    // Align to Sunday
    start.setDate(start.getDate() - start.getDay());

    const weeks: { date: Date; value: number; key: string }[][] = [];
    const monthLabels: { month: string; col: number }[] = [];
    let lastMonth = -1;
    let cursor = new Date(start);
    let col = 0;
    while (cursor.getTime() <= today.getTime() + 7 * 86_400_000) {
      const week: typeof weeks[number] = [];
      for (let d = 0; d < 7; d++) {
        const dKey = cursor.toISOString().split('T')[0];
        const v = map.get(dKey) ?? 0;
        week.push({ date: new Date(cursor), value: v, key: dKey });
        cursor.setDate(cursor.getDate() + 1);
      }
      weeks.push(week);
      // Track month transitions for the header labels
      if (week[0].date.getMonth() !== lastMonth) {
        monthLabels.push({
          month: week[0].date.toLocaleDateString('en-IN', { month: 'short' }),
          col,
        });
        lastMonth = week[0].date.getMonth();
      }
      col++;
    }
    return { weeks, max, monthLabels };
  }, [transactions]);

  const cellSize = compact ? 9 : 13;
  const gap = 2;

  const intensity = (v: number) => {
    if (v === 0) return 0;
    if (max === 0) return 0;
    const r = v / max;
    if (r > 0.75) return 4;
    if (r > 0.5)  return 3;
    if (r > 0.25) return 2;
    return 1;
  };

  return (
    <div className="overflow-x-auto">
      <div className="inline-block min-w-full">
        {/* Month labels */}
        <div className="flex" style={{ marginLeft: 24, marginBottom: 2 }}>
          {monthLabels.map((m, i) => (
            <div
              key={i}
              className="text-[9px] font-bold text-slate-400"
              style={{ width: (cellSize + gap) * (m.col === 0 ? 0 : (monthLabels[i + 1]?.col ?? weeks.length) - m.col) - gap }}
            >
              {m.month}
            </div>
          ))}
        </div>
        <div className="flex gap-0.5">
          {/* Day labels */}
          <div className="flex flex-col mr-1" style={{ gap }}>
            {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
              <div key={i} className="text-[8px] text-slate-400 font-mono flex items-center" style={{ height: cellSize }}>
                {i % 2 === 0 ? d : ''}
              </div>
            ))}
          </div>
          {weeks.map((week, wi) => (
            <div key={wi} className="flex flex-col" style={{ gap }}>
              {week.map((cell) => {
                const lvl = intensity(cell.value);
                return (
                  <div
                    key={cell.key}
                    title={cell.value > 0 ? `${cell.key}: ₹${cell.value.toLocaleString('en-IN')}` : cell.key}
                    className={cn(
                      'rounded-sm transition-colors',
                      lvl === 0 && 'bg-slate-100 dark:bg-slate-800',
                      lvl === 1 && 'bg-emerald-500/20',
                      lvl === 2 && 'bg-emerald-500/40',
                      lvl === 3 && 'bg-emerald-500/60',
                      lvl === 4 && 'bg-emerald-500',
                      cell.date.getTime() > Date.now() && 'opacity-30',
                    )}
                    style={{ width: cellSize, height: cellSize }}
                  />
                );
              })}
            </div>
          ))}
        </div>
        <div className="flex items-center gap-1 mt-2 text-[9px] text-slate-400">
          <span>Less</span>
          {[0, 1, 2, 3, 4].map((l) => (
            <span
              key={l}
              className={cn(
                'rounded-sm',
                l === 0 && 'bg-slate-100 dark:bg-slate-800',
                l === 1 && 'bg-emerald-500/20',
                l === 2 && 'bg-emerald-500/40',
                l === 3 && 'bg-emerald-500/60',
                l === 4 && 'bg-emerald-500',
              )}
              style={{ width: cellSize, height: cellSize, display: 'inline-block' }}
            />
          ))}
          <span>More</span>
        </div>
      </div>
    </div>
  );
}
