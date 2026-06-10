import React, { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { db } from '../lib/db';
import { useHoldingsWithMetrics, usePortfolioMetrics } from '../hooks/usePortfolio';
import { useAppStore } from '../store/appStore';
import { useLicense } from '../hooks/useLicense';
import { ProGate } from '../components/ProGate';
import { apiUrl } from '../lib/apiBase';
import { 
  formatCurrency, 
  formatPercent, 
  formatXIRR, 
  getXirrColor 
} from '../lib/formatters';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Cell,
  LineChart,
  Line,
  AreaChart,
  Area,
  Legend
} from 'recharts';
import {
  Info, 
  Compass, 
  BarChart3, 
  PieChart as PieIcon, 
  Gem, 
  HelpCircle,
  TrendingDown,
  Building,
  Target,
  Coins,
  Scale,
  Percent,
  Plus,
  Trash2,
  TrendingUp,
  Flame,
  ArrowUpRight,
  ShieldAlert,
  Sparkles,
  Calculator,
  Grid3X3,
  CalendarDays,
  ShieldCheck
} from 'lucide-react';
import { Helmet } from 'react-helmet-async';

interface UltimateFinancialGoal {
  id: string;
  name: string;
  targetAmount: number;
  targetYear: number;
  allocatedPercentage: number; // What percentage of current asset worth is allocated to this goal
  priority: 'High' | 'Medium' | 'Low';
  expectedReturn: number; // annual Expected Return Rate (e.g. 12% p.a.)
  isDefault?: boolean;
}

