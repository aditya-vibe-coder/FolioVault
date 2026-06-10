import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Combine class names safely (clsx + tailwind-merge). */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** Format INR with Indian numbering system (lakh / crore). */
export function formatCurrency(
  value: number | null | undefined,
  opts: { compact?: boolean; decimals?: number } = {},
): string {
  if (value === null || value === undefined || isNaN(value)) return '—';
  const { compact = false, decimals = 0 } = opts;

  if (compact) {
    const abs = Math.abs(value);
    if (abs >= 1e7)  return `₹${(value / 1e7).toFixed(2)}Cr`;
    if (abs >= 1e5)  return `₹${(value / 1e5).toFixed(2)}L`;
    if (abs >= 1e3)  return `₹${(value / 1e3).toFixed(1)}K`;
    return `₹${value.toFixed(decimals)}`;
  }

  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

/** Format a percentage (input as a number 0-100, or 0-1 if `asFraction` is true). */
export function formatPercent(
  value: number | null | undefined,
  opts: { decimals?: number; asFraction?: boolean; showSign?: boolean } = {},
): string {
  if (value === null || value === undefined || isNaN(value)) return '—';
  const { decimals = 2, asFraction = false, showSign = false } = opts;
  const pct = asFraction ? value * 100 : value;
  const sign = showSign && pct > 0 ? '+' : '';
  return `${sign}${pct.toFixed(decimals)}%`;
}

/** Format an XIRR rate (always shown as p.a.). */
export function formatXIRR(rate: number | null | undefined): string {
  if (rate === null || rate === undefined || isNaN(rate)) return '—';
  const sign = rate > 0 ? '+' : '';
  return `${sign}${(rate * 100).toFixed(2)}% p.a.`;
}

/** Returns Tailwind classes for colouring an XIRR vs a benchmark. */
export function getXirrColor(
  rate: number | null | undefined,
  benchmark: number,
): string {
  if (rate === null || rate === undefined) return 'text-slate-400';
  if (rate * 100 > benchmark) return 'text-emerald-500 dark:text-emerald-400';
  if (rate * 100 > 0)        return 'text-amber-500 dark:text-amber-400';
  return 'text-red-500 dark:text-red-400';
}

/** Short date like "12 Mar 2025". */
export function formatDate(d: Date | string | null | undefined): string {
  if (!d) return '—';
  const date = typeof d === 'string' ? new Date(d) : d;
  if (isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-IN', {
    day:   '2-digit',
    month: 'short',
    year:  'numeric',
  }).format(date);
}

/** Short date+time like "12 Mar 2025, 14:30". */
export function formatDateTime(d: Date | string | null | undefined): string {
  if (!d) return '—';
  const date = typeof d === 'string' ? new Date(d) : d;
  if (isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-IN', {
    day:   '2-digit',
    month: 'short',
    year:  'numeric',
    hour:  '2-digit',
    minute:'2-digit',
    hour12: false,
  }).format(date);
}

/** Compact relative date — "Today", "Yesterday", "3 days ago", "12 Mar". */
export function formatRelative(d: Date | string | null | undefined): string {
  if (!d) return '—';
  const date = typeof d === 'string' ? new Date(d) : d;
  if (isNaN(date.getTime())) return '—';
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - date.getTime()) / 86_400_000);
  if (diffDays === 0)  return 'Today';
  if (diffDays === 1)  return 'Yesterday';
  if (diffDays < 7)    return `${diffDays} days ago`;
  if (diffDays < 30)   return `${Math.floor(diffDays / 7)} weeks ago`;
  if (diffDays < 365)  return `${Math.floor(diffDays / 30)} months ago`;
  return `${Math.floor(diffDays / 365)} years ago`;
}

/** Indian-financial-year label: "FY 2024-25". */
export function fyLabel(d: Date | string = new Date()): string {
  const date = typeof d === 'string' ? new Date(d) : d;
  const y = date.getFullYear();
  const m = date.getMonth(); // 0=Jan
  // FY in India runs April (m=3) → March (m=2)
  const fyStart = m >= 3 ? y : y - 1;
  const fyEnd   = String((fyStart + 1) % 100).padStart(2, '0');
  return `FY ${fyStart}-${fyEnd}`;
}

/** Sanitise a string to a comparable, normalised form for de-duplicating holdings. */
export function normaliseName(name: string): string {
  return name.toLowerCase().replace(/\s+/g, ' ').trim();
}

/** UUID with safe fallback for older browsers. */
export function uuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // RFC 4122 v4 fallback
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
