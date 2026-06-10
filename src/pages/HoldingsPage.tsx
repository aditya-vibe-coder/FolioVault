import { useState, useMemo, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import {
  Plus, Trash2, X, Briefcase, TrendingUp, TrendingDown, Edit2,
  ChevronDown, ChevronRight, Search, Save, IndianRupee,
} from 'lucide-react';
import { useLicense } from '../hooks/useLicense';
import { useHoldingsWithMetrics, useHoldingLimit, useActivePortfolioId } from '../hooks/usePortfolio';
import { db } from '../lib/db';
import {
  formatCurrency, formatPercent, formatDate, cn, uuid,
} from '../lib/formatters';
import { HOLDING_TYPE_COLORS, FREE_HOLDING_LIMIT } from '../types/extra';
import type { AssetClass, Holding, HoldingType, Transaction, TransactionType } from '../types';
import type { AppContext } from '../components/Layout';
import { Helmet } from 'react-helmet-async';

const HOLDING_TYPES: { value: HoldingType; label: string; defaultClass: AssetClass }[] = [
  { value: 'mf',            label: 'Mutual Fund',       defaultClass: 'equity' },
  { value: 'stock',         label: 'Indian Stock',      defaultClass: 'equity' },
  { value: 'etf',           label: 'ETF',               defaultClass: 'equity' },
  { value: 'ppf',           label: 'PPF',               defaultClass: 'debt' },
  { value: 'nps',           label: 'NPS',               defaultClass: 'debt' },
  { value: 'fd',            label: 'Fixed Deposit',     defaultClass: 'debt' },
  { value: 'sgb',           label: 'Sovereign Gold Bond', defaultClass: 'gold' },
  { value: 'gold_physical', label: 'Physical Gold',     defaultClass: 'gold' },
  { value: 'us_stock',      label: 'US Stock',          defaultClass: 'equity' },
  { value: 'other',         label: 'Other',             defaultClass: 'alternative' },
];

const ASSET_CLASSES: { value: AssetClass; label: string }[] = [
  { value: 'equity',      label: 'Equity' },
  { value: 'debt',        label: 'Debt' },
  { value: 'gold',        label: 'Gold' },
  { value: 'real_estate', label: 'Real Estate' },
  { value: 'cash',        label: 'Cash' },
  { value: 'alternative', label: 'Alternative' },
];

const TX_TYPES: TransactionType[] = [
  'buy', 'sell', 'sip', 'redeem', 'switch_in', 'switch_out',
  'dividend', 'bonus', 'interest',
];

export default function HoldingsPage() {
  const { onUpgrade } = useOutletContext<AppContext>();
  const { isPro } = useLicense();
  const portfolioId = useActivePortfolioId();
  const { isAtLimit, isOverLimit, count } = useHoldingLimit();
  const holdings = useHoldingsWithMetrics();

  const [showHoldingForm, setShowHoldingForm] = useState(false);
  const [editingHolding, setEditingHolding] = useState<Holding | null>(null);
  const [txHoldingId, setTxHoldingId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'value' | 'name' | 'gain' | 'xirr'>('value');
  const [filterType, setFilterType] = useState<HoldingType | 'all'>('all');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  // Filter + sort
  const visible = useMemo(() => {
    let v = holdings;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      v = v.filter((h) => h.name.toLowerCase().includes(q) || h.symbol?.toLowerCase().includes(q));
    }
    if (filterType !== 'all') v = v.filter((h) => h.type === filterType);
    v = [...v].sort((a, b) => {
      switch (sortBy) {
        case 'name':  return a.name.localeCompare(b.name);
        case 'gain':  return b.absoluteGainPercent - a.absoluteGainPercent;
        case 'xirr':  return (b.xirr ?? -999) - (a.xirr ?? -999);
        case 'value':
        default:      return b.currentValue - a.currentValue;
      }
    });
    return v;
  }, [holdings, search, sortBy, filterType]);

  const toggleCollapse = (id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleAddHolding = async (data: NewHoldingInput) => {
    if (!portfolioId) return;
    const id = uuid();
    await db.holdings.add({
      id,
      portfolioId,
      name: data.name.trim(),
      type: data.type,
      assetClass: data.assetClass,
      symbol: data.symbol?.trim() || undefined,
      isin: data.isin?.trim() || undefined,
      folioNumber: data.folioNumber?.trim() || undefined,
      category: data.category?.trim() || undefined,
      subCategory: data.subCategory?.trim() || undefined,
      exchange: data.exchange,
      manualCurrentPrice: data.manualCurrentPrice,
      notes: data.notes?.trim() || undefined,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    setShowHoldingForm(false);
  };

  const handleEditHolding = async (h: Holding, data: NewHoldingInput) => {
    await db.holdings.update(h.id, {
      name: data.name.trim(),
      type: data.type,
      assetClass: data.assetClass,
      symbol: data.symbol?.trim() || undefined,
      isin: data.isin?.trim() || undefined,
      folioNumber: data.folioNumber?.trim() || undefined,
      category: data.category?.trim() || undefined,
      subCategory: data.subCategory?.trim() || undefined,
      exchange: data.exchange,
      manualCurrentPrice: data.manualCurrentPrice,
      notes: data.notes?.trim() || undefined,
      updatedAt: new Date(),
    });
    setEditingHolding(null);
  };

  const handleDeleteHolding = async (h: Holding) => {
    if (!confirm(`Delete "${h.name}" and all its transactions? This cannot be undone.`)) return;
    await db.transaction('rw', db.holdings, db.transactions, async () => {
      await db.holdings.delete(h.id);
      const txs = await db.transactions.where({ holdingId: h.id }).toArray();
      await db.transactions.bulkDelete(txs.map((t) => t.id));
    });
  };

  const handleAddTransaction = async (h: Holding, data: NewTxInput) => {
    await db.transactions.add({
      id: uuid(),
      holdingId: h.id,
      portfolioId: h.portfolioId,
      date: data.date,
      type: data.type,
      units: data.type === 'dividend' || data.type === 'interest' ? undefined : data.units,
      price: data.price,
      amount: data.amount,
      charges: data.charges || undefined,
      notes: data.notes?.trim() || undefined,
      importSource: 'manual',
      createdAt: new Date(),
    });
    setTxHoldingId(null);
  };

  const handleDeleteTransaction = async (tx: Transaction) => {
    if (!confirm('Delete this transaction?')) return;
    await db.transactions.delete(tx.id);
  };

  return (
    <div className="space-y-5 font-sans">
      <Helmet>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>
          {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Briefcase className="w-6 h-6 text-blue-500" />
            Holdings Ledger
          </h1>
          <p className="text-sm text-slate-500">
            {count} holding{count === 1 ? '' : 's'} tracked.
            {!isPro && (
              <span className={cn('ml-2 font-bold', isAtLimit ? 'text-amber-500' : 'text-slate-400')}>
                {isAtLimit ? `Free cap of ${FREE_HOLDING_LIMIT} reached — ` : `Free plan: ${count}/${FREE_HOLDING_LIMIT} used. `}
                <button onClick={onUpgrade} className="text-blue-600 hover:underline">Upgrade for unlimited →</button>
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isOverLimit && !isPro && (
            <span className="text-xs font-bold text-amber-600 bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 rounded">
              Over free cap — exports & Pro features locked
            </span>
          )}
          <button
            onClick={() => { setEditingHolding(null); setShowHoldingForm(true); }}
            disabled={!isPro && isAtLimit}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-400 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" /> Add Holding
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search by name or symbol…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 border border-slate-200 dark:border-slate-800 rounded-lg bg-white dark:bg-slate-900 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value as any)}
          className="px-3 py-2 border border-slate-200 dark:border-slate-800 rounded-lg bg-white dark:bg-slate-900 text-sm font-semibold"
        >
          <option value="all">All types</option>
          {HOLDING_TYPES.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as any)}
          className="px-3 py-2 border border-slate-200 dark:border-slate-800 rounded-lg bg-white dark:bg-slate-900 text-sm font-semibold"
        >
          <option value="value">Sort: Value</option>
          <option value="gain">Sort: % Gain</option>
          <option value="xirr">Sort: XIRR</option>
          <option value="name">Sort: Name</option>
        </select>
      </div>

      {/* Holdings list */}
      {visible.length === 0 ? (
        <div className="p-12 text-center bg-white dark:bg-slate-900 border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl">
          <Briefcase className="w-12 h-12 mx-auto text-slate-300 dark:text-slate-700" />
          <p className="text-sm font-bold text-slate-700 dark:text-slate-300 mt-3">No holdings yet</p>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            {search
              ? 'No holdings match your search. Try a different query.'
              : 'Click "Add Holding" above to track your first asset, or import via the Import page.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {visible.map((h) => (
            <HoldingRow
              key={h.id}
              holding={h}
              collapsed={collapsed.has(h.id)}
              onToggle={() => toggleCollapse(h.id)}
              onEdit={() => { setEditingHolding(h); setShowHoldingForm(true); }}
              onDelete={() => handleDeleteHolding(h)}
              onAddTransaction={() => setTxHoldingId(h.id)}
              onDeleteTransaction={handleDeleteTransaction}
            />
          ))}
        </div>
      )}

      {/* Holding form modal */}
      {showHoldingForm && (
        <HoldingForm
          initial={editingHolding}
          onCancel={() => { setShowHoldingForm(false); setEditingHolding(null); }}
          onSubmit={(data) => {
            if (editingHolding) handleEditHolding(editingHolding, data);
            else handleAddHolding(data);
          }}
        />
      )}

      {/* Transaction form modal */}
      {txHoldingId && (() => {
        const h = holdings.find((x) => x.id === txHoldingId);
        if (!h) return null;
        return (
          <TransactionForm
            holding={h}
            onCancel={() => setTxHoldingId(null)}
            onSubmit={(data) => handleAddTransaction(h, data)}
          />
        );
      })()}
    </div>
  );
}

/* ─── Holding row ─────────────────────────────────────────────────────── */

function HoldingRow({
  holding, collapsed, onToggle, onEdit, onDelete, onAddTransaction, onDeleteTransaction,
}: {
  holding: ReturnType<typeof useHoldingsWithMetrics>[number];
  collapsed: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onAddTransaction: () => void;
  onDeleteTransaction: (tx: Transaction) => void;
}) {
  const typeColor = HOLDING_TYPE_COLORS[holding.type] ?? '#64748B';
  const isGain = holding.absoluteGain >= 0;
  const txCount = holding.aggregates.transactionCount;

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
      <div className="flex items-center gap-2 p-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
        <button onClick={onToggle} className="p-1 text-slate-400 hover:text-slate-700">
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
        <div className="w-2 h-10 rounded-full" style={{ background: typeColor }} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-bold truncate">{holding.name}</p>
            {holding.symbol && <span className="text-[10px] font-mono text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">{holding.symbol}</span>}
            {holding.subCategory && <span className="text-[10px] text-slate-500">{holding.subCategory}</span>}
            {!holding.isActive && <span className="text-[10px] font-bold text-amber-600 bg-amber-500/10 px-1.5 py-0.5 rounded">CLOSED</span>}
          </div>
          <p className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold mt-0.5">
            {holding.type.toUpperCase()} · {holding.assetClass.toUpperCase()} · {txCount} tx
          </p>
        </div>
        <div className="text-right">
          <p className="text-sm font-mono font-bold text-slate-900 dark:text-slate-100">{formatCurrency(holding.currentValue)}</p>
          <p className={cn(
            'text-[10px] font-mono font-bold flex items-center justify-end gap-0.5',
            isGain ? 'text-emerald-600' : 'text-red-500',
          )}>
            {isGain ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            {isGain ? '+' : ''}{formatCurrency(holding.absoluteGain)} ({formatPercent(holding.absoluteGainPercent, { decimals: 1 })})
          </p>
        </div>
        <div className="text-right ml-3 hidden sm:block">
          <p className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">XIRR</p>
          <p className={cn(
            'text-xs font-mono font-bold',
            holding.xirr === null ? 'text-slate-400' : holding.xirr >= 0.07 ? 'text-emerald-500' : 'text-amber-500',
          )}>
            {holding.xirr !== null ? formatPercent(holding.xirr * 100, { decimals: 1 }) : '—'}
          </p>
        </div>
        <div className="flex items-center gap-1 ml-2">
          <button onClick={onEdit} className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-blue-500" title="Edit">
            <Edit2 className="w-3.5 h-3.5" />
          </button>
          <button onClick={onDelete} className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-red-500" title="Delete">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      {!collapsed && (
        <div className="border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/30 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-[10px] uppercase font-black tracking-widest text-slate-500">
              Transactions ({txCount})
            </p>
            <button
              onClick={onAddTransaction}
              className="px-2.5 py-1 bg-blue-500/10 hover:bg-blue-500/20 text-blue-600 text-[10px] font-bold rounded flex items-center gap-1"
            >
              <Plus className="w-3 h-3" /> Add transaction
            </button>
          </div>
          {txCount === 0 ? (
            <p className="text-xs text-slate-400 italic text-center py-2">No transactions yet.</p>
          ) : (
            <div className="space-y-1 max-h-64 overflow-y-auto">
              {[...holding.transactions].reverse().map((t) => (
                <div key={t.id} className="flex items-center gap-2 p-2 bg-white dark:bg-slate-900 rounded text-xs">
                  <span className="font-mono text-slate-400 w-20 shrink-0">{formatDate(t.date)}</span>
                  <span className={cn(
                    'px-1.5 py-0.5 rounded text-[9px] font-black uppercase',
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
                  <button
                    onClick={() => onDeleteTransaction(t)}
                    className="p-1 text-slate-400 hover:text-red-500"
                    title="Delete"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Forms ──────────────────────────────────────────────────────────── */

interface NewHoldingInput {
  name: string;
  type: HoldingType;
  assetClass: AssetClass;
  symbol?: string;
  isin?: string;
  folioNumber?: string;
  category?: string;
  subCategory?: string;
  exchange?: 'NSE' | 'BSE';
  manualCurrentPrice?: number;
  notes?: string;
}

function HoldingForm({
  initial, onCancel, onSubmit,
}: {
  initial: Holding | null;
  onCancel: () => void;
  onSubmit: (data: NewHoldingInput) => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [type, setType] = useState<HoldingType>(initial?.type ?? 'mf');
  const [assetClass, setAssetClass] = useState<AssetClass>(initial?.assetClass ?? 'equity');
  const [symbol, setSymbol] = useState(initial?.symbol ?? '');
  const [isin, setIsin] = useState(initial?.isin ?? '');
  const [folio, setFolio] = useState(initial?.folioNumber ?? '');
  const [category, setCategory] = useState(initial?.category ?? '');
  const [subCategory, setSubCategory] = useState(initial?.subCategory ?? '');
  const [exchange, setExchange] = useState<'NSE' | 'BSE'>(initial?.exchange ?? 'NSE');
  const [manualPrice, setManualPrice] = useState<string>(
    initial?.manualCurrentPrice !== undefined ? String(initial.manualCurrentPrice) : '',
  );
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [err, setErr] = useState<string | null>(null);

  const handleTypeChange = (newType: HoldingType) => {
    setType(newType);
    const def = HOLDING_TYPES.find((t) => t.value === newType);
    if (def) setAssetClass(def.defaultClass);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setErr('Name is required');
      return;
    }
    onSubmit({
      name, type, assetClass,
      symbol: symbol || undefined,
      isin: isin || undefined,
      folioNumber: folio || undefined,
      category: category || undefined,
      subCategory: subCategory || undefined,
      exchange: type === 'stock' || type === 'etf' ? exchange : undefined,
      manualCurrentPrice: manualPrice ? parseFloat(manualPrice) : undefined,
      notes: notes || undefined,
    });
  };

  const needsPrice = ['ppf', 'nps', 'fd', 'sgb', 'gold_physical', 'us_stock'].includes(type);

  return (
    <Modal title={initial ? 'Edit holding' : 'Add new holding'} onClose={onCancel}>
      <form onSubmit={submit} className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Holding name" required>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. HDFC Flexi Cap Fund - Direct Growth"
              className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </Field>
          <Field label="Type">
            <select
              value={type}
              onChange={(e) => handleTypeChange(e.target.value as HoldingType)}
              className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm"
            >
              {HOLDING_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </Field>
          <Field label="Asset class">
            <select
              value={assetClass}
              onChange={(e) => setAssetClass(e.target.value as AssetClass)}
              className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm"
            >
              {ASSET_CLASSES.map((a) => (
                <option key={a.value} value={a.value}>{a.label}</option>
              ))}
            </select>
          </Field>
          <Field label={type === 'mf' ? 'Scheme code (mfapi.in)' : 'Symbol / ticker'}>
            <input
              type="text"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
              placeholder={type === 'mf' ? 'e.g. 125354' : 'e.g. RELIANCE'}
              className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm font-mono"
            />
          </Field>
          {(type === 'stock' || type === 'etf') && (
            <Field label="Exchange">
              <select
                value={exchange}
                onChange={(e) => setExchange(e.target.value as 'NSE' | 'BSE')}
                className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm"
              >
                <option value="NSE">NSE</option>
                <option value="BSE">BSE</option>
              </select>
            </Field>
          )}
          <Field label="Folio number (MF)">
            <input
              type="text"
              value={folio}
              onChange={(e) => setFolio(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm font-mono"
            />
          </Field>
          <Field label="Category (e.g. Large Cap)">
            <input
              type="text"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm"
            />
          </Field>
          <Field label="Sub-category (Direct/Regular)">
            <input
              type="text"
              value={subCategory}
              onChange={(e) => setSubCategory(e.target.value)}
              placeholder="Direct Growth / Regular Growth"
              className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm"
            />
          </Field>
          <Field label="ISIN">
            <input
              type="text"
              value={isin}
              onChange={(e) => setIsin(e.target.value.toUpperCase())}
              className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm font-mono"
            />
          </Field>
          {needsPrice && (
            <Field label="Current value (₹) — for assets without live price">
              <input
                type="number"
                step="0.01"
                value={manualPrice}
                onChange={(e) => setManualPrice(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm font-mono"
              />
            </Field>
          )}
        </div>
        <Field label="Notes (optional)">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm"
          />
        </Field>
        {err && <p className="text-xs text-red-500 font-semibold">{err}</p>}
        <div className="flex gap-2 justify-end pt-2">
          <button type="button" onClick={onCancel} className="px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-bold">
            Cancel
          </button>
          <button type="submit" className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold flex items-center gap-1">
            <Save className="w-3.5 h-3.5" /> {initial ? 'Save changes' : 'Create holding'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

interface NewTxInput {
  type: TransactionType;
  date: Date;
  units: number;
  price: number;
  amount: number;
  charges?: number;
  notes?: string;
}

function TransactionForm({
  holding, onCancel, onSubmit,
}: {
  holding: Holding;
  onCancel: () => void;
  onSubmit: (data: NewTxInput) => void;
}) {
  const [type, setType] = useState<TransactionType>('buy');
  const [date, setDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [units, setUnits] = useState('');
  const [price, setPrice] = useState('');
  const [amount, setAmount] = useState('');
  const [charges, setCharges] = useState('');
  const [notes, setNotes] = useState('');
  const [err, setErr] = useState<string | null>(null);

  // Auto-compute amount from units × price
  useEffect(() => {
    const u = parseFloat(units);
    const p = parseFloat(price);
    if (isFinite(u) && isFinite(p) && u > 0 && p > 0) {
      setAmount((u * p).toFixed(2));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [units, price]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(amount);
    if (!isFinite(amt) || amt <= 0) { setErr('Amount must be a positive number'); return; }
    onSubmit({
      type, date: new Date(date),
      units: parseFloat(units) || 0,
      price: parseFloat(price) || 0,
      amount: amt,
      charges: charges ? parseFloat(charges) : undefined,
      notes: notes || undefined,
    });
  };

  const isCashTx = type === 'dividend' || type === 'interest';

  return (
    <Modal title={`Add transaction — ${holding.name}`} onClose={onCancel}>
      <form onSubmit={submit} className="space-y-3">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Field label="Type" className="col-span-2 sm:col-span-1">
            <select
              value={type}
              onChange={(e) => setType(e.target.value as TransactionType)}
              className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm"
            >
              {TX_TYPES.map((t) => (
                <option key={t} value={t}>{t.replace('_', ' ').toUpperCase()}</option>
              ))}
            </select>
          </Field>
          <Field label="Date">
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm"
            />
          </Field>
          {!isCashTx && (
            <Field label="Units">
              <input
                type="number"
                step="any"
                value={units}
                onChange={(e) => setUnits(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm font-mono"
              />
            </Field>
          )}
          {!isCashTx && (
            <Field label="Price / NAV">
              <input
                type="number"
                step="any"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm font-mono"
              />
            </Field>
          )}
          <Field label={isCashTx ? 'Amount received' : 'Total amount'} className={isCashTx ? 'col-span-2' : 'col-span-2 sm:col-span-1'}>
            <div className="relative">
              <IndianRupee className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="number"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full pl-7 pr-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm font-mono"
              />
            </div>
          </Field>
          <Field label="Charges (opt.)" className="col-span-2">
            <input
              type="number"
              step="0.01"
              value={charges}
              onChange={(e) => setCharges(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm font-mono"
            />
          </Field>
        </div>
        <Field label="Notes (optional)">
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm"
          />
        </Field>
        {err && <p className="text-xs text-red-500 font-semibold">{err}</p>}
        <div className="flex gap-2 justify-end pt-2">
          <button type="button" onClick={onCancel} className="px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-bold">Cancel</button>
          <button type="submit" className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold flex items-center gap-1">
            <Plus className="w-3.5 h-3.5" /> Add transaction
          </button>
        </div>
      </form>
    </Modal>
  );
}

/* ─── Shared ──────────────────────────────────────────────────────────── */

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-3 animate-fade-in" onClick={onClose}>
      <div
        className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto font-sans"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between sticky top-0 bg-white dark:bg-slate-900 z-10">
          <h2 className="text-base font-black uppercase tracking-tight">{title}</h2>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

function Field({ label, required, children, className }: { label: string; required?: boolean; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('space-y-1', className)}>
      <label className="text-[10px] uppercase font-black tracking-widest text-slate-500 block">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {children}
    </div>
  );
}