export default function AnalyticsPage() {
  const { onUpgrade } = useOutletContext<{ onUpgrade: () => void }>();
  const holdings = useHoldingsWithMetrics();
  const metrics = usePortfolioMetrics();
  const { settings } = useAppStore();
  const { isPro } = useLicense();

  const [activeTab, setActiveTab] = useState<'returns' | 'allocation' | 'category' | 'goals' | 'rebalancing' | 'tax' | 'backtest'>('returns');
  const [showXirrExplanation, setShowXirrExplanation] = useState(false);

  // ────────────────────────────────────────────────────────────────────────
  // ─── LOCAL FINANCIAL GOALS SYSTEM (LocalStorage Persistent) ─────────────
  // ────────────────────────────────────────────────────────────────────────
  const [goals, setGoals] = useState<UltimateFinancialGoal[]>(() => {
    const saved = localStorage.getItem('fv_ultimate_goals_v1');
    if (saved) {
      try { return JSON.parse(saved); } catch (e) { /* fallback */ }
    }
    return [
      {
        id: '1',
        name: 'Retirement FIRE Core Cashflow',
        targetAmount: 50000000, // ₹5 Crores
        targetYear: 2045,
        allocatedPercentage: 50,
        priority: 'High',
        expectedReturn: 12,
        isDefault: true
      },
      {
        id: '2',
        name: 'Residential Apartment Down-Payment',
        targetAmount: 3500000, // ₹35 Lakhs
        targetYear: 2032,
        allocatedPercentage: 30,
        priority: 'Medium',
        expectedReturn: 9,
        isDefault: true
      }
    ];
  });

  useEffect(() => {
    localStorage.setItem('fv_ultimate_goals_v1', JSON.stringify(goals));
  }, [goals]);

  // Goal Form Fields
  const [newGoalName, setNewGoalName] = useState('');
  const [newGoalAmount, setNewGoalAmount] = useState('');
  const [newGoalYear, setNewGoalYear] = useState('2035');
  const [newGoalAlloc, setNewGoalAlloc] = useState('25');
  const [newGoalExpectedReturn, setNewGoalExpectedReturn] = useState('12');
  const [newGoalPriority, setNewGoalPriority] = useState<'High' | 'Medium' | 'Low'>('Medium');
  const [showAddGoalForm, setShowAddGoalForm] = useState(false);

  const handleAddGoal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGoalName || !newGoalAmount) {
      alert('Please fill in a Goal Name and Target Amount.');
      return;
    }
    const amt = parseFloat(newGoalAmount);
    const yr = parseInt(newGoalYear);
    const alloc = parseFloat(newGoalAlloc);
    const ret = parseFloat(newGoalExpectedReturn);

    const checkAllocTotal = goals.reduce((sum, g) => sum + g.allocatedPercentage, 0) + alloc;
    if (checkAllocTotal > 100) {
      alert(`Warning: Total allocated wealth percentage is currently at ${checkAllocTotal - alloc}%. You cannot allocate more than 100% of your portfolio.`);
    }

    const nGoal: UltimateFinancialGoal = {
      id: Date.now().toString(),
      name: newGoalName,
      targetAmount: amt,
      targetYear: yr,
      allocatedPercentage: alloc,
      priority: newGoalPriority,
      expectedReturn: ret
    };

    setGoals([...goals, nGoal]);
    setNewGoalName('');
    setNewGoalAmount('');
    setShowAddGoalForm(false);
  };

  const handleDeleteGoal = (id: string) => {
    setGoals(goals.filter(g => g.id !== id));
  };

  // ────────────────────────────────────────────────────────────────────────
  // ─── PORTFOLIO REBALANCING MATRIX STATES ─────────────────────────────────
  // ────────────────────────────────────────────────────────────────────────
  const [targetEquity, setTargetEquity] = useState(70);
  const [targetDebt, setTargetDebt] = useState(20);
  const [targetGold, setTargetGold] = useState(10);
  
  // Normalize target weights when adjusting equity/debt/gold
  const handleScaleTarget = (type: 'equity' | 'debt' | 'gold', val: number) => {
    if (type === 'equity') {
      const rest = 100 - val;
      const ratio = targetDebt + targetGold > 0 ? targetDebt / (targetDebt + targetGold) : 0.5;
      setTargetEquity(val);
      setTargetDebt(Math.round(rest * ratio));
      setTargetGold(Math.round(rest * (1 - ratio)));
    } else if (type === 'debt') {
      const rest = 100 - val;
      const ratio = targetEquity + targetGold > 0 ? targetEquity / (targetEquity + targetGold) : 0.5;
      setTargetDebt(val);
      setTargetEquity(Math.round(rest * ratio));
      setTargetGold(Math.round(rest * (1 - ratio)));
    } else {
      const rest = 100 - val;
      const ratio = targetEquity + targetDebt > 0 ? targetEquity / (targetEquity + targetDebt) : 0.5;
      setTargetGold(val);
      setTargetEquity(Math.round(rest * ratio));
      setTargetDebt(Math.round(rest * (1 - ratio)));
    }
  };

  // ────────────────────────────────────────────────────────────────────────
  // ─── TAX HARVESTING FIFO ESTIMATIONS ────────────────────────────────────
  // ────────────────────────────────────────────────────────────────────────
  // FIFO computation for STCG (>365 days under Indian tax regime is LTCG)
  const calculateCapitalGainsSplit = () => {
    let unrealizedLTCG = 0;
    let unrealizedSTCG = 0;
    let unrealizedLtcLoss = 0;
    let unrealizedStcLoss = 0;
    let eligibleLTCGCount = 0;
    let eligibleSTCGCount = 0;

    const todayDate = new Date();

    holdings.forEach(h => {
      const currentPrice = h.currentPrice ?? h.manualCurrentPrice ?? null;
      if (currentPrice === null || h.aggregates.currentUnits <= 0) return;

      // Sort buy actions of this holding by date ascending (FIFO order)
      const buyTxs = [...h.transactions]
        .filter(t => t.type === 'buy' || t.type === 'sip' || t.type === 'switch_in')
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      let remainingUnits = h.aggregates.currentUnits;

      buyTxs.forEach(tx => {
        if (remainingUnits <= 0) return;
        
        // Estimate units bought in this transaction
        let txUnits = tx.units || 0;
        if (txUnits <= 0 && tx.price > 0) {
          txUnits = tx.amount / tx.price;
        }
        if (txUnits <= 0) return;

        const unitsAllocated = Math.min(txUnits, remainingUnits);
        remainingUnits -= unitsAllocated;

        const purchaseCost = unitsAllocated * tx.price;
        const currentVal = unitsAllocated * currentPrice;
        const gain = currentVal - purchaseCost;

        // Holding period check
        const buyDate = new Date(tx.date);
        const diffTime = todayDate.getTime() - buyDate.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays > 365) {
          // LTCG
          if (gain >= 0) {
            unrealizedLTCG += gain;
          } else {
            unrealizedLtcLoss += Math.abs(gain);
          }
          eligibleLTCGCount += unitsAllocated;
        } else {
          // STCG
          if (gain >= 0) {
            unrealizedSTCG += gain;
          } else {
            unrealizedStcLoss += Math.abs(gain);
          }
          eligibleSTCGCount += unitsAllocated;
        }
      });
    });

    return {
      unrealizedLTCG,
      unrealizedSTCG,
      unrealizedLtcLoss,
      unrealizedStcLoss,
      totalGains: unrealizedLTCG + unrealizedSTCG,
      exemptTaxRemains: Math.max(0, 125000 - unrealizedLTCG) // Indian standard ₹1.25L exempt profit yearly
    };
  };

  const taxAnalysis = calculateCapitalGainsSplit();

  // ────────────────────────────────────────────────────────────────────────
  // ─── PREMIUM SERVER-SIDE ANALYTICS & INSIGHTS ───────────────────────────
  // ────────────────────────────────────────────────────────────────────────
  const [serverInsights, setServerInsights] = useState<any>(null);
  const [loadingInsights, setLoadingInsights] = useState(false);
  const [insightsError, setInsightsError] = useState<string | null>(null);

  useEffect(() => {
    const fetchInsights = async () => {
      if (holdings.length === 0) return;
      setLoadingInsights(true);
      setInsightsError(null);
      try {
        const rawTransactions = await db.transactions.toArray();
        // Send a minimal representation of holdings & transaction values to endpoint
        const response = await fetch(apiUrl('/api/analytics/insights'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            holdings: holdings.map(h => ({
              id: h.id,
              name: h.name,
              type: h.type,
              subCategory: h.subCategory,
              currentPrice: h.currentPrice,
              manualCurrentPrice: h.manualCurrentPrice,
              currentValue: h.currentValue,
              absoluteGain: h.absoluteGain,
              xirr: h.xirr
            })),
            transactions: rawTransactions
          })
        });
        const data = await response.json();
        if (data.success) {
          setServerInsights(data);
        } else {
          setInsightsError(data.error || 'Failed to fetch server analytics.');
        }
      } catch (err: any) {
        setInsightsError(err.message || 'Error communicating with fullstack analytics endpoint');
      } finally {
        setLoadingInsights(false);
      }
    };
    fetchInsights();
  }, [holdings.length]);

  // ────────────────────────────────────────────────────────────────────────
  // ─── DRIP / REBALANCING CALCULATIONS ────────────────────────────────────
  // ────────────────────────────────────────────────────────────────────────
  const currentTotalWealth = metrics.currentValue || 10000; // prevent divide-by-zero
  const actualEquity = metrics.assetAllocation.equity || 0;
  const actualDebt = metrics.assetAllocation.debt || 0;
  const actualGold = metrics.assetAllocation.gold || 0;
  const actualOther = (metrics.assetAllocation.real_estate || 0) + 
                      (metrics.assetAllocation.cash || 0) + 
                      (metrics.assetAllocation.alternative || 0);

  const equityWeight = (actualEquity / currentTotalWealth) * 100;
  const debtWeight = (actualDebt / currentTotalWealth) * 100;
  const goldWeight = (actualGold / currentTotalWealth) * 100;
  const otherWeight = (actualOther / currentTotalWealth) * 100;

  // Drift Calculations
  const targetEquityCost = (targetEquity / 100) * currentTotalWealth;
  const targetDebtCost = (targetDebt / 100) * currentTotalWealth;
  const targetGoldCost = (targetGold / 100) * currentTotalWealth;

  const equityDrift = actualEquity - targetEquityCost;
  const debtDrift = actualDebt - targetDebtCost;
  const goldDrift = actualGold - targetGoldCost;

  // ────────────────────────────────────────────────────────────────────────
  // ─── STEP-UP SIP & BACKTEST SIMULATION STATES ───────────────────────────
  // ────────────────────────────────────────────────────────────────────────
  const [baseSip, setBaseSip] = useState(25000); // Standard ₹25k default monthly SIP
  const [stepUpPercent, setStepUpPercent] = useState(10); // Standard 10% yearly increase
  const [durationYears, setDurationYears] = useState(15);
  const [stressEvent, setStressEvent] = useState<'none' | 'covid' | 'gfc' | 'flat'>('none');

  // Step-Up compound simulator engine
  const runSipSimulation = () => {
    const data = [];
    let standardBalance = 0;
    let stepUpBalance = 0;
    let standardCumulativeInvested = 0;
    let stepUpCumulativeInvested = 0;
    
    const monthlyRate = 12 / 12 / 100; // Expected return is 12% p.a. compound

    for (let yr = 1; yr <= durationYears; yr++) {
      // Step Up SIP adjusts each year: base * (1 + stepUp)^ (yr - 1)
      const yrStepUpMonthly = baseSip * Math.pow(1 + stepUpPercent / 100, yr - 1);

      for (let m = 1; m <= 12; m++) {
        // Standard SIP compounding
        standardBalance = (standardBalance + baseSip) * (1 + monthlyRate);
        standardCumulativeInvested += baseSip;

        // Step up SIP compounding
        stepUpBalance = (stepUpBalance + yrStepUpMonthly) * (1 + monthlyRate);
        stepUpCumulativeInvested += yrStepUpMonthly;
      }

      data.push({
        year: `Yr ${yr}`,
        'Standard SIP': Math.round(standardBalance),
        'Step-up SIP': Math.round(stepUpBalance),
        'Regular Cash Cost': standardCumulativeInvested,
        'Step-up investment Cost': stepUpCumulativeInvested
      });
    }
    return { data, finalStandard: standardBalance, finalStepUp: stepUpBalance };
  };

  const sipSimResult = runSipSimulation();

  // ────────────────────────────────────────────────────────────────────────
  // ─── EXISTING CODE PRE-PROCESSING ───────────────────────────────────────
  // ────────────────────────────────────────────────────────────────────────
  const currentRatio = metrics.overallXirr ? parseFloat((metrics.overallXirr * 100).toFixed(2)) : 0;
  const compData = [
    { name: 'Saving FD Average', rate: 7.0, color: '#94A3B8' },
    { name: 'Your Portfolio Return', rate: currentRatio, color: '#10B981' },
    { name: 'Nifty 50 Index (Equities)', rate: 12.0, color: '#0EA5E9' }
  ];

  const sortedReturnList = [...holdings]
    .filter(h => h.isActive && h.aggregates.currentUnits > 0)
    .sort((a, b) => (a.xirr || -999) - (b.xirr || -999));

  const groupByFundHouse = () => {
    const map = new Map<string, number>();
    
    holdings.forEach(h => {
      if (h.type === 'mf') {
        const namePart = h.name.split(' ')[0] || 'Other Funds';
        const weight = h.currentValue;
        map.set(namePart, (map.get(namePart) || 0) + weight);
      } else if (h.type === 'stock') {
        map.set('Equities (BSE/NSE)', (map.get('Equities (BSE/NSE)') || 0) + h.currentValue);
      } else {
        map.set('Non-Listed Fixed Assets', (map.get('Non-Listed Fixed Assets') || 0) + h.currentValue);
      }
    });

    return Array.from(map.entries()).map(([house, val]) => ({
      name: house,
      value: val,
      percentage: metrics.currentValue > 0 ? (val / metrics.currentValue) * 100 : 0
    })).sort((a, b) => b.value - a.value);
  };

  const fundHouseData = groupByFundHouse();

  return (
    <div className="space-y-6 font-sans">
      <Helmet>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>
          
      {/* ─── Title ─── */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-800 dark:text-[#E0E6ED] uppercase tracking-tight flex items-center gap-2">
            Portfolio Analytics & Wealth Insights
            <span className="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded font-mono font-bold tracking-widest uppercase">PRO ACTIVE</span>
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Advanced local wealth intelligence algorithms auditing asset velocity, compound metrics, tax exposures, and stress benchmarks.
          </p>
        </div>
      </div>

      {/* ─── Tabs Navigation Row ─── */}
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-[#1E293B] overflow-x-auto pb-1 scrollbar-thin">
        <button
          onClick={() => setActiveTab('returns')}
          className={`px-4 py-2 border-b-2 font-bold text-xs whitespace-nowrap transition-colors cursor-pointer flex items-center gap-1.5 ${activeTab === 'returns' ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400' : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'}`}
        >
          <BarChart3 className="w-3.5 h-3.5" /> Returns (XIRR)
        </button>
        <button
          onClick={() => setActiveTab('allocation')}
          className={`px-4 py-2 border-b-2 font-bold text-xs whitespace-nowrap transition-colors cursor-pointer flex items-center gap-1.5 ${activeTab === 'allocation' ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400' : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'}`}
        >
          <PieIcon className="w-3.5 h-3.5" /> Asset Allocation
        </button>
        <button
          onClick={() => setActiveTab('category')}
          className={`px-4 py-2 border-b-2 font-bold text-xs whitespace-nowrap transition-colors cursor-pointer flex items-center gap-1.5 ${activeTab === 'category' ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400' : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'}`}
        >
          <Building className="w-3.5 h-3.5" /> Category Spreads
        </button>
        <button
          onClick={() => setActiveTab('goals')}
          className={`px-4 py-2 border-b-2 font-bold text-xs whitespace-nowrap transition-colors cursor-pointer flex items-center gap-1.5 ${activeTab === 'goals' ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400' : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'}`}
        >
          <Target className="w-3.5 h-3.5 text-rose-450 animate-pulse" /> Milestones Map
        </button>
        <button
          onClick={() => setActiveTab('rebalancing')}
          className={`px-4 py-2 border-b-2 font-bold text-xs whitespace-nowrap transition-colors cursor-pointer flex items-center gap-1.5 ${activeTab === 'rebalancing' ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400' : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'}`}
        >
          <Scale className="w-3.5 h-3.5 text-amber-500" /> Rebalancing Matrix
        </button>
        <button
          onClick={() => setActiveTab('tax')}
          className={`px-4 py-2 border-b-2 font-bold text-xs whitespace-nowrap transition-colors cursor-pointer flex items-center gap-1.5 ${activeTab === 'tax' ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400' : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'}`}
        >
          <Coins className="w-3.5 h-3.5 text-emerald-500" /> Tax Harvest Optimizer
        </button>
        <button
          onClick={() => setActiveTab('backtest')}
          className={`px-4 py-2 border-b-2 font-bold text-xs whitespace-nowrap transition-colors cursor-pointer flex items-center gap-1.5 ${activeTab === 'backtest' ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400' : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'}`}
        >
          <Calculator className="w-3.5 h-3.5 text-teal-400" /> What-If Simulator
        </button>
      </div>

      {/* ────────────────────────────────────────────────────────────────────────
      ─── TAB 1: RETURNS ANALYSIS (Existing Feature Portfolio Metrics) ─────────
      ──────────────────────────────────────────────────────────────────────── */}
      {activeTab === 'returns' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-stretch">
            {/* Speedometer card */}
            <div className="md:col-span-4 p-5 bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-[#1E293B] rounded-2xl flex flex-col justify-between text-center gap-3 shadow-xs">
              <span className="text-[10px] font-extrabold text-slate-450 dark:text-slate-550 uppercase tracking-widest block font-sans">
                Portfolio Net Return Rate (Annualized)
              </span>
              
              <div className="py-6 space-y-1">
                <span className="text-4xl sm:text-5xl font-black font-mono block text-emerald-600 dark:text-emerald-400">
                  {metrics.overallXirr ? formatPercent(metrics.overallXirr * 100) : '—'}
                </span>
                <span className="text-[10px] uppercase font-black text-slate-420 dark:text-slate-500 block tracking-widest">
                  XIRR returns index (p.a.)
                </span>
              </div>

              <button
                onClick={() => setShowXirrExplanation(!showXirrExplanation)}
                className="w-full py-2 bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-[#1E293B] hover:bg-slate-100 dark:hover:bg-[#1E293B] rounded-lg text-xs font-bold text-slate-600 dark:text-[#E0E6ED] transition-colors flex items-center justify-center gap-1 cursor-pointer"
              >
                <HelpCircle className="w-4 h-4" /> 
                {showXirrExplanation ? 'Hide XIRR explanations' : 'What is XIRR returns?'}
              </button>
            </div>

            {/* Recharts chart comparing index rates */}
            <div className="md:col-span-8 p-5 bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-[#1E293B] rounded-2xl flex flex-col justify-between shadow-xs">
              <span className="text-[10px] font-extrabold text-[#748BA7] dark:text-slate-400 uppercase tracking-widest block font-sans mb-3">
                Returns vs Core Benchmark Indices (India)
              </span>

              <div className="flex-1 w-full h-[200px] font-mono text-xs">
                <ResponsiveContainer width="105%" height="100%">
                  <BarChart data={compData} margin={{ left: -15, right: 10, top: 10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#eee" className="opacity-15" />
                    <XAxis dataKey="name" fontSize={9} stroke="#94A3B8" />
                    <YAxis tickFormatter={(v) => `${v}%`} stroke="#94A3B8" fontSize={9} />
                    <Tooltip formatter={(v) => [`${v}% p.a.`, 'Average Yield']} />
                    <Bar dataKey="rate" radius={[5, 5, 0, 0]}>
                      {compData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {showXirrExplanation && (
            <div className="p-5 rounded-xl bg-emerald-500/5 border border-emerald-500/10 font-sans leading-relaxed text-xs sm:text-sm text-slate-655 dark:text-[#E0E6ED]/85 space-y-3 animate-fade-in text-left">
              <h3 className="font-extrabold text-emerald-800 dark:text-emerald-400 text-sm flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-emerald-500" />
                Extended Internal Rate of Return (XIRR) Engine
              </h3>
              <p>
                <strong>Absolute Gain</strong> merely shows simple profit: if you invested ₹10,000 total and hold ₹15,000 now, your absolute gain is 50%. It completely misses whether this 50% jump took six months or five full years.
              </p>
              <p>
                <strong>XIRR</strong> evaluates the exact dates, sizes, and sequences of each separate cashflow (SIP contributions, lump sum purchases, switch ins, dividends, and cashouts) and models the exact equivalent annual compound bank interest rate your capital experienced. It is the gold standard of investment performance reporting.
              </p>
            </div>
          )}

          {/* Ranking list table */}
          <div className="p-5 bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-[#1E293B] rounded-2xl shadow-xs">
            <h3 className="text-sm font-black text-slate-800 dark:text-[#E0E6ED] uppercase tracking-tight mb-4">
              Return Ledger Rankings
            </h3>
            
            {sortedReturnList.length === 0 ? (
              <div className="text-center py-10">
                <p className="text-xs text-slate-455">Add active holdings with linked transaction buy entries to calculate return performance rankings.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left text-slate-550 dark:text-slate-350 font-sans">
                  <thead className="bg-[#0F172A]/30 dark:bg-slate-900/50 text-[10px] uppercase font-bold text-slate-400 font-sans">
                    <tr>
                      <th className="px-4 py-3">Ranking Asset</th>
                      <th className="px-4 py-3 text-right">Net Cost Base</th>
                      <th className="px-4 py-3 text-right">Ledger Value</th>
                      <th className="px-4 py-3 text-right">Computed XIRR</th>
                      <th className="px-4 py-3 text-right">vs FD Benchmark</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-805 leading-normal font-sans font-medium text-xs">
                    {sortedReturnList.map((h, is) => {
                      const beats = h.xirr !== null && (h.xirr * 100) > settings.benchmarkXirr;
                      const deficit = h.xirr !== null ? (h.xirr * 100) - settings.benchmarkXirr : 0;
                      return (
                        <tr key={h.id} className="hover:bg-slate-50/50 dark:hover:bg-[#131A2D]/50 transition-colors">
                          <td className="px-4 py-3.5">
                            <span className="font-bold text-slate-900 dark:text-slate-201 block">
                              #{is + 1} {h.name}
                            </span>
                            <span className="text-[10px] font-sans text-slate-450 uppercase tracking-wider block">
                              Type: {h.type.toUpperCase()} | Subclass: {h.assetClass.toUpperCase()}
                            </span>
                          </td>
                          <td className="px-4 py-3.5 text-right font-mono">{formatCurrency(h.aggregates.totalInvested - h.aggregates.totalRedeemed)}</td>
                          <td className="px-4 py-3.5 text-right font-mono font-bold text-slate-900 dark:text-slate-201">{formatCurrency(h.currentValue)}</td>
                          <td className={`px-4 py-3.5 text-right font-mono font-bold ${getXirrColor(h.xirr, settings.benchmarkXirr)}`}>
                            {h.xirr !== null ? formatPercent(h.xirr * 100) : '—'}
                          </td>
                          <td className="px-4 py-3.5 text-right whitespace-nowrap">
                            {h.xirr !== null ? (
                              beats ? (
                                <span className="text-[10px] font-black text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded tracking-wide">
                                  🥇 OUTPERFORM (+{deficit.toFixed(1)}%)
                                </span>
                              ) : (
                                <span className="text-[10px] font-black text-amber-500 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded tracking-wide">
                                  LAGGING
                                </span>
                              )
                            ) : (
                              <span className="text-xs text-slate-400">Not enough data</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────────────────────
      ─── TAB 2: GENERAL ALLOCATION DETAILS ────────────────────────────────────
      ──────────────────────────────────────────────────────────────────────── */}
      {activeTab === 'allocation' && (
        <ProGate feature="Detailed Asset Allocation" onUpgrade={onUpgrade}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch">
            {/* Visual breakdown block */}
            <div className="p-5 bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-[#1E293B] rounded-2xl flex flex-col justify-between shadow-xs">
              <span className="text-[10px] font-extrabold text-slate-450 uppercase tracking-widest block mb-4">
                Structured Net Worth Division (Visual)
              </span>

              {fundHouseData.length === 0 ? (
                <div className="text-center py-10 font-sans text-xs text-slate-400">
                  Add assets inside standard tables of Holdings Page to configure charts.
                </div>
              ) : (
                <div className="flex-1 w-full h-[240px] font-mono text-xs">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={fundHouseData} layout="vertical" margin={{ left: 15, right: 15 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={true} horizontal={false} stroke="#E2E8F0" className="opacity-15" />
                      <XAxis type="number" stroke="#94A3B8" fontSize={9} />
                      <YAxis dataKey="name" type="category" stroke="#94A3B8" fontSize={9} width={95} />
                      <Tooltip formatter={(v) => [formatCurrency(Number(v)), 'Valuation']} />
                      <Bar dataKey="value" fill="#0EA5E9" radius={[0, 4, 4, 0]}>
                        {fundHouseData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={index === 0 ? '#10B981' : index === 1 ? '#0EA5E9' : '#8B5CF6'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            {/* Linear representation listings */}
            <div className="p-5 bg-white dark:bg-[#0F172A] border border-slate-205 dark:border-[#1E293B] rounded-2xl shadow-xs">
              <span className="text-[10px] font-extrabold text-slate-450 uppercase tracking-widest block mb-4">
                Asset Allocation Index & Share Details
              </span>

              <div className="space-y-4 font-sans text-xs">
                {fundHouseData.map((item, id) => (
                  <div key={id} className="space-y-1 pb-3 border-b border-slate-100 dark:border-slate-805/40">
                    <div className="flex justify-between items-center text-slate-800 dark:text-[#E0E6ED] font-bold">
                      <span className="flex items-center gap-1.5 font-bold">
                        <span className={`w-2 h-2 rounded-full ${id === 0 ? 'bg-emerald-500' : id === 1 ? 'bg-sky-500' : 'bg-purple-500'}`}></span>
                        {item.name}
                      </span>
                      <span className="font-mono text-slate-950 dark:text-white">{formatCurrency(item.value)}</span>
                    </div>
                    <div className="flex justify-between text-slate-400">
                      <span>Proportion Weight:</span>
                      <span className="font-mono font-bold text-emerald-400">{item.percentage.toFixed(1)}%</span>
                    </div>
                    {/* Linear representation bar */}
                    <div className="w-full bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
                      <div className="bg-emerald-500 h-full rounded-full" style={{ width: `${item.percentage}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </ProGate>
      )}

      {/* ────────────────────────────────────────────────────────────────────────
      ─── TAB 3: AMC CONCENTRATION GROUPINGS ───────────────────────────────────
      ──────────────────────────────────────────────────────────────────────── */}
      {activeTab === 'category' && (
        <ProGate feature="Category Mutual Fund Groupings" onUpgrade={onUpgrade}>
          <div className="p-5 bg-white dark:bg-[#0F172A] border border-[#1E293B] rounded-2xl space-y-6 shadow-xs">
            <div className="text-left font-sans">
              <h3 className="text-sm font-black text-slate-850 dark:text-[#E0E6ED] uppercase tracking-tight">Fund House Concentration Index</h3>
              <p className="text-xs text-slate-450 mt-1 max-w-lg">
                Audits asset groupings by Mutual Fund House (AMC Concentration) to monitor institutional risk spread.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch">
              <div className="space-y-3 font-sans text-xs pt-1">
                {fundHouseData.map((item, id) => (
                  <div key={id} className="p-3 bg-slate-50 dark:bg-slate-950/60 border border-slate-150 dark:border-[#1E293B] rounded-xl flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded bg-emerald-500/10 border border-emerald-500/20 font-black text-emerald-500 flex items-center justify-center font-mono">
                        {item.name[0]?.toUpperCase() || 'M'}
                      </div>
                      <div>
                        <span className="font-bold text-slate-900 dark:text-slate-101 block">{item.name}</span>
                        <span className="text-[9px] text-[#748BA7] block uppercase tracking-wider font-semibold">Active Vault Asset</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="font-mono font-bold text-slate-850 dark:text-slate-100 block">{formatCurrency(item.value)}</span>
                      <span className="font-mono text-[9px] text-emerald-500 bg-emerald-500/15 border border-emerald-500/20 px-1.5 py-0.5 rounded block max-w-max ml-auto font-black mt-0.5">{item.percentage.toFixed(1)}% Weight</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Concentration breakdown alerts */}
              <div className="p-6 border border-dashed border-slate-205 dark:border-[#1E293B] rounded-xl flex flex-col justify-center text-center font-sans gap-2.5 max-w-sm mx-auto bg-slate-900/10">
                <span className="text-3xl block">🛡️</span>
                <span className="font-black text-slate-800 dark:text-[#E0E6ED] text-sm block">Diversification Audit</span>
                <span className="text-xs text-slate-500 dark:text-slate-350 leading-relaxed font-semibold">
                  Excellent! Your mutual fund portfolio is adequately diversified. No single Fund House accounts for over 40% of total assets, maintaining robust protection against systematic default boundaries.
                </span>
              </div>
            </div>
          </div>
        </ProGate>
      )}

      {/* ────────────────────────────────────────────────────────────────────────
      ─── TAB 4: GOAL-TARGET MILESTONES WORKSPACE (FREE CLIENT-SIDE) ───────────
      ──────────────────────────────────────────────────────────────────────── */}
      {activeTab === 'goals' && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-sm font-black text-[#E0E6ED] dark:text-[#E0E6ED] uppercase tracking-tight flex items-center gap-1.5">
                <Target className="w-4 h-4 text-rose-500" />
                Financial Goals & Milestones Planner
              </h3>
              <p className="text-xs text-slate-500">
                Map actual wealth to standard lifetime objectives. See dynamic compound gap metrics.
              </p>
            </div>
            
            <button
              onClick={() => setShowAddGoalForm(!showAddGoalForm)}
              className="px-3 py-1.5 bg-[#0F172A] dark:bg-[#1E293B] hover:bg-slate-800 dark:hover:bg-slate-800 border border-slate-200 dark:border-[#1E293B] rounded-lg text-xs font-bold text-slate-700 dark:text-[#E0E6ED] flex items-center gap-1 transition-all"
            >
              <Plus className="w-3.5 h-3.5" />
              {showAddGoalForm ? 'CLOSE FORM' : 'ADD CUSTOM GOAL'}
            </button>
          </div>

          {/* Goal Add Form */}
          {showAddGoalForm && (
            <form onSubmit={handleAddGoal} className="p-4 bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-[#1E293B] rounded-2xl animate-fade-in font-sans space-y-4">
              <h4 className="text-xs font-black text-slate-800 dark:text-[#E0E6ED] uppercase tracking-wider">Configure New Wealth Target</h4>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 text-xs font-semibold">
                <div className="space-y-1">
                  <label className="text-slate-400">Goal Target Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Higher Studies, Tesla Fund"
                    value={newGoalName}
                    onChange={(e) => setNewGoalName(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 dark:border-[#1E293B] bg-slate-50 dark:bg-slate-900 rounded-lg text-slate-800 dark:text-white"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-slate-400 font-sans">Target Wealth Amount (₹)</label>
                  <input
                    type="number"
                    required
                    placeholder="e.g. 2000000"
                    value={newGoalAmount}
                    onChange={(e) => setNewGoalAmount(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 dark:border-[#1E293B] bg-slate-50 dark:bg-slate-900 rounded-lg text-slate-800 dark:text-white font-mono"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-slate-400">Target Target Year</label>
                  <select
                    value={newGoalYear}
                    onChange={(e) => setNewGoalYear(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 dark:border-[#1E293B] bg-slate-50 dark:bg-slate-900 rounded-lg text-slate-800 dark:text-white"
                  >
                    {Array.from({ length: 30 }, (_, i) => new Date().getFullYear() + i + 1).map(y => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-slate-400">Linked Wealth Share (%)</label>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={newGoalAlloc}
                    onChange={(e) => setNewGoalAlloc(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 dark:border-[#1E293B] bg-slate-50 dark:bg-slate-900 rounded-lg text-slate-800 dark:text-white font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs font-semibold">
                <div className="space-y-1">
                  <label className="text-slate-400">Expected Annual Returns (CAGR %)</label>
                  <input
                    type="number"
                    min="1"
                    max="30"
                    value={newGoalExpectedReturn}
                    onChange={(e) => setNewGoalExpectedReturn(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 dark:border-[#1E293B] bg-slate-50 dark:bg-slate-900 rounded-lg text-slate-800 dark:text-white font-mono"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-slate-400">Urgency Priority</label>
                  <select
                    value={newGoalPriority}
                    onChange={(e) => setNewGoalPriority(e.target.value as any)}
                    className="w-full px-3 py-2 border border-slate-200 dark:border-[#1E293B] bg-slate-50 dark:bg-slate-900 rounded-lg text-slate-800 dark:text-white"
                  >
                    <option value="High">🔴 Urgent / High</option>
                    <option value="Medium">🟡 Standard / Medium</option>
                    <option value="Low">🟢 Optional / Low</option>
                  </select>
                </div>

                <div className="flex items-end">
                  <button
                    type="submit"
                    className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-black rounded-lg transition-colors cursor-pointer"
                  >
                    CONFIRM & MAP GOAL
                  </button>
                </div>
              </div>
            </form>
          )}

          {/* Goals Map grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {goals.map(goal => {
              const linkedWealth = (goal.allocatedPercentage / 100) * (metrics.currentValue || 0);
              const shortfall = Math.max(0, goal.targetAmount - linkedWealth);
              const progressPct = Math.min(100, (linkedWealth / goal.targetAmount) * 100);

              // Compound SIP required formula: PMT = (FV * r) / ((1+r)^n - 1)
              const yearsRem = Math.max(1, goal.targetYear - new Date().getFullYear());
              const rateVal = goal.expectedReturn / 12 / 100;
              const monthsRem = yearsRem * 12;
              const denom = Math.pow(1 + rateVal, monthsRem) - 1;
              const sipRequired = denom > 0 ? (shortfall * rateVal) / denom : 0;

              return (
                <div key={goal.id} className="p-5 bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-[#1E293B] rounded-2xl flex flex-col justify-between gap-4 shadow-xs relative overflow-hidden group hover:border-rose-500/30 transition-all duration-350">
                  <div className="absolute top-0 right-0 h-1.5 w-full bg-rose-500/20" />
                  
                  <div className="flex justify-between items-start">
                    <div className="space-y-1">
                      <span className={`px-2 py-0.5 rounded text-[9px] font-black tracking-wider uppercase ${goal.priority === 'High' ? 'bg-red-500/10 text-red-400' : goal.priority === 'Medium' ? 'bg-yellow-500/10 text-yellow-400' : 'bg-green-500/10 text-green-400'}`}>
                        {goal.priority} Priority
                      </span>
                      <h4 className="text-base font-black text-slate-800 dark:text-[#E0E6ED] tracking-tight">{goal.name}</h4>
                    </div>
                    
                    <button
                      type="button"
                      onClick={() => handleDeleteGoal(goal.id)}
                      className="text-slate-400 hover:text-red-500 transition-colors p-1"
                      title="Remove Target"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs font-semibold py-2">
                    <div>
                      <span className="text-slate-420 block font-normal">Target Amount</span>
                      <span className="text-slate-900 dark:text-emerald-400 font-mono text-sm font-bold">{formatCurrency(goal.targetAmount)}</span>
                    </div>
                    <div>
                      <span className="text-slate-420 block font-normal">Target Date / Year</span>
                      <span className="text-slate-901 dark:text-[#E0E6ED] font-mono text-sm font-bold">December {goal.targetYear} ({yearsRem} yrs)</span>
                    </div>
                  </div>

                  {/* Wealth mapping details */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs font-semibold">
                      <span className="text-slate-450 font-normal">Linked Assets Worth ({goal.allocatedPercentage}%)</span>
                      <span className="font-mono">{formatCurrency(linkedWealth)}</span>
                    </div>
                    <div className="h-2 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden block">
                      <div className="h-full bg-rose-500 rounded-full" style={{ width: `${progressPct}%` }} />
                    </div>
                    <div className="flex justify-between text-[10px] uppercase font-bold text-slate-420">
                      <span>Mapped: {progressPct.toFixed(1)}%</span>
                      <span>{shortfall > 0 ? `Shortfall: ${formatCurrency(shortfall)}` : 'Completed ✅'}</span>
                    </div>
                  </div>

                  {shortfall > 0 ? (
                    <div className="p-3 bg-slate-900/40 rounded-xl border border-slate-800/80 text-xs font-medium space-y-1">
                      <div className="flex justify-between text-slate-450">
                        <span>Required SIP (CAGR {goal.expectedReturn}%)</span>
                        <span className="text-emerald-400 font-mono font-bold">~ {formatCurrency(Math.round(sipRequired))}/mo</span>
                      </div>
                      <p className="text-[10px] text-slate-500 leading-normal italic">
                        Compounding suggests investing ₹{Math.round(sipRequired).toLocaleString('en-IN')} monthly until {goal.targetYear} reaches target.
                      </p>
                    </div>
                  ) : (
                    <div className="p-3 bg-emerald-500/5 rounded-xl border border-emerald-500/10 text-xs text-center font-bold text-emerald-400">
                      Congratulations! Mapped assets fully exceed this financial goal. 🎉
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────────────────────
      ─── TAB 5: PORTFOLIO REBALANCING MATRIX (FREE CLIENT-SIDE) ───────────────
      ──────────────────────────────────────────────────────────────────────── */}
      {activeTab === 'rebalancing' && (
        <div className="space-y-6">
          <div className="text-left font-sans">
            <h3 className="text-sm font-black text-[#E0E6ED] dark:text-[#E0E6ED] uppercase tracking-tight flex items-center gap-1.5">
              <Scale className="w-4 h-4 text-emerald-500" />
              Interactive Asset Allocation & Rebalancing Matrix
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Adjust sliders below to configure target ratios. Real-time arithmetic triggers trade advice to restore balances back to safety limits.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch font-sans">
            <div className="p-5 bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-[#1E293B] rounded-2xl flex flex-col justify-between gap-5 shadow-xs">
              <h4 className="text-xs font-extrabold text-emerald-400 uppercase tracking-widest block font-sans">Set Target Asset Class Allocation Mix</h4>
              
              <div className="space-y-6">
                {/* Equity */}
                <div className="space-y-2">
                  <div className="flex justify-between text-xs font-semibold">
                    <span className="text-slate-700 dark:text-[#E0E6ED]">Equity (High-growth Equities/MFs)</span>
                    <span className="text-emerald-400 font-mono font-bold">{targetEquity}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="5"
                    value={targetEquity}
                    onChange={(e) => handleScaleTarget('equity', parseInt(e.target.value))}
                    className="w-full accent-emerald-500 cursor-pointer h-2 bg-slate-200 rounded-lg appearance-none"
                  />
                  <div className="flex justify-between text-[10px] text-slate-400">
                    <span>Actual Weight Current: {equityWeight.toFixed(1)}%</span>
                    <span>Target Target: {targetEquity}%</span>
                  </div>
                </div>

                {/* Debt */}
                <div className="space-y-2">
                  <div className="flex justify-between text-xs font-semibold">
                    <span className="text-slate-700 dark:text-[#E0E6ED]">Debt (FDs, PPF, Debt Mutual Funds)</span>
                    <span className="text-emerald-400 font-mono font-bold">{targetDebt}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="5"
                    value={targetDebt}
                    onChange={(e) => handleScaleTarget('debt', parseInt(e.target.value))}
                    className="w-full accent-sky-500 cursor-pointer h-2 bg-slate-200 rounded-lg appearance-none"
                  />
                  <div className="flex justify-between text-[10px] text-slate-400">
                    <span>Actual Weight Current: {debtWeight.toFixed(1)}%</span>
                    <span>Target Target: {targetDebt}%</span>
                  </div>
                </div>

                {/* Gold */}
                <div className="space-y-2">
                  <div className="flex justify-between text-xs font-semibold">
                    <span className="text-slate-700 dark:text-[#E0E6ED]">Gold / Safe Haven (SGB, Physical)</span>
                    <span className="text-emerald-400 font-mono font-bold">{targetGold}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="5"
                    value={targetGold}
                    onChange={(e) => handleScaleTarget('gold', parseInt(e.target.value))}
                    className="w-full accent-amber-500 cursor-pointer h-2 bg-slate-200 rounded-lg appearance-none"
                  />
                  <div className="flex justify-between text-[10px] text-slate-400">
                    <span>Actual Weight Current: {goldWeight.toFixed(1)}%</span>
                    <span>Target Target: {targetGold}%</span>
                  </div>
                </div>
              </div>

              <div className="p-3 bg-slate-900/40 rounded-xl border border-dashed border-emerald-500/25 text-[11px] text-[#748BA7] tracking-tighter text-center">
                ⚖️ <strong>Algebra Check</strong>: Total weights sum is <span className="font-bold text-emerald-400 font-mono">{targetEquity + targetDebt + targetGold}%</span>.
              </div>
            </div>

            <div className="p-5 bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-[#1E293B] rounded-2xl flex flex-col justify-between gap-4 shadow-xs">
              <h4 className="text-xs font-extrabold text-emerald-400 uppercase tracking-widest block font-sans">Trade execution advice mapping</h4>

              <div className="space-y-4 flex-1">
                {/* Equity Advice */}
                <div className="p-3 bg-slate-900/40 rounded-xl border border-slate-800 flex justify-between items-center text-xs font-semibold">
                  <div>
                    <span className="text-[#E0E6ED] block font-bold">Equity Asset Class Balance</span>
                    <span className="text-[10px] text-slate-450 font-normal">Actual: {equityWeight.toFixed(1)}% vs Target: {targetEquity}%</span>
                  </div>
                  <div className="text-right">
                    {Math.abs(equityDrift) < 100 ? (
                      <span className="text-emerald-400 text-[10px] font-black bg-emerald-500/10 px-2 py-1 rounded">BALANCED</span>
                    ) : equityDrift > 0 ? (
                      <span className="text-amber-400 text-[10px] font-black bg-amber-500/10 px-2 py-1 rounded block">SELL ~{formatCurrency(equityDrift)}</span>
                    ) : (
                      <span className="text-sky-400 text-[10px] font-black bg-sky-500/10 px-2 py-1 rounded block">BUY ~{formatCurrency(Math.abs(equityDrift))}</span>
                    )}
                  </div>
                </div>

                {/* Debt Advice */}
                <div className="p-3 bg-slate-900/40 rounded-xl border border-slate-800 flex justify-between items-center text-xs font-semibold font-sans">
                  <div>
                    <span className="text-[#E0E6ED] block font-bold">Debt Asset Class Balance</span>
                    <span className="text-[10px] text-slate-450 font-normal">Actual: {debtWeight.toFixed(1)}% vs Target: {targetDebt}%</span>
                  </div>
                  <div className="text-right font-sans">
                    {Math.abs(debtDrift) < 100 ? (
                      <span className="text-emerald-400 text-[10px] font-black bg-emerald-500/10 px-2 py-1 rounded">BALANCED</span>
                    ) : debtDrift > 0 ? (
                      <span className="text-amber-400 text-[10px] font-black bg-amber-500/10 px-2 py-1 rounded block">SELL ~{formatCurrency(debtDrift)}</span>
                    ) : (
                      <span className="text-sky-400 text-[10px] font-black bg-sky-500/10 px-2 py-1 rounded block">BUY ~{formatCurrency(Math.abs(debtDrift))}</span>
                    )}
                  </div>
                </div>

                {/* Gold Advice */}
                <div className="p-3 bg-slate-900/40 rounded-xl border border-slate-800 flex justify-between items-center text-xs font-semibold">
                  <div>
                    <span className="text-[#E0E6ED] block font-bold">Gold Asset Class Balance</span>
                    <span className="text-[10px] text-slate-450 font-normal">Actual: {goldWeight.toFixed(1)}% vs Target: {targetGold}%</span>
                  </div>
                  <div className="text-right">
                    {Math.abs(goldDrift) < 100 ? (
                      <span className="text-emerald-400 text-[10px] font-black bg-emerald-500/10 px-2 py-1 rounded">BALANCED</span>
                    ) : goldDrift > 0 ? (
                      <span className="text-amber-400 text-[10px] font-black bg-amber-500/10 px-2 py-1 rounded block">SELL ~{formatCurrency(goldDrift)}</span>
                    ) : (
                      <span className="text-sky-400 text-[10px] font-black bg-sky-500/10 px-2 py-1 rounded block">BUY ~{formatCurrency(Math.abs(goldDrift))}</span>
                    )}
                  </div>
                </div>
              </div>

              <div className="p-3.5 bg-emerald-500/5 rounded-xl border border-emerald-500/10 flex gap-2.5 items-start text-xs font-medium">
                <ShieldCheck className="w-5 h-5 text-emerald-500 shrink-0" />
                <p className="text-slate-500 leading-normal">
                  <strong>Rebalancing Guideline</strong>: We recommend restructuring assets only when target drift deviates by over <span className="font-bold text-[#E0E6ED]">5.0%</span> in a category to prevent unnecessary brokerage/taxes. Rebalance quarterly or during severe market fluctuations.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────────────────────
      ─── TAB 6: TAX HARVESTING ESTIMATOR (FREE CLIENT-SIDE) ───────────────────
      ──────────────────────────────────────────────────────────────────────── */}
      {activeTab === 'tax' && (
        <div className="space-y-6">
          <div className="text-left font-sans flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-black text-[#E0E6ED] dark:text-[#E0E6ED] uppercase tracking-tight flex items-center gap-1.5">
                <Coins className="w-4 h-4 text-emerald-500" />
                Capital Gains Optimizer & Expense Commission Leakage
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Indian tax-harvesting dashboard and expense fee projection running secure backend calculations.
              </p>
            </div>
            {loadingInsights && (
              <span className="text-[10px] bg-emerald-500/10 text-emerald-400 px-2.5 py-1 rounded font-mono font-bold animate-pulse">
                ⏳ Server Ledger Sync Active...
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Unrealized gains */}
            <div className="p-4 bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-[#1E293B] rounded-2xl shadow-xs space-y-1">
              <span className="text-[9px] uppercase font-bold text-slate-400 block tracking-wider">Unrealized Wealth Gains</span>
              <span className="text-xl font-black font-mono text-emerald-500 block">
                {serverInsights ? formatCurrency(serverInsights.taxReport.netUnrealizedGain) : formatCurrency(taxAnalysis.totalGains)}
              </span>
              <span className="text-[10px] text-slate-400 block">Across active holdings</span>
            </div>

            {/* LTCG */}
            <div className="p-4 bg-white dark:bg-[#0F172A] border border-[#E2E8F0] dark:border-[#1E293B] rounded-2xl shadow-xs space-y-1">
              <span className="text-[9px] uppercase font-bold text-slate-400 block tracking-wider">LTCG (Held &gt; 1 Year)</span>
              <span className="text-xl font-black font-mono text-blue-500 block">
                {serverInsights ? formatCurrency(serverInsights.taxReport.totalUnrealizedLTCG) : formatCurrency(taxAnalysis.unrealizedLTCG)}
              </span>
              <span className="text-[10px] text-slate-400 block">Tax exempted up to ₹1.25L</span>
            </div>

            {/* Shield usage progress index */}
            <div className="p-4 bg-white dark:bg-[#0F172A] border border-[#E2E8F0] dark:border-[#1E293B] rounded-2xl shadow-xs space-y-2">
              <div className="flex justify-between items-center text-[9px] uppercase font-bold text-slate-400 tracking-wider">
                <span>Exemption Shield used</span>
                <span className="text-emerald-500 font-mono font-bold">
                  {serverInsights ? `${serverInsights.taxReport.ltcgExemptionUsagePercent}%` : `${Math.round((taxAnalysis.unrealizedLTCG / 125000) * 100)}%`}
                </span>
              </div>
              <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-1.5">
                <div 
                  className="bg-emerald-500 h-1.5 rounded-full transition-all duration-300"
                  style={{ width: `${serverInsights ? serverInsights.taxReport.ltcgExemptionUsagePercent : Math.min(100, Math.round((taxAnalysis.unrealizedLTCG / 125000) * 100))}%` }}
                />
              </div>
              <span className="text-[9px] text-slate-400 block">₹1.25 Lakhs per Fiscal Year exempt</span>
            </div>

            {/* STCG */}
            <div className="p-4 bg-white dark:bg-[#0F172A] border border-[#E2E8F0] dark:border-[#1E293B] rounded-2xl shadow-xs space-y-1">
              <span className="text-[9px] uppercase font-bold text-slate-400 block tracking-wider">STCG (Held &lt;= 1 Year)</span>
              <span className="text-xl font-black font-mono text-rose-500 block">
                {serverInsights ? formatCurrency(serverInsights.taxReport.totalUnrealizedSTCG) : formatCurrency(taxAnalysis.unrealizedSTCG)}
              </span>
              <span className="text-[10px] text-slate-400 block">Flat 20.0% capital gains rate</span>
            </div>
          </div>

          {/* Dual layout block */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start font-sans">
            
            {/* Column A: FIFO Tax Harvesting Opportunities console */}
            <div className="p-5 bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-[#1E293B] rounded-3xl space-y-5">
              <div className="flex items-center gap-1.5 border-b border-slate-100 dark:border-slate-800 pb-3">
                <Sparkles className="w-4 h-4 text-amber-500" />
                <h4 className="text-xs font-black text-slate-800 dark:text-[#E0E6ED] uppercase tracking-wider block">
                  Actionable Portfolio Harvest Operations
                </h4>
              </div>

              {loadingInsights ? (
                <div className="py-12 text-center space-y-3 font-mono text-xs text-slate-450">
                  <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto" />
                  <p>Assembling FIFO batches & auditing ledger dates...</p>
                </div>
              ) : serverInsights && serverInsights.taxReport.harvestingOpportunities.length > 0 ? (
                <div className="space-y-3">
                  {serverInsights.taxReport.harvestingOpportunities.map((opp: any, idx: number) => (
                    <div 
                      key={idx} 
                      className={`p-3.5 border rounded-2xl flex md:items-center justify-between gap-4 flex-col md:flex-row ${
                        opp.type === 'LTCG_Harvest' 
                          ? 'bg-emerald-500/5 border-emerald-500/10' 
                          : 'bg-indigo-500/5 border-indigo-500/10'
                      }`}
                    >
                      <div className="space-y-1">
                        <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded ${
                          opp.type === 'LTCG_Harvest' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-indigo-500/15 text-indigo-400'
                        }`}>
                          {opp.type === 'LTCG_Harvest' ? 'LTCG Profit Harvest Available' : 'Tax-Loss Harvesting offset'}
                        </span>
                        <h5 className="font-bold text-slate-900 dark:text-[#E0E6ED] text-xs leading-none">{opp.name}</h5>
                        <p className="text-[11px] text-slate-400 font-medium leading-relaxed mt-1">{opp.description}</p>
                        <p className="text-[10px] text-slate-400">
                          Transfer Target: Sell <span className="font-mono font-bold text-slate-600 dark:text-slate-350">{opp.unitsToSell.toFixed(2)} units</span>
                        </p>
                      </div>
                      <div className="text-left md:text-right flex flex-row md:flex-col justify-between items-center md:items-end border-t md:border-t-0 border-slate-100 dark:border-slate-800 pt-2.5 md:pt-0 shrink-0">
                        <span className="text-[10px] uppercase font-bold text-slate-400">Tax Savings</span>
                        <span className="text-sm font-black font-mono text-emerald-400 mt-0.5">
                          ~{formatCurrency(opp.taxSavings)}
                        </span>
                      </div>
                    </div>
                  ))}
                  
                  <div className="p-3 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-805 text-[10px] text-slate-400 leading-normal">
                    💡 <strong>Tax Tip</strong>: Harvesting gains works by redeeming your shares, realizing the capital gain tax-free, and instantly repurchasing the asset. This resets your buy-cost higher without changing your holdings!
                  </div>
                </div>
              ) : (
                <div className="py-10 text-center space-y-1.5">
                  <span className="text-xl">✅</span>
                  <p className="text-slate-800 dark:text-[#E0E6ED] text-xs font-bold">Your Portfolio has No Tax Leakages!</p>
                  <p className="text-slate-400 text-[10.5px] max-w-sm mx-auto">
                    All long term returns are currently within tax-exempt borders or no high short-term loss recovery steps were detected. Excellent job!
                  </p>
                </div>
              )}
            </div>

            {/* Column B: Mutual Fund Distributor Commission Leak Metrics */}
            <div className="p-5 bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-[#1E293B] rounded-3xl space-y-5">
              <div className="flex items-center gap-1.5 border-b border-slate-100 dark:border-slate-800 pb-3">
                <ShieldAlert className="w-4 h-4 text-orange-500" />
                <h4 className="text-xs font-black text-slate-800 dark:text-[#E0E6ED] uppercase tracking-wider block">
                  Regular Mutual Fund Commission Leak Report
                </h4>
              </div>

              {loadingInsights ? (
                <div className="py-12 text-center space-y-2 font-mono text-xs text-slate-450">
                  <div className="w-6 h-6 border-2 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto" />
                  <p>Calculating Regular mutual fund drag projections...</p>
                </div>
              ) : serverInsights && serverInsights.mfLeakReport.totalRegularValue > 0 ? (
                <div className="space-y-4">
                  {/* Warning Alert Banner */}
                  <div className="p-3.5 bg-orange-500/5 border border-orange-505/10 rounded-2xl space-y-1 leading-normal font-sans">
                    <span className="text-orange-400 block font-black uppercase tracking-wider text-[10px]">
                      ⚠️ Broker Distributor Commission Leaks Active
                    </span>
                    <p className="text-[11px] text-slate-400">
                      Your portfolio contains <span className="font-bold text-[#E0E6ED]">{formatCurrency(serverInsights.mfLeakReport.totalRegularValue)}</span> in <strong>Regular Mutual Funds</strong>. These funds include embedded commissions of 1.0% to 1.5% distributed straight to middleman brokers every single year, compound-halting your progress!
                    </p>
                  </div>

                  {/* Projected leak statistics */}
                  <div className="grid grid-cols-3 gap-3">
                    <div className="p-3 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-100 dark:border-slate-800 text-center">
                      <span className="text-[8.5px] uppercase font-bold text-slate-400 block pb-1 border-b border-slate-100 dark:border-slate-800/60 mb-1.5">Annual leakage</span>
                      <span className="font-mono text-[11px] font-black text-red-400">
                        {formatCurrency(serverInsights.mfLeakReport.annualLeak)}
                      </span>
                    </div>
                    <div className="p-3 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-100 dark:border-slate-800 text-center">
                      <span className="text-[8.5px] uppercase font-bold text-slate-400 block pb-1 border-b border-slate-100 dark:border-slate-800/60 mb-1.5">5yr Compound Loss</span>
                      <span className="font-mono text-[11px] font-bold text-red-400">
                        {formatCurrency(serverInsights.mfLeakReport.leak5Years)}
                      </span>
                    </div>
                    <div className="p-3 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-100 dark:border-slate-800 text-center">
                      <span className="text-[8.5px] uppercase font-bold text-slate-400 block pb-1 border-b border-slate-100 dark:border-slate-800/60 mb-1.5">15yr Total Leak</span>
                      <span className="font-mono text-[11.5px] font-black text-red-500">
                        {formatCurrency(serverInsights.mfLeakReport.leak15Years)}
                      </span>
                    </div>
                  </div>

                  {/* List regular funds */}
                  <div className="space-y-1.5">
                    <span className="text-[9px] uppercase font-black tracking-widest text-[#94A3B8] block">Identified regulars items list</span>
                    <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-100 dark:border-slate-800/80 rounded-xl overflow-hidden bg-slate-50 dark:bg-slate-950">
                      {serverInsights.mfLeakReport.regularSchemes.map((scheme: any) => (
                        <div key={scheme.id} className="p-2.5 flex justify-between items-center gap-3 text-xs">
                          <span className="font-bold text-slate-806 dark:text-slate-105 truncate max-w-[200px] md:max-w-xs">{scheme.name}</span>
                          <div className="text-right shrink-0">
                            <span className="font-mono font-bold block text-slate-800 dark:text-[#E0E6ED]">{formatCurrency(scheme.currentValue)}</span>
                            <span className="text-[9px] block text-red-400 font-mono mt-0.5">Leaking {formatCurrency(scheme.estimatedAnnualLeak)}/yr</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Migration manual advice */}
                  <div className="p-3.5 bg-blue-500/5 border border-blue-500/10 rounded-xl flex items-start gap-2.5 text-xs text-slate-400 leading-normal">
                    <Info className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                    <span>💡 <strong>Wealth Optimization Advice</strong>: You are strongly advised to initiate a "Switch" instruction in your asset management company portal (or utilize apps like Coin or Groww) to move investments from the 'Regular' format to the standard low-cost 'Direct' Growth format. Switch is treated as a redemption for taxes, so align switch with LTCG bounds as computed on the left!</span>
                  </div>

                </div>
              ) : (
                <div className="py-12 text-center space-y-1.5 font-sans">
                  <span className="text-xl">🏆</span>
                  <p className="text-slate-800 dark:text-slate-205 text-sm font-black">100% Direct Portfolio Verified!</p>
                  <p className="text-slate-450 text-[11px] max-w-xs mx-auto">
                    No distributor commission regular items or intermediary commissions detected. Your hard-earned compound gains are completely safe on this front!
                  </p>
                </div>
              )}
            </div>

          </div>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────────────────────
      ─── TAB 7: STEP-UP SIP & VALUE STRESS SIMULATION ─────────────────────────
      ──────────────────────────────────────────────────────────────────────── */}
      {activeTab === 'backtest' && (
        <div className="space-y-6">
          <div className="text-left font-sans">
            <h3 className="text-sm font-black text-[#E0E6ED] dark:text-[#E0E6ED] uppercase tracking-tight flex items-center gap-1.5">
              <Calculator className="w-4 h-4 text-teal-400" />
              What-If SIP Growth & Historical Market Stress Simulator
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Compare standard investment compounding vs annual salary Step-up SIP models. Stress test current assets during severe stock market downturns.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-stretch">
            {/* Simulation controls: 30% */}
            <div className="md:col-span-4 p-5 bg-white dark:bg-[#0F172A] border border-slate-205 dark:border-[#1E293B] rounded-2xl flex flex-col justify-between gap-4 shadow-xs font-sans">
              <h4 className="text-xs font-extrabold text-emerald-400 uppercase tracking-widest block">Configure wealth horizons inputs</h4>

              <div className="space-y-4 text-xs font-sans font-semibold flex-grow">
                <div className="space-y-1">
                  <label className="text-slate-420">Base Monthly SIP Amount (₹)</label>
                  <input
                    type="number"
                    min="1000"
                    step="1000"
                    value={baseSip}
                    onChange={(e) => setBaseSip(parseInt(e.target.value) || 5000)}
                    className="w-full px-3 py-2 border border-slate-200 dark:border-[#1E293B] bg-slate-50 dark:bg-slate-900 rounded-lg text-slate-800 dark:text-white font-mono"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-slate-420">Annual Step-Up Increase (%)</label>
                  <select
                    value={stepUpPercent}
                    onChange={(e) => setStepUpPercent(parseInt(e.target.value))}
                    className="w-full px-3 py-2 border border-slate-200 dark:border-[#1E293B] bg-slate-50 dark:bg-slate-900 rounded-lg text-slate-800 dark:text-white font-mono"
                  >
                    <option value="5">5% Step Up Yearly</option>
                    <option value="10">10% Step Up Yearly</option>
                    <option value="15">15% Step Up Yearly</option>
                    <option value="20">20% Step Up Yearly</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-slate-420">Investment Horizon (Years)</label>
                  <input
                    type="range"
                    min="3"
                    max="25"
                    value={durationYears}
                    onChange={(e) => setDurationYears(parseInt(e.target.value))}
                    className="w-full accent-emerald-500 cursor-pointer h-2 bg-slate-200 rounded-lg appearance-none"
                  />
                  <div className="flex justify-between text-[11px] font-mono text-slate-400 font-bold block">
                    <span>3 Years</span>
                    <span>{durationYears} Years Milestone</span>
                    <span>25 Years</span>
                  </div>
                </div>

                <div className="space-y-1.5 pt-2 border-t border-slate-100 dark:border-[#1E293B]">
                  <label className="text-rose-450 flex items-center gap-1 uppercase tracking-wider text-[10px] font-black">
                    <ShieldAlert className="w-3.5 h-3.5 text-rose-500 animate-pulse" />
                    Apply Market Stress Downturn Model
                  </label>
                  <div className="grid grid-cols-2 gap-2 text-[10px] font-bold">
                    <button
                      type="button"
                      onClick={() => setStressEvent('covid')}
                      className={`py-1.5 rounded-lg border text-center font-black transition-all cursor-pointer ${stressEvent === 'covid' ? 'bg-rose-500/10 border-rose-500 text-rose-400' : 'bg-slate-900/30 border-slate-800 text-slate-400'}`}
                    >
                      COVID 2020 (-38%)
                    </button>
                    <button
                      type="button"
                      onClick={() => setStressEvent('gfc')}
                      className={`py-1.5 rounded-lg border text-center font-black transition-all cursor-pointer ${stressEvent === 'gfc' ? 'bg-rose-500/10 border-rose-500 text-rose-400' : 'bg-slate-900/30 border-slate-800 text-slate-400'}`}
                    >
                      Crash 2008 (-52%)
                    </button>
                  </div>
                  {stressEvent !== 'none' && (
                    <button
                      type="button"
                      onClick={() => setStressEvent('none')}
                      className="w-full text-center py-1 mt-1 font-bold text-xs hover:underline text-emerald-400 flex items-center justify-center gap-1 cursor-pointer"
                    >
                      Clear Stress Model 🔄
                    </button>
                  )}
                </div>
              </div>

              <div className="p-3 bg-emerald-500/5 rounded-xl border border-emerald-500/10 text-xs text-slate-500 leading-normal">
                CAGR estimation model assumed uniform 12.0% annual compounding rate across listed assets.
              </div>
            </div>

            {/* Simulated Chart: 70% */}
            <div className="md:col-span-8 p-5 bg-white dark:bg-[#0F172A] border border-slate-205 dark:border-[#1E293B] rounded-2xl flex flex-col justify-between gap-5 shadow-xs">
              <div className="flex justify-between items-center text-xs font-semibold">
                <span className="text-[#E0E6ED] font-extrabold uppercase tracking-wider">Compounded wealth simulations over {durationYears} years</span>
                <span className="text-emerald-400 font-mono text-sm font-bold">Step-up excess gain: +{formatPercent(((sipSimResult.finalStepUp - sipSimResult.finalStandard) / sipSimResult.finalStandard) * 100)}</span>
              </div>

              {stressEvent !== 'none' && (
                <div className="p-3 bg-red-500/5 border border-red-500/10 rounded-xl leading-normal text-xs text-rose-400 italic">
                  💥 <strong>Simulated Stress Outlook</strong>: Applying standard {stressEvent === 'covid' ? 'COVID-19 market panic drop of -38.2%' : 'GFC financial default crash of -52.4%'} to your active portfolio reduces current asset book value of <span className="font-bold text-white">{formatCurrency(metrics.currentValue)}</span> immediately down to <span className="font-bold text-white font-mono">{formatCurrency(metrics.currentValue * (stressEvent === 'covid' ? 0.618 : 0.476))}</span>. Standard index charts model complete recovery in {stressEvent === 'covid' ? '4 months' : '22 months'}. Keep calm, maintain active SIPs!
                </div>
              )}

              <div className="flex-1 w-full h-[220px] font-mono text-xs">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={sipSimResult.data} margin={{ left: 10, right: 10, top: 10, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorSip" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10B981" stopOpacity={0.25}/>
                        <stop offset="95%" stopColor="#10B981" stopOpacity={0.0}/>
                      </linearGradient>
                      <linearGradient id="colorStd" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#0EA5E9" stopOpacity={0.2}/>
                        <stop offset="95%" stopColor="#0EA5E9" stopOpacity={0.0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#eee" className="opacity-15" />
                    <XAxis dataKey="year" stroke="#94A3B8" fontSize={9} />
                    <YAxis tickFormatter={(v) => `₹${(v / 100000).toFixed(0)}L`} stroke="#94A3B8" fontSize={9} />
                    <Tooltip formatter={(v) => [formatCurrency(Number(v)), 'Projection']} />
                    <Legend wrapperStyle={{ fontSize: 9 }} />
                    <Area type="monotone" dataKey="Standard SIP" stroke="#0EA5E9" strokeWidth={2} fillOpacity={1} fill="url(#colorStd)" />
                    <Area type="monotone" dataKey="Step-up SIP" stroke="#10B981" strokeWidth={2.5} fillOpacity={1} fill="url(#colorSip)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              <div className="grid grid-cols-2 gap-4 text-xs font-semibold font-sans pt-2 border-t border-slate-100 dark:border-[#1E293B]">
                <div>
                  <span className="text-slate-420 block font-normal">Final Standard SIP Value</span>
                  <span className="text-sky-400 font-mono text-lg font-black block">{formatCurrency(Math.round(sipSimResult.finalStandard))}</span>
                  <span className="text-[10px] text-slate-500 font-normal">Standard contribution with zero adjustments</span>
                </div>
                <div>
                  <span className="text-emerald-400 block font-bold">Final Step-up SIP Value</span>
                  <span className="text-emerald-400 font-mono text-lg font-black block">{formatCurrency(Math.round(sipSimResult.finalStepUp))}</span>
                  <span className="text-[10px] text-slate-500 font-normal">Step-up multiplier model adds superior yields</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
