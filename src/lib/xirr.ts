/**
 * Excel-compatible XIRR implementation using Newton-Raphson with bisection
 * fallback.  This is the financial-grade solver that powers FolioVault.
 *
 *   given  cashflows = [{ amount: number, date: Date }, ...]
 *   returns the annualised rate r such that  Σ cf / (1+r)^((d-d0)/365) = 0
 */
export function xirr(
  cashflows: { amount: number; date: Date }[],
  guess = 0.1,
): number | null {
  if (cashflows.length < 2) return null;

  // Sanity: must have at least one positive and one negative cashflow.
  const hasPos = cashflows.some((c) => c.amount > 0);
  const hasNeg = cashflows.some((c) => c.amount < 0);
  if (!hasPos || !hasNeg) return null;

  const sorted = [...cashflows].sort((a, b) => a.date.getTime() - b.date.getTime());
  const d0 = sorted[0].date.getTime();
  const yearFrac = (d: Date) => (d.getTime() - d0) / (365 * 24 * 60 * 60 * 1000);

  const npv  = (r: number) => sorted.reduce((s, c) => s + c.amount / Math.pow(1 + r, yearFrac(c.date)), 0);
  const dnpv = (r: number) => sorted.reduce(
    (s, c) => s - yearFrac(c.date) * c.amount / Math.pow(1 + r, yearFrac(c.date) + 1),
    0,
  );

  // 1) Newton-Raphson (fast, can diverge)
  let r = guess;
  for (let i = 0; i < 100; i++) {
    const f = npv(r);
    if (Math.abs(f) < 1e-7) return r;
    const d = dnpv(r);
    if (d === 0) break;
    const next = r - f / d;
    if (!isFinite(next) || next <= -0.999999) break;
    if (Math.abs(next - r) < 1e-9) return next;
    r = next;
  }

  // 2) Bisection fallback (always converges if a root exists in the bracket)
  let lo = -0.9999;
  let hi = 10;
  let fLo = npv(lo);
  let fHi = npv(hi);
  if (fLo * fHi > 0) return null; // No sign change → no real IRR

  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    const fMid = npv(mid);
    if (Math.abs(fMid) < 1e-7) return mid;
    if (fMid * fLo < 0) {
      hi = mid;
      fHi = fMid;
    } else {
      lo = mid;
      fLo = fMid;
    }
  }
  return (lo + hi) / 2;
}

/**
 * Convenience: compute XIRR for a single holding given its transaction list
 * and a "current value" observation on `asOf` (defaults to today).
 */
export function holdingXirr(
  transactions: { amount: number; date: Date }[],
  currentValue: number,
  asOf: Date = new Date(),
): number | null {
  if (!transactions.length) return null;
  return xirr([
    ...transactions.map((t) => ({ amount: -Math.abs(t.amount), date: t.date })),
    { amount: currentValue, date: asOf },
  ]);
}
