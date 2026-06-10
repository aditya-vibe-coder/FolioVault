/**
 * ITR-ready Capital Gains Report.
 *
 * For each Indian FY (Apr-Mar), builds FIFO-matched realised gains & losses
 * and exports them as a PDF + CSV ready for filing in the ITR portal.
 */
import { useState, useMemo } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { FileText, Download, AlertCircle, Crown } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { db } from '../lib/db';
import { useActivePortfolioId, useHoldingsWithMetrics } from '../hooks/usePortfolio';
import { useLicense } from '../hooks/useLicense';
import { ProBadge } from '../components/ui/ProBadge';
import { formatCurrency, formatDate, fyLabel, cn } from '../lib/formatters';
import type { AppContext } from '../components/Layout';
import type { Transaction, HoldingWithMetrics } from '../types';
import { Helmet } from 'react-helmet-async';

interface RealisedGain {
  holdingId: string;
  holdingName: string;
  symbol?: string;
  isin?: string;
  buyDate: Date;
  sellDate: Date;
  units: number;
  buyPrice: number;
  sellPrice: number;
  proceeds: number;
  costBasis: number;
  gain: number;
  holdingDays: number;
  isLongTerm: boolean;
  taxRate: number; // 0.125 for LTCG, 0.20 for STCG
  taxOwed: number;
}

const TAX_LTCG_RATE = 0.125;
const TAX_STCG_RATE = 0.20;
const LTCG_EXEMPTION = 125_000;

