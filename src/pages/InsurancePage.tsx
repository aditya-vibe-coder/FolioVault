/**
 * Insurance & Loans tracker (Pro).
 * Single page with two tabs: Insurance policies and Outstanding loans.
 */
import { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  ShieldCheck, Heart, Plus, Trash2, X, Save, Edit2, AlertTriangle,
  TrendingDown, Crown,
} from 'lucide-react';
import { useActivePortfolioId } from '../hooks/usePortfolio';
import { useLicense } from '../hooks/useLicense';
import { db } from '../lib/db';
import { ProBadge } from '../components/ui/ProBadge';
import { formatCurrency, formatDate, cn, uuid } from '../lib/formatters';
import type { AppContext } from '../components/Layout';
import type { InsurancePolicy, InsuranceType, Loan, LoanType } from '../types/extra';
import { Helmet } from 'react-helmet-async';

type Tab = 'insurance' | 'loans';

export default function InsurancePage() {
  const { onUpgrade } = useOutletContext<AppContext>();
  const { isPro } = useLicense();
  const portfolioId = useActivePortfolioId();
  const [tab, setTab] = useState<Tab>('insurance');
  const [editing, setEditing] = useState<{ kind: Tab; item: any } | null>(null);
  const [showForm, setShowForm] = useState(false);

  const insurance = useLiveQuery(
    () => portfolioId ? db.insurance.where({ portfolioId }).toArray() : Promise.resolve([] as InsurancePolicy[]),
    [portfolioId], [] as InsurancePolicy[],
  );
  const loans = useLiveQuery(
    () => portfolioId ? db.loans.where({ portfolioId }).toArray() : Promise.resolve([] as Loan[]),
    [portfolioId], [] as Loan[],
  );

  // Ensure a portfolio exists before allowing writes
  useEffect(() => { /* no-op */ }, [portfolioId]);

  if (!isPro) {
    return (
      <ProLockedPage
        feature="Insurance & Loans Tracker"
        description="Track all your term-life, health, and motor policies alongside home, car, and personal loans. See your net financial safety net at a glance."
        onUpgrade={onUpgrade}
        icon={<ShieldCheck className="w-6 h-6 text-white" />}
      />
    );
  }

  const handleDelete = async (kind: Tab, id: string) => {
    if (!confirm('Delete this entry?')) return;
    if (kind === 'insurance') await db.insurance.delete(id);
    else await db.loans.delete(id);
  };

  const totalCover = insurance.reduce((s, i) => s + i.sumAssured, 0);
  const totalPremium = insurance.reduce((s, i) => s + i.premiumAnnual, 0);
  const totalOutstanding = loans.reduce((s, l) => s + l.outstandingPrincipal, 0);
  const totalEMI = loans.reduce((s, l) => s + l.emiAmount, 0);
  const netWorthImpact = totalCover - totalOutstanding;

  return (
    <div className="space-y-5 font-sans">
      <Helmet>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-emerald-500" />
            Insurance & Loans
          </h1>
          <p className="text-sm text-slate-500">Track your coverage and liabilities in one place.</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatTile icon={<ShieldCheck className="w-4 h-4 text-emerald-500" />} label="Total cover" value={formatCurrency(totalCover, { compact: true })} />
        <StatTile icon={<TrendingDown className="w-4 h-4 text-rose-500" />} label="Annual premium" value={formatCurrency(totalPremium, { compact: true })} />
        <StatTile icon={<Heart className="w-4 h-4 text-rose-500" />} label="Outstanding loans" value={formatCurrency(totalOutstanding, { compact: true })} />
        <StatTile icon={<AlertTriangle className="w-4 h-4 text-amber-500" />} label="Monthly EMI burden" value={formatCurrency(totalEMI, { compact: true })} />
      </div>

      <div className="p-3 bg-blue-500/5 border border-blue-500/10 rounded-xl text-xs text-slate-600 dark:text-slate-300">
        <strong>Net financial safety net: {formatCurrency(netWorthImpact, { compact: true })}</strong> — your coverage minus outstanding loans. A positive number means you're well protected; negative means liabilities exceed your cover.
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800">
        <TabButton active={tab === 'insurance'} onClick={() => setTab('insurance')} icon={<ShieldCheck className="w-3.5 h-3.5" />}>
          Insurance ({insurance.length})
        </TabButton>
        <TabButton active={tab === 'loans'} onClick={() => setTab('loans')} icon={<Heart className="w-3.5 h-3.5" />}>
          Loans ({loans.length})
        </TabButton>
        <div className="ml-auto pb-2">
          <button
            onClick={() => { setEditing(null); setShowForm(true); }}
            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" /> Add {tab === 'insurance' ? 'policy' : 'loan'}
          </button>
        </div>
      </div>

      {/* Content */}
      {tab === 'insurance' ? (
        <InsuranceList
          items={insurance}
          onEdit={(i) => { setEditing({ kind: 'insurance', item: i }); setShowForm(true); }}
          onDelete={(id) => handleDelete('insurance', id)}
        />
      ) : (
        <LoanList
          items={loans}
          onEdit={(l) => { setEditing({ kind: 'loans', item: l }); setShowForm(true); }}
          onDelete={(id) => handleDelete('loans', id)}
        />
      )}

      {showForm && (
        tab === 'insurance'
          ? <InsuranceForm
              initial={editing?.item as InsurancePolicy | null}
              onCancel={() => { setShowForm(false); setEditing(null); }}
              onSubmit={async (data) => {
                if (!portfolioId) return;
                if (editing) {
                  await db.insurance.update(editing.item.id, { ...data, updatedAt: new Date() });
                } else {
                  await db.insurance.add({
                    id: uuid(),
                    portfolioId,
                    ...data,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                  } as InsurancePolicy);
                }
                setShowForm(false); setEditing(null);
              }}
            />
          : <LoanForm
              initial={editing?.item as Loan | null}
              onCancel={() => { setShowForm(false); setEditing(null); }}
              onSubmit={async (data) => {
                if (!portfolioId) return;
                if (editing) {
                  await db.loans.update(editing.item.id, { ...data, updatedAt: new Date() });
                } else {
                  await db.loans.add({
                    id: uuid(),
                    portfolioId,
                    ...data,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                  } as Loan);
                }
                setShowForm(false); setEditing(null);
              }}
            />
      )}
    </div>
  );
}

