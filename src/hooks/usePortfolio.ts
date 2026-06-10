/**
 * Computes derived metrics from the holdings + transactions tables.
 *
 *   useHoldingsWithMetrics()  →  HoldingWithMetrics[]   (per-holding aggregates, XIRR, live price)
 *   usePortfolioMetrics()     →  PortfolioMetrics        (net-worth, allocation, XIRR, day change)
 *   usePriceFetcher()         →  live price refresh hook (polls /api/prices)
 */
import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, getDefaultPortfolioId } from '../lib/db';
import type {
  Holding,
  HoldingAggregates,
  HoldingWithMetrics,
  PortfolioMetrics,
  AssetClass,
  Transaction,
} from '../types';
import { useAppStore } from '../store/appStore';
import { useLicense } from './useLicense';
import { holdingXirr, xirr } from '../lib/xirr';
import { FREE_HOLDING_LIMIT } from '../types/extra';
import { apiUrl } from '../lib/apiBase';

/* ─── Helpers ───────────────────────────────────────────────────────────── */

function emptyAggregates(): HoldingAggregates {
  return {
    totalInvested: 0,
    totalRedeemed: 0,
    currentUnits: 0,
    avgBuyPrice: 0,
    transactionCount: 0,
  };
}

function aggregate(txs: Transaction[]): HoldingAggregates {
  const agg = emptyAggregates();
  const queue: { units: number; price: number }[] = [];
  for (const t of txs) {
    switch (t.type) {
      case 'buy':
      case 'sip':
      case 'switch_in':
      case 'bonus': {
        const units = t.units ?? (t.price > 0 ? t.amount / t.price : 0);
        queue.push({ units, price: t.price });
        agg.totalInvested += t.amount;
        agg.currentUnits += units;
        break;
      }
      case 'sell':
      case 'redeem':
      case 'switch_out': {
        const units = t.units ?? (t.price > 0 ? t.amount / t.price : 0);
        let toDeduct = units;
        while (toDeduct > 0 && queue.length) {
          const head = queue[0];
          if (head.units <= toDeduct) {
            toDeduct -= head.units;
            queue.shift();
          } else {
            head.units -= toDeduct;
            toDeduct = 0;
          }
        }
        agg.totalRedeemed += t.amount;
        agg.currentUnits -= units;
        break;
      }
      case 'dividend':
      case 'interest': {
        agg.totalRedeemed += t.amount; // treated as cash inflow (not unit-changing)
        break;
      }
    }
  }
  if (queue.length > 0) {
    const totalUnits = queue.reduce((s, q) => s + q.units, 0);
    const totalCost  = queue.reduce((s, q) => s + q.units * q.price, 0);
    agg.avgBuyPrice  = totalUnits > 0 ? totalCost / totalUnits : 0;
  } else {
    agg.avgBuyPrice = 0;
  }
  agg.transactionCount = txs.length;
  agg.currentUnits = Math.max(0, agg.currentUnits);
  return agg;
}

const MANUAL_TYPES: ReadonlyArray<Holding['type']> = ['ppf', 'nps', 'fd', 'gold_physical'];

function symbolForPrice(h: Holding): string | null {
  if (h.type === 'mf' && h.symbol) return h.symbol;
  if ((h.type === 'stock' || h.type === 'etf' || h.type === 'us_stock') && h.symbol) {
    // mfapi rules: numerics only → stocks
    return h.symbol;
  }
  return null;
}

/* ─── Live prices cache (in-memory, used by hooks) ─────────────────────── */

const priceCache = new Map<string, { price: number; previous?: number; ts: number }>();
const PRICE_TTL = 15 * 60 * 1000;

async function fetchPrices(symbols: string[]): Promise<Record<string, { price: number; previous?: number }>> {
  const unique = Array.from(new Set(symbols.filter(Boolean)));
  if (unique.length === 0) return {};

  const now = Date.now();
  const expiredOrMissed: string[] = [];
  const result: Record<string, { price: number; previous?: number }> = {};

  for (const sym of unique) {
    const cached = priceCache.get(sym);
    if (cached && now - cached.ts < PRICE_TTL) {
      result[sym] = { price: cached.price, previous: cached.previous };
    } else {
      expiredOrMissed.push(sym);
    }
  }

  if (expiredOrMissed.length === 0) return result;
  try {
    const r = await fetch(apiUrl('/api/prices'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symbols: expiredOrMissed }),
    });
    if (r.ok) {
      const data = await r.json();
      const prices = data.prices ?? {};
      for (const sym of expiredOrMissed) {
        const p = prices[sym];
        if (p && typeof p.currentPrice === 'number') {
          priceCache.set(sym, {
            price: p.currentPrice,
            previous: p.previousDayPrice,
            ts: now,
          });
          result[sym] = { price: p.currentPrice, previous: p.previousDayPrice };
        }
      }
    }
  } catch {
    // Offline / server down — fall back to whatever was cached
    for (const sym of expiredOrMissed) {
      const c = priceCache.get(sym);
      if (c) result[sym] = { price: c.price, previous: c.previous };
    }
  }
  return result;
}

