import { useState, useMemo, useEffect } from 'react';
import { Outlet, NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Briefcase,
  Upload,
  BarChart3,
  FileText,
  Sparkles,
  Settings as SettingsIcon,
  Crown,
  Menu,
  X,
  RefreshCw,
  Sun,
  Moon,
  Laptop,
  Activity,
} from 'lucide-react';
import { useAppStore, applyTheme } from '../store/appStore';
import { useLicense } from '../hooks/useLicense';
import { usePriceRefresher } from '../hooks/usePortfolio';
import { UpgradeModal } from './UpgradeModal';
import { PrivacyBadge } from './ui/PrivacyBadge';
import { ProBadge } from './ui/ProBadge';
import { cn, formatRelative } from '../lib/formatters';
import { db } from '../lib/db';
import type { Holding } from '../types';

export interface AppContext {
  onUpgrade: () => void;
  refreshPrices: () => Promise<void>;
  lastRefresh: Date;
}

const NAV = [
  { to: '/app/dashboard',  label: 'Dashboard',   icon: LayoutDashboard },
  { to: '/app/holdings',   label: 'Holdings',    icon: Briefcase,      pro: false },
  { to: '/app/import',     label: 'Import',      icon: Upload,         badge: 'ai' as const },
  { to: '/app/analytics',  label: 'Analytics',   icon: BarChart3,      pro: false },
  { to: '/app/report',     label: 'ITR Report',  icon: FileText,       pro: true },
  { to: '/app/coach',      label: 'AI Coach',    icon: Sparkles,       pro: true, ai: true },
  { to: '/app/activity',   label: 'Activity',    icon: Activity,       pro: true },
  { to: '/app/settings',   label: 'Settings',    icon: SettingsIcon },
];