/* ─── Lists ──────────────────────────────────────────────────────────── */

function InsuranceList({
  items, onEdit, onDelete,
}: {
  items: InsurancePolicy[];
  onEdit: (i: InsurancePolicy) => void;
  onDelete: (id: string) => void;
}) {
  if (items.length === 0) {
    return <EmptyState icon={<ShieldCheck className="w-10 h-10" />} message="No insurance policies yet. Add your first one to get a complete view of your financial safety net." />;
  }
  return (
    <div className="space-y-2">
      {items.map((i) => (
        <div key={i.id} className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold truncate">{i.policyName}</p>
            <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">
              {i.provider} · {i.type.replace('_', ' ').toUpperCase()} · Since {formatDate(i.startDate)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase font-black tracking-widest text-slate-500">Cover</p>
            <p className="text-sm font-black font-mono text-emerald-600">{formatCurrency(i.sumAssured, { compact: true })}</p>
            <p className="text-[10px] text-slate-400">Premium {formatCurrency(i.premiumAnnual, { compact: true })}/yr</p>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => onEdit(i)} className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-blue-500"><Edit2 className="w-3.5 h-3.5" /></button>
            <button onClick={() => onDelete(i.id)} className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
          </div>
        </div>
      ))}
    </div>
  );
}