/* ─── Hooks ─────────────────────────────────────────────────────────────── */

/**
 * Returns the active portfolio id (the one currently selected in the UI).
 * Falls back to the default portfolio if none is set.
 */
export function useActivePortfolioId(): string | null {
  const activeId = useAppStore((s) => s.activePortfolioId);
  const [resolved, setResolved] = useState<string | null>(activeId);
  useEffect(() => {
    let alive = true;
    (async () => {
      if (activeId) {
        if (alive) setResolved(activeId);
        return;
      }
      const id = await getDefaultPortfolioId();
      if (alive) setResolved(id || null);
    })();
    return () => {
      alive = false;
    };
  }, [activeId]);
  return resolved;
}

/**
 * Returns the list of holdings for the active portfolio, fully decorated
 * with aggregates, current price, and XIRR.
 */
export function useHoldingsWithMetrics(): HoldingWithMetrics[] {
  const portfolioId = useActivePortfolioId();
  const { isPro } = useLicense();

  // Live observables
  const holdings = useLiveQuery(
    () =>
      portfolioId
        ? db.holdings.where({ portfolioId }).toArray()
        : Promise.resolve([] as Holding[]),
    [portfolioId],
    [] as Holding[],
  );
  const transactions = useLiveQuery(
    () =>
      portfolioId
        ? db.transactions.where({ portfolioId }).toArray()
        : Promise.resolve([] as Transaction[]),
    [portfolioId],
    [] as Transaction[],
  );

  // Live prices
  const symbols = useMemo(
    () => (holdings ?? []).map(symbolForPrice).filter(Boolean) as string[],
    [holdings],
  );
  const [prices, setPrices] = useState<Record<string, { price: number; previous?: number }>>({});

  useEffect(() => {
    let alive = true;
    if (symbols.length === 0) {
      setPrices({});
      return;
    }
    fetchPrices(symbols).then((p) => {
      if (alive) setPrices(p);
    });
    return () => {
      alive = false;
    };
  }, [symbols.join('|')]);

  // Re-fetch every 15 mins while the user is on screen
  useEffect(() => {
    if (symbols.length === 0) return;
    const t = setInterval(() => {
      // invalidate cache
      for (const sym of symbols) priceCache.delete(sym);
      fetchPrices(symbols).then((p) => setPrices(p));
    }, PRICE_TTL);
    return () => clearInterval(t);
  }, [symbols.join('|')]);

  return useMemo<HoldingWithMetrics[]>(() => {
    if (!holdings) return [];
    const txsByHolding = new Map<string, Transaction[]>();
    (transactions ?? []).forEach((t) => {
      const list = txsByHolding.get(t.holdingId) ?? [];
      list.push(t);
      txsByHolding.set(t.holdingId, list);
    });

    return holdings
      .map<HoldingWithMetrics>((h) => {
        const txs = (txsByHolding.get(h.id) ?? []).sort(
          (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
        );
        const aggregates = aggregate(txs);
        const liveSym = symbolForPrice(h);
        const live = liveSym ? prices[liveSym] : undefined;
        const manualPrice = h.manualCurrentPrice;
        const currentPrice = live?.price ?? manualPrice ?? null;
        const previousDayPrice = live?.previous ?? null;
        const currentValue = currentPrice !== null ? currentPrice * aggregates.currentUnits : 0;
        const netInvested = aggregates.totalInvested - aggregates.totalRedeemed;
        const absoluteGain = currentValue - netInvested;
        const absoluteGainPercent = netInvested > 0 ? (absoluteGain / netInvested) * 100 : 0;
        const dayChange =
          currentPrice !== null && previousDayPrice !== null
            ? (currentPrice - previousDayPrice) * aggregates.currentUnits
            : 0;
        const dayChangePercent =
          currentPrice !== null && previousDayPrice !== null && previousDayPrice > 0
            ? ((currentPrice - previousDayPrice) / previousDayPrice) * 100
            : 0;

        let xirrValue: number | null = null;
        if (currentPrice !== null && currentValue > 0 && txs.length > 0) {
          const flows = txs
            .filter((t) => ['buy', 'sip', 'switch_in'].includes(t.type) || (t.type === 'sell' || t.type === 'redeem' || t.type === 'switch_out'))
            .map((t) => ({
              amount: ['buy', 'sip', 'switch_in'].includes(t.type) ? -Math.abs(t.amount) : Math.abs(t.amount),
              date: new Date(t.date),
            }));
          xirrValue = holdingXirr(flows, currentValue);
        }

        return {
          ...h,
          aggregates,
          currentPrice,
          currentValue,
          absoluteGain,
          absoluteGainPercent,
          xirr: xirrValue,
          dayChange,
          dayChangePercent,
          transactions: txs,
        };
      })
      // Sort: active holdings first, by absolute value desc
      .sort((a, b) => {
        if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
        return b.currentValue - a.currentValue;
      });
  }, [holdings, transactions, prices, isPro]);
}

/**
 * Returns portfolio-level aggregates (sums, XIRR, allocation).
 */
export function usePortfolioMetrics(): PortfolioMetrics {
  const holdings = useHoldingsWithMetrics();
  const transactions = useLiveQuery(() => db.transactions.toArray(), [], [] as Transaction[]);

  return useMemo<PortfolioMetrics>(() => {
    const totalInvested = holdings.reduce((s, h) => s + h.aggregates.totalInvested, 0);
    const totalRedeemed = holdings.reduce((s, h) => s + h.aggregates.totalRedeemed, 0);
    const netInvested = totalInvested - totalRedeemed;
    const currentValue = holdings.reduce((s, h) => s + h.currentValue, 0);
    const dayChange = holdings.reduce((s, h) => s + (h.dayChange ?? 0), 0);
    const dayChangePercent =
      currentValue - dayChange > 0 ? (dayChange / (currentValue - dayChange)) * 100 : 0;
    const absoluteGain = currentValue - netInvested;
    const absoluteGainPercent = netInvested > 0 ? (absoluteGain / netInvested) * 100 : 0;

    // Asset allocation
    const assetAllocation: Record<AssetClass, number> = {
      equity: 0, debt: 0, gold: 0, real_estate: 0, cash: 0, alternative: 0,
    };
    holdings.forEach((h) => {
      assetAllocation[h.assetClass] = (assetAllocation[h.assetClass] ?? 0) + h.currentValue;
    });

    // Overall XIRR — combine all transactions of all holdings in this portfolio
    let overallXirr: number | null = null;
    if (transactions.length > 0 && currentValue > 0) {
      const flows: { amount: number; date: Date }[] = [];
      for (const t of transactions) {
        if (['buy', 'sip', 'switch_in'].includes(t.type)) {
          flows.push({ amount: -Math.abs(t.amount), date: new Date(t.date) });
        } else if (['sell', 'redeem', 'switch_out', 'dividend', 'interest'].includes(t.type)) {
          flows.push({ amount:  Math.abs(t.amount), date: new Date(t.date) });
        }
      }
      flows.push({ amount: currentValue, date: new Date() });
      overallXirr = xirr(flows);
    }

    return {
      totalInvested: netInvested,
      currentValue,
      absoluteGain,
      absoluteGainPercent,
      overallXirr,
      assetAllocation,
      dayChange,
      dayChangePercent,
    };
  }, [holdings, transactions]);
}

/**
 * Returns a manual refresh function for live prices.
 */
export function usePriceRefresher() {
  const symbolsRef = useRef<string[]>([]);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (symbolsRef.current.length === 0) return;
    setBusy(true);
    for (const sym of symbolsRef.current) priceCache.delete(sym);
    await fetchPrices(symbolsRef.current);
    setBusy(false);
  }, []);

  return { refresh, setSymbols: (s: string[]) => (symbolsRef.current = s), busy };
}

/**
 * Limit-checks: returns whether the user is at/over the free cap.
 */
export function useHoldingLimit(): {
  isAtLimit: boolean;
  isOverLimit: boolean;
  limit: number;
  count: number;
} {
  const { isPro } = useLicense();
  const portfolioId = useActivePortfolioId();
  const count = useLiveQuery(
    () => (portfolioId ? db.holdings.where({ portfolioId }).count() : Promise.resolve(0)),
    [portfolioId],
    0,
  ) ?? 0;
  if (isPro) return { isAtLimit: false, isOverLimit: false, limit: Infinity, count };
  return {
    isAtLimit: count >= FREE_HOLDING_LIMIT,
    isOverLimit: count > FREE_HOLDING_LIMIT,
    limit: FREE_HOLDING_LIMIT,
    count,
  };
}

/**
 * Returns a wrapped refresh for the dashboard (last refreshed timestamp).
 */
export function useLastRefresh(): { lastRefresh: Date; refresh: () => void } {
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const refresh = useCallback(() => setLastRefresh(new Date()), []);
  useEffect(() => {
    const t = setInterval(() => setLastRefresh(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);
  return { lastRefresh, refresh };
}
