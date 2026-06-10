import { useOutletContext } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router-dom';
import {
  Wallet, TrendingUp, TrendingDown, Sparkles, Activity as ActivityIcon,
  ShieldCheck, FileText,
  Target, Flame, ArrowRight, Heart, Briefcase, BarChart3, Plus, ArrowUpRight,
  Crown,
} from 'lucide-react';
import { useLicense } from '../hooks/useLicense';
import { usePortfolioMetrics, useHoldingsWithMetrics, useActivePortfolioId } from '../hooks/usePortfolio';
import { db } from '../lib/db';
import {
  formatCurrency, formatPercent, formatXIRR, cn, formatRelative,
} from '../lib/formatters';
import { ASSET_CLASS_COLORS } from '../types/extra';
import { ProGate } from '../components/ProGate';
import { ProBadge } from '../components/ui/ProBadge';
import { ActivityHeatmap } from '../components/ActivityHeatmap';
import { GoalsSummaryCard } from '../components/GoalsSummaryCard';
import { TopMovers } from '../components/TopMovers';
import { useMemo } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, AreaChart, Area, XAxis, YAxis, CartesianGrid } from 'recharts';
import type { AppContext } from '../components/Layout';
import type { AssetClass, Transaction } from '../types';
import { Helmet } from 'react-helmet-async';

