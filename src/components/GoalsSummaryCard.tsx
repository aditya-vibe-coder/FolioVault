import { useState, useEffect } from 'react';
import { Target, Flame, CheckCircle2 } from 'lucide-react';
import { formatCurrency } from '../lib/formatters';

interface Goal {
  id: string;
  name: string;
  targetAmount: number;
  targetYear: number;
  allocatedPercentage: number;
  priority: 'High' | 'Medium' | 'Low';
  expectedReturn: number;
  isDefault?: boolean;
}

const STORAGE_KEY = 'fv_ultimate_goals_v1';

const DEFAULT_GOALS: Goal[] = [
  { id: '1', name: 'Retirement (FIRE)', targetAmount: 50_000_000, targetYear: 2045, allocatedPercentage: 50, priority: 'High', expectedReturn: 12, isDefault: true },
  { id: '2', name: 'Home Down-Payment',  targetAmount:  3_500_000, targetYear: 2032, allocatedPercentage: 30, priority: 'Medium', expectedReturn: 9,  isDefault: true },
];

export function GoalsSummaryCard({ currentValue }: { currentValue: number }) {
  const [goals] = useState<Goal[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) return JSON.parse(saved);
    } catch { /* ignore */ }
    return DEFAULT_GOALS;
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(goals));
  }, [goals]);

  if (goals.length === 0) {
    return (
      <div className="text-center py-4">
        <Target className="w-8 h-8 mx-auto text-slate-300 dark:text-slate-700" />
        <p className="text-xs text-slate-400 mt-2">No goals yet. Add them from Analytics → Milestones Map.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {goals.slice(0, 3).map((g) => {
        const linked = (g.allocatedPercentage / 100) * currentValue;
        const pct = Math.min(100, (linked / g.targetAmount) * 100);
        const isComplete = pct >= 100;
        const yearsRem = Math.max(1, g.targetYear - new Date().getFullYear());
        const r = g.expectedReturn / 12 / 100;
        const n = yearsRem * 12;
        const denom = Math.pow(1 + r, n) - 1;
        const shortfall = Math.max(0, g.targetAmount - linked);
        const sip = denom > 0 ? (shortfall * r) / denom : 0;

        return (
          <div key={g.id} className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold flex items-center gap-1.5 truncate">
                {isComplete ? (
                  <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />
                ) : g.priority === 'High' ? (
                  <Flame className="w-3 h-3 text-rose-500 shrink-0" />
                ) : (
                  <Target className="w-3 h-3 text-amber-500 shrink-0" />
                )}
                {g.name}
              </span>
              <span className="font-mono text-slate-500 shrink-0">
                {pct.toFixed(0)}%
              </span>
            </div>
            <div className="h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
              <div
                className={
                  isComplete ? 'h-full bg-emerald-500' :
                  g.priority === 'High' ? 'h-full bg-rose-500' :
                  g.priority === 'Medium' ? 'h-full bg-amber-500' :
                  'h-full bg-blue-500'
                }
                style={{ width: `${pct}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-[10px] text-slate-500">
              <span>{formatCurrency(linked, { compact: true })} of {formatCurrency(g.targetAmount, { compact: true })}</span>
              {!isComplete && <span className="font-mono">~₹{Math.round(sip).toLocaleString('en-IN')}/mo</span>}
            </div>
          </div>
        );
      })}
      {goals.length > 3 && (
        <p className="text-[10px] text-slate-400 text-center">+{goals.length - 3} more</p>
      )}
    </div>
  );
}