function LoanList({
  items, onEdit, onDelete,
}: {
  items: Loan[];
  onEdit: (l: Loan) => void;
  onDelete: (id: string) => void;
}) {
  if (items.length === 0) {
    return <EmptyState icon={<Heart className="w-10 h-10" />} message="No loans tracked yet. Add your home loan, car loan, or any EMI to see your total liability at a glance." />;
  }
  return (
    <div className="space-y-2">
      {items.map((l) => {
        const paidPct = l.principal > 0 ? ((l.principal - l.outstandingPrincipal) / l.principal) * 100 : 0;
        return (
          <div key={l.id} className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-rose-500/10 text-rose-500 flex items-center justify-center">
                <Heart className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold truncate">{l.lender} · {l.type.replace('_', ' ').toUpperCase()}</p>
                <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">
                  {l.interestRate}% p.a. · {l.tenureMonths} months · EMI {formatCurrency(l.emiAmount, { compact: true })}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[10px] uppercase font-black tracking-widest text-slate-500">Outstanding</p>
                <p className="text-sm font-black font-mono text-rose-500">{formatCurrency(l.outstandingPrincipal, { compact: true })}</p>
                <p className="text-[10px] text-slate-400">of {formatCurrency(l.principal, { compact: true })}</p>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => onEdit(l)} className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-blue-500"><Edit2 className="w-3.5 h-3.5" /></button>
                <button onClick={() => onDelete(l.id)} className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            </div>
            <div className="mt-2">
              <div className="h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                <div className="h-full bg-emerald-500" style={{ width: `${paidPct}%` }} />
              </div>
              <p className="text-[10px] text-slate-500 mt-0.5">{paidPct.toFixed(1)}% paid off</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ─── Forms ──────────────────────────────────────────────────────────── */

function InsuranceForm({
  initial, onCancel, onSubmit,
}: {
  initial: InsurancePolicy | null;
  onCancel: () => void;
  onSubmit: (data: Omit<InsurancePolicy, 'id' | 'portfolioId' | 'createdAt' | 'updatedAt'>) => void;
}) {
  const [type, setType] = useState<InsuranceType>(initial?.type ?? 'term_life');
  const [provider, setProvider] = useState(initial?.provider ?? '');
  const [policyName, setPolicyName] = useState(initial?.policyName ?? '');
  const [policyNumber, setPolicyNumber] = useState(initial?.policyNumber ?? '');
  const [premiumAnnual, setPremiumAnnual] = useState(initial?.premiumAnnual ? String(initial.premiumAnnual) : '');
  const [sumAssured, setSumAssured] = useState(initial?.sumAssured ? String(initial.sumAssured) : '');
  const [startDate, setStartDate] = useState(initial?.startDate ? new Date(initial.startDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(initial?.endDate ? new Date(initial.endDate).toISOString().split('T')[0] : '');
  const [nominee, setNominee] = useState(initial?.nominee ?? '');

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      type, provider, policyName,
      policyNumber: policyNumber || undefined,
      premiumAnnual: parseFloat(premiumAnnual) || 0,
      sumAssured: parseFloat(sumAssured) || 0,
      startDate: new Date(startDate),
      endDate: endDate ? new Date(endDate) : undefined,
      nominee: nominee || undefined,
    });
  };

  return (
    <Modal title={initial ? 'Edit insurance policy' : 'Add insurance policy'} onClose={onCancel}>
      <form onSubmit={submit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Type">
            <select value={type} onChange={(e) => setType(e.target.value as InsuranceType)} className={inputCls}>
              <option value="term_life">Term Life</option>
              <option value="health">Health</option>
              <option value="motor">Motor</option>
              <option value="ulip">ULIP</option>
              <option value="endowment">Endowment</option>
              <option value="other">Other</option>
            </select>
          </Field>
          <Field label="Provider"><input value={provider} onChange={(e) => setProvider(e.target.value)} className={inputCls} placeholder="HDFC Life" required /></Field>
          <Field label="Policy name" className="col-span-2"><input value={policyName} onChange={(e) => setPolicyName(e.target.value)} className={inputCls} placeholder="Click 2 Protect Life" required /></Field>
          <Field label="Policy number"><input value={policyNumber} onChange={(e) => setPolicyNumber(e.target.value)} className={inputCls} /></Field>
          <Field label="Sum assured (₹)"><input type="number" value={sumAssured} onChange={(e) => setSumAssured(e.target.value)} className={inputCls} required /></Field>
          <Field label="Annual premium (₹)"><input type="number" value={premiumAnnual} onChange={(e) => setPremiumAnnual(e.target.value)} className={inputCls} required /></Field>
          <Field label="Start date"><input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={inputCls} /></Field>
          <Field label="Maturity (optional)"><input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className={inputCls} /></Field>
          <Field label="Nominee" className="col-span-2"><input value={nominee} onChange={(e) => setNominee(e.target.value)} className={inputCls} /></Field>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onCancel} className="px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-bold">Cancel</button>
          <button type="submit" className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold flex items-center gap-1"><Save className="w-3.5 h-3.5" /> Save</button>
        </div>
      </form>
    </Modal>
  );
}

function LoanForm({
  initial, onCancel, onSubmit,
}: {
  initial: Loan | null;
  onCancel: () => void;
  onSubmit: (data: Omit<Loan, 'id' | 'portfolioId' | 'createdAt' | 'updatedAt'>) => void;
}) {
  const [type, setType] = useState<LoanType>(initial?.type ?? 'home');
  const [lender, setLender] = useState(initial?.lender ?? '');
  const [principal, setPrincipal] = useState(initial?.principal ? String(initial.principal) : '');
  const [outstanding, setOutstanding] = useState(initial?.outstandingPrincipal ? String(initial.outstandingPrincipal) : '');
  const [interestRate, setInterestRate] = useState(initial?.interestRate ? String(initial.interestRate) : '');
  const [tenure, setTenure] = useState(initial?.tenureMonths ? String(initial.tenureMonths) : '');
  const [emi, setEmi] = useState(initial?.emiAmount ? String(initial.emiAmount) : '');
  const [startDate, setStartDate] = useState(initial?.startDate ? new Date(initial.startDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      type, lender,
      principal: parseFloat(principal) || 0,
      outstandingPrincipal: parseFloat(outstanding) || 0,
      interestRate: parseFloat(interestRate) || 0,
      tenureMonths: parseInt(tenure) || 0,
      emiAmount: parseFloat(emi) || 0,
      startDate: new Date(startDate),
    });
  };

  return (
    <Modal title={initial ? 'Edit loan' : 'Add loan'} onClose={onCancel}>
      <form onSubmit={submit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Type">
            <select value={type} onChange={(e) => setType(e.target.value as LoanType)} className={inputCls}>
              <option value="home">Home Loan</option>
              <option value="personal">Personal Loan</option>
              <option value="car">Car Loan</option>
              <option value="education">Education Loan</option>
              <option value="business">Business Loan</option>
              <option value="gold">Gold Loan</option>
              <option value="credit_card">Credit Card</option>
              <option value="other">Other</option>
            </select>
          </Field>
          <Field label="Lender"><input value={lender} onChange={(e) => setLender(e.target.value)} className={inputCls} placeholder="HDFC Bank" required /></Field>
          <Field label="Original principal (₹)"><input type="number" value={principal} onChange={(e) => setPrincipal(e.target.value)} className={inputCls} required /></Field>
          <Field label="Outstanding (₹)"><input type="number" value={outstanding} onChange={(e) => setOutstanding(e.target.value)} className={inputCls} required /></Field>
          <Field label="Interest rate (% p.a.)"><input type="number" step="0.01" value={interestRate} onChange={(e) => setInterestRate(e.target.value)} className={inputCls} required /></Field>
          <Field label="Tenure (months)"><input type="number" value={tenure} onChange={(e) => setTenure(e.target.value)} className={inputCls} required /></Field>
          <Field label="EMI (₹/month)"><input type="number" value={emi} onChange={(e) => setEmi(e.target.value)} className={inputCls} required /></Field>
          <Field label="Start date" className="col-span-2"><input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={inputCls} /></Field>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onCancel} className="px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-bold">Cancel</button>
          <button type="submit" className="px-3 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold flex items-center gap-1"><Save className="w-3.5 h-3.5" /> Save</button>
        </div>
      </form>
    </Modal>
  );
}

/* ─── Shared bits ────────────────────────────────────────────────────── */

function StatTile({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl">
      <div className="flex items-center gap-1.5">
        {icon}
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">{label}</p>
      </div>
      <p className="text-base font-black font-mono mt-1">{value}</p>
    </div>
  );
}

function TabButton({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'px-4 py-2 font-bold text-xs whitespace-nowrap transition-colors flex items-center gap-1.5 -mb-px border-b-2',
        active ? 'border-blue-500 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700',
      )}
    >
      {icon} {children}
    </button>
  );
}

function EmptyState({ icon, message }: { icon: React.ReactNode; message: string }) {
  return (
    <div className="p-10 text-center bg-white dark:bg-slate-900 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl">
      <div className="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto text-slate-400">
        {icon}
      </div>
      <p className="text-sm text-slate-500 mt-3 max-w-sm mx-auto">{message}</p>
    </div>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-3 animate-fade-in" onClick={onClose}>
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto font-sans" onClick={(e) => e.stopPropagation()}>
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between sticky top-0 bg-white dark:bg-slate-900 z-10">
          <h2 className="text-base font-black uppercase tracking-tight">{title}</h2>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

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

const inputCls = 'w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500';

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
