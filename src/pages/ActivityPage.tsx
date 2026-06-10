import { useOutletContext } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { useState, useMemo } from 'react';
import { Activity as ActivityIcon, Filter, Calendar, Crown } from 'lucide-react';
import { useActivePortfolioId } from '../hooks/usePortfolio';
import { useLicense } from '../hooks/useLicense';
import { db } from '../lib/db';
import { ActivityHeatmap } from '../components/ActivityHeatmap';
import { ProBadge } from '../components/ui/ProBadge';
import { formatCurrency, formatDate, cn } from '../lib/formatters';
import type { AppContext } from '../components/Layout';
import type { Transaction, TransactionType } from '../types';
import { Helmet } from 'react-helmet-async';

const TX_TYPES: TransactionType[] = [
  'buy', 'sell', 'sip', 'redeem', 'switch_in', 'switch_out',
  'dividend', 'bonus', 'interest',
];

export default function ActivityPage() {
  const { onUpgrade } = useOutletContext<AppContext>();
  const { isPro } = useLicense();
  const portfolioId = useActivePortfolioId();
  const transactions = useLiveQuery(
    () => portfolioId
      ? db.transactions.where({ portfolioId }).reverse().sortBy('date')
      : Promise.resolve([] as Transaction[]),
    [portfolioId],
    [] as Transaction[],
  );

  const [filterType, setFilterType] = useState<TransactionType | 'all'>('all');
  const [year, setYear] = useState<number | 'all'>('all');

  const years = useMemo(() => {
    const set = new Set<number>();
    transactions.forEach((t) => set.add(new Date(t.date).getFullYear()));
    return Array.from(set).sort((a, b) => b - a);
  }, [transactions]);

  const filtered = useMemo(() => {
    return transactions.filter((t) => {
      if (filterType !== 'all' && t.type !== filterType) return false;
      if (year !== 'all' && new Date(t.date).getFullYear() !== year) return false;
      return true;
    });
  }, [transactions, filterType, year]);

  // Stats
  const stats = useMemo(() => {
    let totalIn = 0, totalOut = 0;
    filtered.forEach((t) => {
      if (['buy', 'sip', 'switch_in', 'bonus'].includes(t.type)) totalIn += t.amount;
      else if (['sell', 'redeem', 'switch_out', 'dividend', 'interest'].includes(t.type)) totalOut += t.amount;
    });
    return { totalIn, totalOut, count: filtered.length };
  }, [filtered]);

  if (!isPro) {
    return (
      <ProLockedPage
        feature="Activity Heatmap & Ledger"
        description="Visualize every buy, SIP, and redemption on a 12-month heatmap. Spot patterns in your investing behaviour at a glance."
        onUpgrade={onUpgrade}
        icon={<ActivityIcon className="w-6 h-6 text-blue-500" />}
      />
    );
  }

  return (
    <div className="space-y-5 font-sans">
      <Helmet>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>
          <div>
        <h1 className="text-2xl font-black tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-2">
          <ActivityIcon className="w-6 h-6 text-blue-500" />
          Activity
        </h1>
        <p className="text-sm text-slate-500">Visualize your investment behaviour over time.</p>
      </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          <div className="p-3 bg-emerald-500/5 border border-emerald-500/10 rounded-xl">
            <p className="text-[10px] font-black uppercase tracking-widest text-emerald-600">Total invested</p>
            <p className="text-lg font-black font-mono text-emerald-600">{formatCurrency(stats.totalIn, { compact: true })}</p>
          </div>
          <div className="p-3 bg-rose-500/5 border border-rose-500/10 rounded-xl">
            <p className="text-[10px] font-black uppercase tracking-widest text-rose-600">Total received</p>
            <p className="text-lg font-black font-mono text-rose-600">{formatCurrency(stats.totalOut, { compact: true })}</p>
          </div>
          <div className="p-3 bg-blue-500/5 border border-blue-500/10 rounded-xl">
            <p className="text-[10px] font-black uppercase tracking-widest text-blue-600">Transactions</p>
            <p className="text-lg font-black font-mono text-blue-600">{stats.count}</p>
          </div>
        </div>

        {/* Heatmap */}
        <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl">
          <h3 className="text-sm font-black uppercase tracking-tight mb-3">Investment activity heatmap</h3>
          <ActivityHeatmap transactions={filtered} />
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="flex items-center gap-2 flex-1">
            <Filter className="w-4 h-4 text-slate-400" />
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value as any)}
              className="flex-1 sm:flex-initial px-3 py-2 border border-slate-200 dark:border-slate-800 rounded-lg bg-white dark:bg-slate-900 text-sm font-semibold"
            >
              <option value="all">All transaction types</option>
              {TX_TYPES.map((t) => (
                <option key={t} value={t}>{t.replace('_', ' ').toUpperCase()}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2 flex-1">
            <Calendar className="w-4 h-4 text-slate-400" />
            <select
              value={year}
              onChange={(e) => setYear(e.target.value === 'all' ? 'all' : parseInt(e.target.value))}
              className="flex-1 sm:flex-initial px-3 py-2 border border-slate-200 dark:border-slate-800 rounded-lg bg-white dark:bg-slate-900 text-sm font-semibold"
            >
              <option value="all">All years</option>
              {years.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Full ledger */}
        <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl">
          <h3 className="text-sm font-black uppercase tracking-tight mb-3">Full ledger ({filtered.length} entries)</h3>
          {filtered.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-6">No transactions match the filters.</p>
          ) : (
            <div className="space-y-1 max-h-[600px] overflow-y-auto">
              {filtered.map((t) => (
                <div key={t.id} className="flex items-center gap-2 p-2 rounded hover:bg-slate-50 dark:hover:bg-slate-800/50 text-xs">
                  <span className="font-mono text-slate-400 w-24 shrink-0">{formatDate(t.date)}</span>
                  <span className={cn(
                    'px-1.5 py-0.5 rounded text-[9px] font-black uppercase shrink-0',
                    ['buy', 'sip', 'switch_in', 'bonus'].includes(t.type) ? 'bg-emerald-500/10 text-emerald-600' :
                    ['sell', 'redeem', 'switch_out'].includes(t.type) ? 'bg-rose-500/10 text-rose-600' :
                    'bg-blue-500/10 text-blue-600',
                  )}>{t.type.replace('_', ' ')}</span>
                  {t.units !== undefined && t.units !== null && (
                    <span className="font-mono text-slate-600 dark:text-slate-300">{t.units.toLocaleString('en-IN', { maximumFractionDigits: 4 })} u</span>
                  )}
                  {t.price > 0 && (
                    <span className="font-mono text-slate-500">@ {formatCurrency(t.price, { decimals: t.price < 100 ? 4 : 2 })}</span>
                  )}
                  <span className="font-mono font-bold ml-auto">{formatCurrency(t.amount)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
    </div>
  );
}

/* ─── Pro-locked landing ────────────────────────────────────────────── */
function ProLockedPage({
  feature, description, onUpgrade, icon,
}: { feature: string; description: string; onUpgrade: () => void; icon: React.ReactNode }) {
  return (
    <div className="max-w-2xl mx-auto py-10">
      <div className="p-8 bg-gradient-to-br from-amber-500/10 via-orange-500/5 to-transparent border border-amber-500/20 rounded-2xl text-center space-y-4">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center text-white mx-auto shadow-lg shadow-amber-500/20">
          {icon}
        </div>
        <div className="flex justify-center">
          <ProBadge variant="pro" size="md" label="Pro Feature" />
        </div>
        <h2 className="text-2xl font-black tracking-tight text-slate-900 dark:text-slate-100">
          {feature}
        </h2>
        <p className="text-sm text-slate-600 dark:text-slate-300 max-w-md mx-auto">
          {description}
        </p>
        <div className="flex flex-col sm:flex-row gap-2 justify-center pt-2">
          <button
            onClick={onUpgrade}
            className="px-6 py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-bold rounded-lg text-sm shadow-lg shadow-amber-500/20 inline-flex items-center justify-center gap-1.5"
          >
            <Crown className="w-4 h-4" /> Unlock with Pro
          </button>
          <a
            href="/"
            className="px-6 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-sm font-bold rounded-lg"
          >
            Learn more
          </a>
        </div>
        <p className="text-[10px] text-slate-400 pt-2">
          Already have a key? Open <a href="/app/settings" className="text-blue-500 hover:underline">Settings → License</a>.
        </p>
      </div>
    </div>
  );
}