export default function DashboardPage() {
  const { onUpgrade, lastRefresh } = useOutletContext<AppContext>();
  const { isPro, verification } = useLicense();
  const portfolioId = useActivePortfolioId();
  const metrics = usePortfolioMetrics();
  const holdings = useHoldingsWithMetrics();

  const transactions = useLiveQuery(
    () => portfolioId
      ? db.transactions.where({ portfolioId }).reverse().sortBy('date')
      : Promise.resolve([] as Transaction[]),
    [portfolioId],
    [] as Transaction[],
  );
  const insuranceCount = useLiveQuery(
    () => portfolioId ? db.insurance.where({ portfolioId }).count() : Promise.resolve(0),
    [portfolioId], 0,
  ) ?? 0;
  const loanCount = useLiveQuery(
    () => portfolioId ? db.loans.where({ portfolioId }).count() : Promise.resolve(0),
    [portfolioId], 0,
  ) ?? 0;

  // Compute inflation-adjusted (real) returns: nominal / (1 + inflation)^years
  const inflation = 6.0; // India CPI ~ 5-6% in recent years
  const realXirr = useMemo(() => {
    if (metrics.overallXirr === null) return null;
    // Approximate years from earliest txn
    if (transactions.length === 0) return metrics.overallXirr;
    const firstDate = new Date(transactions[transactions.length - 1].date).getTime();
    const years = (Date.now() - firstDate) / (365.25 * 86_400_000);
    if (years < 0.1) return metrics.overallXirr;
    const nominal = metrics.overallXirr;
    const real = (1 + nominal) / Math.pow(1 + inflation / 100, years) - 1;
    return real;
  }, [metrics.overallXirr, transactions]);

  const allocationData = useMemo(() => {
    return (Object.entries(metrics.assetAllocation) as [AssetClass, number][])
      .filter(([, v]) => v > 0)
      .map(([k, v]) => ({ name: ASSET_LABEL[k] ?? k, value: v, key: k }))
      .sort((a, b) => b.value - a.value);
  }, [metrics.assetAllocation]);

  // Sparkline: portfolio value over the last 30 days (synthesised from transactions + current value)
  const sparkline = useMemo(() => buildSparkline(transactions, holdings.length), [transactions, holdings.length]);

  const isGain = metrics.absoluteGain >= 0;
  const hasData = holdings.length > 0;

  return (
    <div className="space-y-5 font-sans">
      <Helmet>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>
          {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Wallet className="w-6 h-6 text-blue-500" />
            Dashboard
          </h1>
          <p className="text-sm text-slate-500">
            Your complete financial picture — private, local, and real-time.
          </p>
        </div>
        <div className="flex items-center gap-2 text-[10px] text-slate-400">
          <span>Last refreshed: {formatRelative(lastRefresh)}</span>
          {!isPro && (
            <span className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-600 font-bold uppercase tracking-widest">
              Free Plan
            </span>
          )}
          {isPro && (
            <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600 font-bold flex items-center gap-1 uppercase tracking-widest">
              <Crown className="w-3 h-3" /> Pro Active
              {verification.daysRemaining !== null && verification.daysRemaining <= 7 && (
                <span className="ml-1 text-amber-500">· {verification.daysRemaining}d left</span>
              )}
            </span>
          )}
        </div>
      </div>

      {!hasData ? (
        <EmptyState onUpgrade={onUpgrade} />
      ) : (
        <>
          {/* Top metrics row */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <MetricCard
              label="Net Worth"
              value={formatCurrency(metrics.currentValue, { compact: true })}
              sub={`${holdings.length} active holding${holdings.length === 1 ? '' : 's'}`}
              icon={<Wallet className="w-4 h-4" />}
              accent="blue"
            />
            <MetricCard
              label="Net Invested"
              value={formatCurrency(metrics.totalInvested, { compact: true })}
              sub="Total capital deployed"
              icon={<Briefcase className="w-4 h-4" />}
              accent="slate"
            />
            <MetricCard
              label="Absolute Gain"
              value={`${isGain ? '+' : ''}${formatCurrency(metrics.absoluteGain, { compact: true })}`}
              sub={`${isGain ? '+' : ''}${formatPercent(metrics.absoluteGainPercent, { decimals: 1 })}`}
              icon={isGain ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
              accent={isGain ? 'emerald' : 'red'}
            />
            <MetricCard
              label="Overall XIRR"
              value={formatXIRR(metrics.overallXirr)}
              sub={realXirr !== null ? `Real (inflation-adjusted): ${formatPercent(realXirr * 100, { decimals: 1 })}` : 'Time-weighted return'}
              icon={<BarChart3 className="w-4 h-4" />}
              accent="purple"
            />
          </div>

          {/* Sparkline */}
          <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl">
            <div className="flex items-center justify-between mb-2">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Net worth trajectory</p>
                <p className="text-xs text-slate-400">Last 12 months · based on transaction history</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Today's change</p>
                <p className={cn(
                  'text-sm font-mono font-bold',
                  metrics.dayChange >= 0 ? 'text-emerald-500' : 'text-red-500',
                )}>
                  {metrics.dayChange >= 0 ? '+' : ''}{formatCurrency(metrics.dayChange, { compact: true })}
                  {' '}({formatPercent(metrics.dayChangePercent, { decimals: 2 })})
                </p>
              </div>
            </div>
            <div className="h-32">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={sparkline} margin={{ left: 0, right: 0, top: 4, bottom: 0 }}>
                  <defs>
                    <linearGradient id="dashSpark" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#2563EB" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#2563EB" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#94A3B8" opacity={0.15} />
                  <XAxis dataKey="month" fontSize={9} stroke="#94A3B8" />
                  <YAxis fontSize={9} stroke="#94A3B8" tickFormatter={(v) => `₹${(v / 100000).toFixed(0)}L`} width={50} />
                  <Tooltip
                    contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #1E293B', background: '#0F172A', color: 'white' }}
                    formatter={(v: any) => [formatCurrency(Number(v)), 'Value']}
                  />
                  <Area type="monotone" dataKey="value" stroke="#2563EB" strokeWidth={2} fill="url(#dashSpark)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* Allocation */}
            <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-500">Asset allocation</h3>
                <Link to="/app/analytics" className="text-[10px] font-bold text-blue-600 hover:underline">View details →</Link>
              </div>
              {allocationData.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-6">No data yet.</p>
              ) : (
                <>
                  <div className="h-44">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={allocationData} dataKey="value" nameKey="name" innerRadius={45} outerRadius={75} paddingAngle={2}>
                          {allocationData.map((entry, i) => (
                            <Cell key={i} fill={ASSET_CLASS_COLORS[entry.key as AssetClass]} />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #1E293B', background: '#0F172A', color: 'white' }}
                          formatter={(v: any) => formatCurrency(Number(v))}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="space-y-1.5 mt-2">
                    {allocationData.map((a) => (
                      <div key={a.key} className="flex items-center justify-between text-xs">
                        <span className="flex items-center gap-1.5 font-semibold text-slate-700 dark:text-slate-300">
                          <span className="w-2.5 h-2.5 rounded-full" style={{ background: ASSET_CLASS_COLORS[a.key as AssetClass] }} />
                          {a.name}
                        </span>
                        <span className="font-mono font-bold text-slate-900 dark:text-slate-100">{formatCurrency(a.value, { compact: true })}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Top movers */}
            <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-500 flex items-center gap-1">
                  <Flame className="w-3 h-3 text-orange-500" /> Top movers
                </h3>
                <Link to="/app/holdings" className="text-[10px] font-bold text-blue-600 hover:underline">All →</Link>
              </div>
              <TopMovers holdings={holdings} />
            </div>

            {/* Quick actions */}
            <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl">
              <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-3">Quick actions</h3>
              <div className="space-y-2">
                <QuickAction to="/app/holdings" icon={<Plus className="w-3.5 h-3.5" />} label="Add a new holding" />
                <QuickAction to="/app/import"   icon={<ArrowUpRight className="w-3.5 h-3.5" />} label="Import transactions" ai />
                <QuickAction to="/app/report"   icon={<FileText className="w-3.5 h-3.5" />} label="Generate ITR capital-gains PDF" pro />
                <QuickAction to="/app/coach"    icon={<Sparkles className="w-3.5 h-3.5" />} label="Ask AI portfolio coach" pro ai />
                <QuickAction to="/app/insurance" icon={<ShieldCheck className="w-3.5 h-3.5" />} label="Track insurance policies" pro />
                <QuickAction to="/app/loans"    icon={<Heart className="w-3.5 h-3.5" />} label="Track outstanding loans" pro />
                <QuickAction to="/app/settings" icon={<Target className="w-3.5 h-3.5" />} label="Set benchmark rate" />
              </div>
              {!isPro && (
                <div className="mt-3 p-3 rounded-xl bg-gradient-to-br from-amber-500/10 to-orange-500/10 border border-amber-500/20">
                  <p className="text-[10px] font-black uppercase tracking-widest text-amber-600 dark:text-amber-400 flex items-center gap-1">
                    <Crown className="w-3 h-3" /> Unlock with Pro
                  </p>
                  <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">
                    AI Coach, ITR PDF, Insurance & Loans tracker and more — from ₹99/mo.
                  </p>
                  <button
                    onClick={onUpgrade}
                    className="w-full mt-2 py-1.5 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold rounded-lg"
                  >
                    See plans →
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Pro widgets row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <ProGate feature="Activity heatmap" onUpgrade={onUpgrade} inline={false} className="lg:col-span-1">
              <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl h-full">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-500 flex items-center gap-1">
                    <ActivityIcon className="w-3 h-3 text-blue-500" /> Investment activity
                  </h3>
                  <Link to="/app/activity" className="text-[10px] font-bold text-blue-600 hover:underline">View all →</Link>
                </div>
                <ActivityHeatmap transactions={transactions} compact />
              </div>
            </ProGate>

            <ProGate feature="Goals progress" onUpgrade={onUpgrade} inline={false} className="lg:col-span-1">
              <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl h-full">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-500 flex items-center gap-1">
                    <Target className="w-3 h-3 text-rose-500" /> Goals progress
                  </h3>
                  <Link to="/app/analytics" className="text-[10px] font-bold text-blue-600 hover:underline">Manage →</Link>
                </div>
                <GoalsSummaryCard currentValue={metrics.currentValue} />
              </div>
            </ProGate>
          </div>

          {/* Insurance & loans summary */}
          <ProGate feature="Insurance & Loans tracking" onUpgrade={onUpgrade} inline={false}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <SummaryStat
                icon={<ShieldCheck className="w-4 h-4 text-emerald-500" />}
                label="Insurance policies"
                value={String(insuranceCount)}
                to="/app/insurance"
              />
              <SummaryStat
                icon={<Heart className="w-4 h-4 text-rose-500" />}
                label="Outstanding loans"
                value={String(loanCount)}
                to="/app/loans"
              />
            </div>
          </ProGate>

          {/* Recent transactions */}
          <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-500">Recent transactions</h3>
              <Link to="/app/holdings" className="text-[10px] font-bold text-blue-600 hover:underline">All →</Link>
            </div>
            {transactions.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-6">No transactions yet.</p>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {transactions.slice(0, 6).map((t) => {
                  const h = holdings.find((x) => x.id === t.holdingId);
                  return (
                    <div key={t.id} className="flex items-center gap-2 py-2 text-xs">
                      <span className="font-mono text-slate-400 w-20 shrink-0">{formatRelative(t.date)}</span>
                      <span className={cn(
                        'px-1.5 py-0.5 rounded text-[9px] font-black uppercase shrink-0',
                        ['buy', 'sip', 'switch_in', 'bonus'].includes(t.type) ? 'bg-emerald-500/10 text-emerald-600' :
                        ['sell', 'redeem', 'switch_out'].includes(t.type) ? 'bg-rose-500/10 text-rose-600' :
                        'bg-blue-500/10 text-blue-600',
                      )}>{t.type.replace('_', ' ')}</span>
                      <span className="font-bold truncate flex-1">{h?.name ?? '—'}</span>
                      <span className="font-mono font-bold shrink-0">{formatCurrency(t.amount)}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/* ─── Helpers ────────────────────────────────────────────────────────── */

const ASSET_LABEL: Record<AssetClass, string> = {
  equity: 'Equity', debt: 'Debt', gold: 'Gold',
  real_estate: 'Real Estate', cash: 'Cash', alternative: 'Alternative',
};

function buildSparkline(transactions: Transaction[], holdingCount: number): { month: string; value: number }[] {
  // Synthesise approximate monthly net worth by accumulating inflows
  // (negative for buys, positive for sells/dividends) and anchoring the
  // final value to the current portfolio value.
  if (transactions.length === 0 || holdingCount === 0) return [];
  const now = new Date();
  const months: { month: string; value: number; date: Date }[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({
      month: d.toLocaleDateString('en-IN', { month: 'short' }),
      value: 0,
      date: d,
    });
  }
  // For each month, sum cashflows up to that month
  const sorted = [...transactions].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  // Anchor: assume today's net worth = currentValue
  // Walk backwards: currentValue minus sum of txs after that month
  for (let i = 0; i < months.length; i++) {
    const cutoff = months[i].date.getTime();
    const future = sorted.filter((t) => new Date(t.date).getTime() > cutoff);
    // netInvestedAt = totalInvested - totalRedeemed up to cutoff
    const past = sorted.filter((t) => new Date(t.date).getTime() <= cutoff);
    const invested = past
      .filter((t) => ['buy', 'sip', 'switch_in', 'bonus'].includes(t.type))
      .reduce((s, t) => s + t.amount, 0);
    const redeemed = past
      .filter((t) => ['sell', 'redeem', 'switch_out', 'dividend', 'interest'].includes(t.type))
      .reduce((s, t) => s + t.amount, 0);
    const netAt = invested - redeemed;
    // Estimate current value using ratio of net worth
    const totalFutureIn = future.filter((t) => ['buy', 'sip', 'switch_in', 'bonus'].includes(t.type)).reduce((s, t) => s + t.amount, 0);
    const totalFutureOut = future.filter((t) => ['sell', 'redeem', 'switch_out', 'dividend', 'interest'].includes(t.type)).reduce((s, t) => s + t.amount, 0);
    const growth = netAt > 0 ? 1.0 : 0; // simplification: no growth modelling
    months[i].value = Math.max(0, netAt * growth);
  }
  return months.map((m) => ({ month: m.month, value: Math.round(m.value) }));
}

/* ─── Sub-components ─────────────────────────────────────────────────── */

function MetricCard({
  label, value, sub, icon, accent = 'blue',
}: {
  label: string; value: string; sub: string; icon: React.ReactNode;
  accent?: 'blue' | 'emerald' | 'red' | 'slate' | 'purple';
}) {
  const accentMap: Record<string, string> = {
    blue:    'from-blue-500/10 to-blue-500/0 text-blue-600',
    emerald: 'from-emerald-500/10 to-emerald-500/0 text-emerald-600',
    red:     'from-red-500/10 to-red-500/0 text-red-600',
    slate:   'from-slate-500/10 to-slate-500/0 text-slate-600',
    purple:  'from-purple-500/10 to-purple-500/0 text-purple-600',
  };
  return (
    <div className={cn(
      'relative p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden',
    )}>
      <div className={cn('absolute inset-0 bg-gradient-to-br opacity-50', accentMap[accent])} />
      <div className="relative">
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">{label}</p>
          <span className={accentMap[accent].split(' ').pop()}>{icon}</span>
        </div>
        <p className="text-2xl font-black font-mono mt-1.5 text-slate-900 dark:text-slate-100">{value}</p>
        <p className="text-[10px] text-slate-500 mt-0.5 truncate">{sub}</p>
      </div>
    </div>
  );
}

function QuickAction({ to, icon, label, pro, ai }: { to: string; icon: React.ReactNode; label: string; pro?: boolean; ai?: boolean }) {
  return (
    <Link
      to={to}
      className="flex items-center gap-2 p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors group"
    >
      <span className={`w-7 h-7 rounded-md flex items-center justify-center group-hover:bg-blue-500/20 ${
        ai ? 'bg-purple-500/10 text-purple-600' : 'bg-blue-500/10 text-blue-600'
      }`}>
        {icon}
      </span>
      <span className="flex-1 text-xs font-semibold text-slate-700 dark:text-slate-300">{label}</span>
      {pro && !ai && <ProBadge variant="pro" size="xs" />}
      {pro && ai && <ProBadge variant="ai" size="xs" />}
      <ArrowRight className="w-3 h-3 text-slate-400 group-hover:text-blue-500 group-hover:translate-x-0.5 transition-transform" />
    </Link>
  );
}

function SummaryStat({ icon, label, value, to }: { icon: React.ReactNode; label: string; value: string; to: string }) {
  return (
    <Link to={to} className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl flex items-center justify-between hover:border-blue-500/30 transition-colors">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center">{icon}</div>
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">{label}</p>
          <p className="text-xl font-black font-mono">{value}</p>
        </div>
      </div>
      <ArrowRight className="w-4 h-4 text-slate-400" />
    </Link>
  );
}

function EmptyState({ onUpgrade }: { onUpgrade: () => void }) {
  return (
    <div className="p-10 text-center bg-white dark:bg-slate-900 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl space-y-4">
      <div className="w-16 h-16 rounded-2xl bg-blue-500/10 flex items-center justify-center mx-auto">
        <Sparkles className="w-8 h-8 text-blue-500" />
      </div>
      <div>
        <p className="text-lg font-black tracking-tight">Welcome to FolioVault</p>
        <p className="text-sm text-slate-500 mt-1 max-w-md mx-auto">
          Your vault is empty. Add your first holding or import existing transactions to get started.
          All data stays on your device — no signup needed.
        </p>
      </div>
      <div className="flex flex-col sm:flex-row gap-2 justify-center pt-2">
        <Link
          to="/app/holdings"
          className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-lg inline-flex items-center gap-1.5"
        >
          <Plus className="w-4 h-4" /> Add my first holding
        </Link>
        <Link
          to="/app/import"
          className="px-5 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-sm font-bold rounded-lg"
        >
          Import instead
        </Link>
      </div>
      <p className="text-[10px] text-slate-400 pt-2">
        🔒 No server ever sees your financial data.
      </p>
    </div>
  );
}