export default function CapitalGainsPage() {
  const { onUpgrade } = useOutletContext<AppContext>();
  const { isPro } = useLicense();
  const portfolioId = useActivePortfolioId();
  const holdings = useHoldingsWithMetrics();
  const transactions = useLiveQuery(
    () => portfolioId
      ? db.transactions.where({ portfolioId }).toArray()
      : Promise.resolve([] as Transaction[]),
    [portfolioId],
    [] as Transaction[],
  );
  const [selectedFy, setSelectedFy] = useState<string>(fyLabel());
  const [generating, setGenerating] = useState(false);

  // Available FYs
  const fys = useMemo(() => {
    const set = new Set<string>();
    transactions.forEach((t) => set.add(fyLabel(new Date(t.date))));
    set.add(fyLabel());
    return Array.from(set).sort().reverse();
  }, [transactions]);

  // Compute realised gains
  const { gains, summary } = useMemo(() => {
    const fyStart = fyToStart(selectedFy);
    const fyEnd = fyToEnd(selectedFy);

    const allGains: RealisedGain[] = [];
    holdings.forEach((h) => {
      const queue: { units: number; price: number; date: Date }[] = [];
      const sortedTxs = [...h.transactions].sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
      );
      sortedTxs.forEach((t) => {
        if (t.type === 'buy' || t.type === 'sip' || t.type === 'switch_in' || t.type === 'bonus') {
          const units = t.units ?? (t.price > 0 ? t.amount / t.price : 0);
          if (units > 0) {
            queue.push({ units, price: t.price, date: new Date(t.date) });
          }
        } else if (t.type === 'sell' || t.type === 'redeem' || t.type === 'switch_out') {
          let unitsToSell = t.units ?? (t.price > 0 ? t.amount / t.price : 0);
          const sellPrice = t.price;
          const sellDate = new Date(t.date);
          while (unitsToSell > 0 && queue.length > 0) {
            const head = queue[0];
            if (head.units <= unitsToSell) {
              // Realise entire head
              const realised = computeGain(h, head.units, head.price, sellPrice, head.date, sellDate);
              if (realised && sellDate >= fyStart && sellDate <= fyEnd) {
                allGains.push(realised);
              }
              unitsToSell -= head.units;
              queue.shift();
            } else {
              // Partial realisation
              const realised = computeGain(h, unitsToSell, head.price, sellPrice, head.date, sellDate);
              if (realised && sellDate >= fyStart && sellDate <= fyEnd) {
                allGains.push(realised);
              }
              head.units -= unitsToSell;
              unitsToSell = 0;
            }
          }
        }
      });
    });

    // Summary
    const ltcg = allGains.filter((g) => g.isLongTerm && g.gain > 0).reduce((s, g) => s + g.gain, 0);
    const stcg = allGains.filter((g) => !g.isLongTerm && g.gain > 0).reduce((s, g) => s + g.gain, 0);
    const ltcl = allGains.filter((g) => g.isLongTerm && g.gain < 0).reduce((s, g) => s + Math.abs(g.gain), 0);
    const stcl = allGains.filter((g) => !g.isLongTerm && g.gain < 0).reduce((s, g) => s + Math.abs(g.gain), 0);
    const netLTCG = Math.max(0, ltcg - LTCG_EXEMPTION);
    const taxLTCG = netLTCG * TAX_LTCG_RATE;
    const taxSTCG = stcg * TAX_STCG_RATE;
    const taxSavedLTCL = ltcl * TAX_LTCG_RATE; // can offset LTCG
    const taxSavedSTCL = stcl * TAX_STCG_RATE; // can offset STCG

    return {
      gains: allGains.sort((a, b) => b.sellDate.getTime() - a.sellDate.getTime()),
      summary: {
        ltcg, stcg, ltcl, stcl,
        netLTCG, taxLTCG, taxSTCG, taxSavedLTCL, taxSavedSTCL,
        totalTax: taxLTCG + taxSTCG,
      },
    };
  }, [holdings, selectedFy]);

  const exportPDF = () => {
    if (gains.length === 0) {
      alert('No realised gains to export in this FY.');
      return;
    }
    setGenerating(true);
    try {
      const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
      const pageW = doc.internal.pageSize.getWidth();

      // Title
      doc.setFontSize(18);
      doc.setFont('helvetica', 'bold');
      doc.text(`FolioVault — Capital Gains Report`, 40, 50);
      doc.setFontSize(11);
      doc.setFont('helvetica', 'normal');
      doc.text(`Financial Year: ${selectedFy}`, 40, 70);
      doc.text(`Generated: ${new Date().toLocaleString('en-IN')}`, 40, 85);
      doc.text(`Disclaimer: This is a helper document. Please verify all figures against broker statements before filing ITR.`, 40, 100);

      // Summary box
      const s = summary;
      doc.setFillColor(241, 245, 249);
      doc.rect(40, 115, pageW - 80, 100, 'F');
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text('SUMMARY', 50, 135);
      doc.setFont('helvetica', 'normal');
      doc.text(`Long-term gains (LTCG):      ${formatCurrency(s.ltcg)}`, 50, 155);
      doc.text(`Long-term losses (LTCL):     ${formatCurrency(s.ltcl)}`, 50, 170);
      doc.text(`Short-term gains (STCG):     ${formatCurrency(s.stcg)}`, 50, 185);
      doc.text(`Short-term losses (STCL):    ${formatCurrency(s.stcl)}`, 280, 155);
      doc.text(`LTCG exemption:              -${formatCurrency(LTCG_EXEMPTION)}`, 280, 170);
      doc.text(`Taxable LTCG:                ${formatCurrency(s.netLTCG)}`, 280, 185);
      doc.setFont('helvetica', 'bold');
      doc.text(`Tax @ 12.5% on LTCG:         ${formatCurrency(s.taxLTCG)}`, 500, 155);
      doc.text(`Tax @ 20% on STCG:           ${formatCurrency(s.taxSTCG)}`, 500, 170);
      doc.setTextColor(220, 38, 38);
      doc.text(`ESTIMATED TAX PAYABLE:       ${formatCurrency(s.totalTax)}`, 500, 195);
      doc.setTextColor(0, 0, 0);

      // Table
      autoTable(doc, {
        startY: 240,
        head: [['#', 'Holding', 'ISIN', 'Buy date', 'Sell date', 'Units', 'Buy ₹', 'Sell ₹', 'Proceeds', 'Cost', 'Gain/Loss', 'Days', 'Type', 'Tax ₹']],
        body: gains.map((g, i) => [
          i + 1,
          g.holdingName.length > 30 ? g.holdingName.slice(0, 28) + '…' : g.holdingName,
          g.isin || g.symbol || '—',
          formatDate(g.buyDate),
          formatDate(g.sellDate),
          g.units.toFixed(3),
          g.buyPrice.toFixed(2),
          g.sellPrice.toFixed(2),
          formatCurrency(g.proceeds),
          formatCurrency(g.costBasis),
          formatCurrency(g.gain),
          g.holdingDays.toString(),
          g.isLongTerm ? 'LTCG' : 'STCG',
          formatCurrency(g.taxOwed),
        ]),
        styles: { fontSize: 8, cellPadding: 3 },
        headStyles: { fillColor: [37, 99, 235], textColor: 255, fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        columnStyles: {
          0: { halign: 'right', cellWidth: 24 },
          5: { halign: 'right' },
          6: { halign: 'right' },
          7: { halign: 'right' },
          8: { halign: 'right' },
          9: { halign: 'right' },
          10: { halign: 'right' },
          11: { halign: 'right' },
          12: { halign: 'center' },
          13: { halign: 'right' },
        },
        didParseCell: (data) => {
          if (data.column.index === 10 && data.section === 'body') {
            const g = gains[data.row.index];
            if (g.gain < 0) data.cell.styles.textColor = [220, 38, 38];
            else if (g.gain > 0) data.cell.styles.textColor = [5, 150, 105];
          }
        },
      });

      // Footer
      const pageCount = (doc as any).getNumberOfPages?.() ?? 1;
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(120, 120, 120);
        doc.text(
          `FolioVault — Privacy-first Indian Investment Portfolio Tracker · foliovault.harmnix.com`,
          40,
          doc.internal.pageSize.getHeight() - 20,
        );
        doc.text(`Page ${i} of ${pageCount}`, pageW - 80, doc.internal.pageSize.getHeight() - 20);
      }

      doc.save(`foliovault-capital-gains-${selectedFy.replace(/\s/g, '_')}.pdf`);
    } catch (e: any) {
      alert('PDF generation failed: ' + e.message);
    } finally {
      setGenerating(false);
    }
  };

  const exportCSV = () => {
    const header = ['Holding', 'ISIN/Symbol', 'Buy Date', 'Sell Date', 'Units', 'Buy Price', 'Sell Price', 'Proceeds', 'Cost Basis', 'Gain/Loss', 'Days', 'Type', 'Tax Rate', 'Tax Owed'];
    const rows = gains.map((g) => [
      g.holdingName, g.isin || g.symbol || '',
      g.buyDate.toISOString().split('T')[0],
      g.sellDate.toISOString().split('T')[0],
      g.units.toFixed(4),
      g.buyPrice.toFixed(2),
      g.sellPrice.toFixed(2),
      g.proceeds.toFixed(2),
      g.costBasis.toFixed(2),
      g.gain.toFixed(2),
      g.holdingDays,
      g.isLongTerm ? 'LTCG' : 'STCG',
      (g.taxRate * 100).toFixed(1) + '%',
      g.taxOwed.toFixed(2),
    ]);
    const csv = [header, ...rows].map((r) => r.map((v) => `"${v}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `foliovault-capital-gains-${selectedFy.replace(/\s/g, '_')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!isPro) {
    return (
      <ProLockedPage
        feature="ITR Capital Gains Report"
        description="FIFO-matched realised gains & losses, ready for filing. Export a polished PDF with LTCG/STCG breakdown, tax owed, and broker-friendly columns."
        onUpgrade={onUpgrade}
        icon={<FileText className="w-6 h-6 text-blue-500" />}
      />
    );
  }

  return (
    <div className="space-y-5 font-sans">
      <Helmet>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <FileText className="w-6 h-6 text-blue-500" />
            Capital Gains Report
          </h1>
          <p className="text-sm text-slate-500">
            FIFO-matched realised gains, ready for ITR filing. Exported PDF/CSV includes all required fields.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={selectedFy}
            onChange={(e) => setSelectedFy(e.target.value)}
            className="px-3 py-2 border border-slate-200 dark:border-slate-800 rounded-lg bg-white dark:bg-slate-900 text-sm font-semibold"
          >
            {fys.map((fy) => <option key={fy} value={fy}>{fy}</option>)}
          </select>
          <button
            onClick={exportCSV}
            disabled={gains.length === 0}
            className="px-3 py-2 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-bold rounded-lg flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" /> CSV
          </button>
          <button
            onClick={exportPDF}
            disabled={gains.length === 0 || generating}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-400 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 shadow-sm"
          >
            <FileText className="w-3.5 h-3.5" />
            {generating ? 'Generating…' : 'Export PDF'}
          </button>
        </div>
      </div>

      <div className="p-3 bg-amber-500/5 border border-amber-500/20 rounded-xl flex items-start gap-2 text-xs text-slate-600 dark:text-slate-300">
        <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
        <p>
          This report uses FIFO matching and the standard Indian tax rules (LTCG 12.5% above ₹1.25L exemption, STCG 20%).
          Always cross-check with your broker's Contract Notes & Statement of Accounts before filing.
        </p>
      </div>

      {/* Summary tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <SummaryTile label="LTCG gains" value={summary.ltcg} accent="emerald" />
        <SummaryTile label="LTCL losses" value={summary.ltcl} accent="red" />
        <SummaryTile label="STCG gains" value={summary.stcg} accent="emerald" />
        <SummaryTile label="STCL losses" value={summary.stcl} accent="red" />
        <SummaryTile label="Taxable LTCG" value={summary.netLTCG} accent="amber" note={`after ₹1.25L exempt`} />
        <SummaryTile label="Est. tax payable" value={summary.totalTax} accent="red" big />
      </div>

      {/* Detailed table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <h3 className="text-sm font-black uppercase tracking-tight">Realised transactions ({gains.length})</h3>
        </div>
        {gains.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-10">
            No sell/redemption transactions in {selectedFy}. Switch FY above to see other years.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 dark:bg-slate-950/40 text-[10px] uppercase font-bold text-slate-500">
                <tr>
                  <th className="px-3 py-2 text-left">Holding</th>
                  <th className="px-3 py-2 text-left">ISIN / Symbol</th>
                  <th className="px-3 py-2 text-left">Buy date</th>
                  <th className="px-3 py-2 text-left">Sell date</th>
                  <th className="px-3 py-2 text-right">Units</th>
                  <th className="px-3 py-2 text-right">Buy ₹</th>
                  <th className="px-3 py-2 text-right">Sell ₹</th>
                  <th className="px-3 py-2 text-right">Gain/Loss</th>
                  <th className="px-3 py-2 text-right">Days</th>
                  <th className="px-3 py-2 text-center">Type</th>
                  <th className="px-3 py-2 text-right">Tax ₹</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {gains.map((g, i) => (
                  <tr key={i} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                    <td className="px-3 py-2 font-bold max-w-[200px] truncate">{g.holdingName}</td>
                    <td className="px-3 py-2 font-mono text-slate-500">{g.isin || g.symbol || '—'}</td>
                    <td className="px-3 py-2 font-mono">{formatDate(g.buyDate)}</td>
                    <td className="px-3 py-2 font-mono">{formatDate(g.sellDate)}</td>
                    <td className="px-3 py-2 text-right font-mono">{g.units.toFixed(3)}</td>
                    <td className="px-3 py-2 text-right font-mono">{g.buyPrice.toFixed(2)}</td>
                    <td className="px-3 py-2 text-right font-mono">{g.sellPrice.toFixed(2)}</td>
                    <td className={cn(
                      'px-3 py-2 text-right font-mono font-bold',
                      g.gain > 0 ? 'text-emerald-500' : 'text-red-500',
                    )}>{formatCurrency(g.gain)}</td>
                    <td className="px-3 py-2 text-right font-mono">{g.holdingDays}</td>
                    <td className="px-3 py-2 text-center">
                      <span className={cn(
                        'px-1.5 py-0.5 rounded text-[9px] font-black uppercase',
                        g.isLongTerm ? 'bg-emerald-500/10 text-emerald-600' : 'bg-rose-500/10 text-rose-600',
                      )}>{g.isLongTerm ? 'LTCG' : 'STCG'}</span>
                    </td>
                    <td className="px-3 py-2 text-right font-mono">{formatCurrency(g.taxOwed)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Helpers ────────────────────────────────────────────────────────── */

function fyToStart(fy: string): Date {
  const start = parseInt(fy.split('-')[0].replace(/\D/g, ''), 10);
  return new Date(start, 3, 1, 0, 0, 0, 0);
}
function fyToEnd(fy: string): Date {
  const start = parseInt(fy.split('-')[0].replace(/\D/g, ''), 10);
  return new Date(start + 1, 2, 31, 23, 59, 59, 999);
}

function computeGain(
  h: HoldingWithMetrics,
  units: number, buyPrice: number, sellPrice: number, buyDate: Date, sellDate: Date,
): RealisedGain | null {
  if (units <= 0) return null;
  const proceeds = units * sellPrice;
  const costBasis = units * buyPrice;
  const gain = proceeds - costBasis;
  const days = Math.floor((sellDate.getTime() - buyDate.getTime()) / 86_400_000);
  const isLongTerm = days > 365;
  const taxRate = isLongTerm ? TAX_LTCG_RATE : TAX_STCG_RATE;
  const taxOwed = gain > 0 ? gain * taxRate : 0;
  return {
    holdingId: h.id,
    holdingName: h.name,
    symbol: h.symbol,
    isin: h.isin,
    buyDate, sellDate,
    units, buyPrice, sellPrice, proceeds, costBasis, gain,
    holdingDays: days,
    isLongTerm,
    taxRate, taxOwed,
  };
}

function SummaryTile({
  label, value, accent = 'slate', note, big,
}: {
  label: string; value: number; accent?: 'emerald' | 'red' | 'amber' | 'slate'; note?: string; big?: boolean;
}) {
  const map: Record<string, string> = {
    emerald: 'border-emerald-500/20 bg-emerald-500/5 text-emerald-600',
    red:     'border-red-500/20 bg-red-500/5 text-red-500',
    amber:   'border-amber-500/20 bg-amber-500/5 text-amber-600',
    slate:   'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-300',
  };
  return (
    <div className={cn('p-3 border rounded-xl', map[accent], big && 'ring-2 ring-red-500/40')}>
      <p className="text-[10px] font-black uppercase tracking-widest opacity-80">{label}</p>
      <p className={cn('font-black font-mono mt-0.5', big ? 'text-2xl' : 'text-base')}>{formatCurrency(value)}</p>
      {note && <p className="text-[9px] opacity-60 mt-0.5">{note}</p>}
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