export function Layout() {
  const { isPro, licenseKey, verification } = useLicense();
  const setSettings = useAppStore((s) => s.setSettings);
  const settings = useAppStore((s) => s.settings);
  const activePortfolioId = useAppStore((s) => s.activePortfolioId);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const location = useLocation();
  const { setSymbols, refresh } = usePriceRefresher();

  // Apply theme on mount + on change (the store's setSettings already does
  // this, but we keep a belt-and-braces call here so direct renders also
  // pick up the right palette).
  useEffect(() => {
    applyTheme(settings.theme);
  }, [settings.theme]);

  // When the user has chosen "system", follow the OS-level preference live.
  useEffect(() => {
    if (settings.theme !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => applyTheme('system');
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [settings.theme]);

  // Cross-tab sync: when the user toggles theme in another tab, pick it up.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'fv_theme' && e.newValue) {
        applyTheme(e.newValue as 'light' | 'dark' | 'system');
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // Set up the symbols set for the price refresher (passed via outlet)
  useEffect(() => {
    let alive = true;
    (async () => {
      const holdings = activePortfolioId
        ? await db.holdings.where({ portfolioId: activePortfolioId }).toArray()
        : await db.holdings.toArray();
      if (!alive) return;
      const symbols = (holdings as Holding[])
        .map((h) => {
          if (h.type === 'mf' && h.symbol) return h.symbol;
          if ((h.type === 'stock' || h.type === 'etf' || h.type === 'us_stock') && h.symbol) return h.symbol;
          return null;
        })
        .filter(Boolean) as string[];
      setSymbols(symbols);
    })();
    return () => {
      alive = false;
    };
  }, [activePortfolioId, setSymbols]);

  // Periodically bump lastRefresh
  useEffect(() => {
    const t = setInterval(() => setLastRefresh(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  const handleRefresh = async () => {
    setLastRefresh(new Date());
    await refresh();
  };

  const onUpgrade = () => setUpgradeOpen(true);

  const contextValue = useMemo<AppContext>(
    () => ({ onUpgrade, refreshPrices: handleRefresh, lastRefresh }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lastRefresh],
  );

  // Close sidebar on route change
  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  const handleTheme = (t: 'light' | 'dark' | 'system') => setSettings({ theme: t });

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans">
      {/* ─── Mobile top bar ─── */}
      <header className="lg:hidden sticky top-0 z-30 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 h-14 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-md bg-blue-600 flex items-center justify-center text-white text-xs font-bold">FV</div>
          <span className="text-sm font-bold">FolioVault</span>
        </div>
        <button
          onClick={() => setSidebarOpen(true)}
          className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          <Menu className="w-5 h-5" />
        </button>
      </header>

      {/* ─── Sidebar (desktop) ─── */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 w-64 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col',
          'transition-transform duration-200',
          'lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-md bg-blue-600 flex items-center justify-center text-white text-sm font-bold">FV</div>
            <div>
              <p className="text-sm font-black tracking-tight">FolioVault</p>
              <PrivacyBadge label="Private" className="text-[9px] !px-1.5 !py-0" />
            </div>
          </div>
          <button
            className="lg:hidden p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800"
            onClick={() => setSidebarOpen(false)}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {NAV.map((item) => {
            const Icon = item.icon;
            const showProBadge = (item.pro || item.badge) && !isPro;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    'flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-sm font-semibold transition-colors',
                    isActive
                      ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <span className="flex items-center gap-2.5 min-w-0">
                      <Icon className={cn('w-4 h-4 shrink-0', item.ai && 'text-purple-500')} />
                      <span className="truncate">{item.label}</span>
                    </span>
                    {showProBadge && (
                      <ProBadge
                        variant={item.ai ? 'ai' : 'pro'}
                        size="xs"
                        className="shrink-0"
                      />
                    )}
                    {isActive && <span className="w-1 h-4 rounded-full bg-blue-500" />}
                  </>
                )}
              </NavLink>
            );
          })}
        </nav>

        <div className="p-3 border-t border-slate-200 dark:border-slate-800 space-y-2">
          {!isPro ? (
            <button
              onClick={onUpgrade}
              className="w-full py-2 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white text-xs font-black uppercase tracking-wider rounded-lg flex items-center justify-center gap-1.5 shadow-sm"
            >
              <Crown className="w-3.5 h-3.5" /> Upgrade to Pro
            </button>
          ) : (
            <div className="p-2 bg-emerald-500/5 border border-emerald-500/20 rounded-lg space-y-0.5">
              <p className="text-[10px] font-black uppercase tracking-widest text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                <Crown className="w-3 h-3" /> Pro Active
              </p>
              <p className="text-[10px] text-slate-500 font-mono">
                {verification.daysRemaining !== null
                  ? `${verification.daysRemaining} days remaining`
                  : licenseKey}
              </p>
            </div>
          )}

          <div className="flex items-center justify-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
            <ThemeButton active={settings.theme === 'light'}   onClick={() => handleTheme('light')}  icon={<Sun className="w-3.5 h-3.5" />} />
            <ThemeButton active={settings.theme === 'dark'}    onClick={() => handleTheme('dark')}   icon={<Moon className="w-3.5 h-3.5" />} />
            <ThemeButton active={settings.theme === 'system'}  onClick={() => handleTheme('system')} icon={<Laptop className="w-3.5 h-3.5" />} />
          </div>
        </div>
      </aside>

      {/* ─── Mobile overlay ─── */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ─── Main area ─── */}
      <div className="lg:pl-64 min-h-screen flex flex-col">
        {/* Desktop top bar */}
        <header className="hidden lg:flex sticky top-0 z-20 h-14 bg-white/85 dark:bg-slate-900/85 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 px-6 items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <RefreshCw className={cn('w-3.5 h-3.5', lastRefresh.getTime() % 60_000 < 500 ? 'animate-spin' : '')} />
            Last refreshed {formatRelative(lastRefresh)}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleRefresh}
              className="px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors flex items-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Refresh
            </button>
            {!isPro && (
              <button
                onClick={onUpgrade}
                className="px-3 py-1.5 rounded-lg text-xs font-black bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-sm hover:shadow-md transition-shadow flex items-center gap-1"
              >
                <Crown className="w-3.5 h-3.5" /> Upgrade
              </button>
            )}
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 max-w-7xl w-full mx-auto">
          <Outlet context={contextValue} />
        </main>
      </div>

      <UpgradeModal open={upgradeOpen} onClose={() => setUpgradeOpen(false)} />
    </div>
  );
}

function ThemeButton({ active, onClick, icon }: { active: boolean; onClick: () => void; icon: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'p-1.5 rounded-md flex-1 flex items-center justify-center transition-colors',
        active
          ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
          : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200',
      )}
    >
      {icon}
    </button>
  );
}
