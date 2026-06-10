import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import {
  ArrowRight,
  Check,
  ChevronDown,
  Sparkles,
  Crown,
} from 'lucide-react';
import { PrivacyBadge } from '../components/ui/PrivacyBadge';
import { cn } from '../lib/formatters';

const PRO_FEATURES = [
  '✨ AI Portfolio Coach — daily personalised tips',
  '🧾 AI CAS PDF Parser (Gemini)',
  'Unlimited holdings (no 10-cap)',
  'Multi-portfolio support (up to 5)',
  'Zerodha tradebook CSV import',
  'Encrypted cloud backup & multi-device sync',
  'Capital Gains ITR PDF report',
  'Inflation-adjusted real returns',
  'Activity heatmap & analytics',
  'Insurance & Loans tracker',
  'Family profiles (up to 3 members)',
  'Priority email support',
];

export default function LandingPage() {
  const [activeFaq, setActiveFaq] = useState<number | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [billingInterval, setBillingInterval] = useState<'monthly' | 'yearly'>('yearly');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(max-width: 767px)');
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const toggleFaq = (index: number) => {
    setActiveFaq(activeFaq === index ? null : index);
  };

  const faqs = [
    {
      q: "Is my data really private?",
      a: "Yes. Absolutely 100% of your financial data (holdings, buy dates, unit balances, transactions) is stored inside your browser's IndexedDB on your local device. No servers, no APIs, and no third-party trackers can access it. Even when retrieving live stock prices or NAVs, the requests are sent safely for ticker indices only."
    },
    {
      q: "What if I clear my browser data?",
      a: "Since IndexedDB is bound to your browser's storage, clearing browser site data will reset the database. To prevent this from being a problem, FolioVault Pro includes an Encrypted Backup system (.fvb) allowing you to export or restore an encrypted, password-protected file locally in 2 clicks."
    },
    {
      q: "Can I use on multiple devices?",
      a: "Because our database is entirely client-side, automatic syncing across devices does not happen. You can easily move your portfolio between computers or tablets by exporting an Encrypted Backup (.fvb) in settings and uploading it on your other device with your passphrase."
    },
    {
      q: "What mutual fund and stock data do you use?",
      a: "Mutual fund NAVs are updated daily from the public MFAPI.in index, which covers direct and regular schemes across all Indian Asset Management Companies. Stock and ETF tickers are fetched safely in the browser using public Yahoo Finance APIs."
    },
    {
      q: "How do I import my mutual fund transactions?",
      a: "You can download our simple, clean CSV template, list your past transactions, and upload it instantly. We parse files on the fly on your device. Zerodha users can also export tradebook CSV files directly from Console and drag them in."
    },
    {
      q: "Does the license auto-renew?",
      a: "Monthly subscriptions renew automatically each month via Razorpay. Yearly licenses are valid for 365 days. Either way, you can cancel anytime from your dashboard — your data is NEVER touched or deleted."
    },
    {
      q: "What is XIRR and why should I care?",
      a: "Brokers often show 'Absolute Return' or 'CAGR', which hide the timing of your investments. If you invest ₹1 Lakh and it becomes ₹2 Lakhs in 10 years, your absolute gain is 100%, but your actual return is only ~7%. XIRR models erratic buys, monthly SIPs, and partial redemptions precisely to show you the real annual crop of your money."
    },
    {
      q: "Monthly vs yearly — which should I pick?",
      a: "Pick monthly if you want flexibility — cancel anytime, no long-term commitment. Pick yearly if you're committed: you save ₹389 per year (33% off). Either way you get the same Pro features, the same data, and the same privacy."
    },
  ];

  return (
    <div className="bg-slate-50 dark:bg-slate-950 text-slate-850 dark:text-slate-100 min-h-screen font-sans antialiased transition-colors scroll-smooth">
      <Helmet>
        <title>FolioVault — Privacy-First Indian Investment Portfolio Tracker</title>
        <meta name="description" content="Track mutual funds, stocks, PPF, NPS, FDs, SGBs, and gold in one place. Accurate XIRR, AI CAS PDF parser, capital gains ITR reports. Your data never leaves your device. Free for up to 10 holdings." />
        <link rel="canonical" href="https://foliovault.harmnix.com/" />
        <meta property="og:url" content="https://foliovault.harmnix.com/" />
        <meta property="og:title" content="FolioVault — Privacy-First Indian Portfolio Tracker" />
        <meta property="og:description" content="All your Indian investments tracked locally. XIRR, CAS PDF import, capital gains reports. No account needed." />
      </Helmet>

      {/* ─── Navigation Header ────────────────────────────────────────────────── */}
      <header className="border-b border-slate-200/60 dark:border-slate-900 bg-white/85 dark:bg-slate-950/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-5 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center font-bold text-white text-base">
              FV
            </div>
            <span className="text-xl font-bold font-sans text-slate-900 dark:text-slate-100 tracking-tight">
              FolioVault
            </span>
            <PrivacyBadge className="hidden sm:inline-flex" />
          </div>
          <div className="flex items-center gap-4">
            <Link 
              to="/app/dashboard"
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold transition-colors flex items-center gap-1 cursor-pointer"
            >
              Enter App <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </header>

      {/* ─── Hero Section ─────────────────────────────────────────────────────── */}
      <section className="py-16 md:py-24 px-5 select-none">
        <div className="max-w-4xl mx-auto text-center flex flex-col items-center gap-6">
          <div className="p-1 px-3 rounded-full bg-blue-50 dark:bg-blue-950/40 border border-blue-100 dark:border-blue-900/60 text-blue-700 dark:text-blue-400 text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5 animate-bounce">
            <Sparkles className="w-3.5 h-3.5" /> Track Safely, Track Privately
          </div>

          <h1 className="text-4xl sm:text-5xl md:text-6xl font-black font-sans text-slate-900 dark:text-slate-50 tracking-tight leading-[1.1] max-w-3xl">
            Your Complete Indian Investment Portfolio Tracker.<br />
            <span className="text-blue-600 dark:text-blue-500 bg-linear-to-r from-blue-600 to-indigo-600 dark:from-blue-400 dark:to-indigo-400 bg-clip-text text-transparent">
              Private by Design.
            </span>
          </h1>

          <p className="text-base sm:text-lg md:text-xl text-slate-600 dark:text-slate-400 max-w-2xl font-sans font-medium leading-relaxed">
            Track mutual funds, stocks, PPF, NPS, FDs, and gold in one clean screen. 
            XIRR calculated precisely. No account required. No cloud database. 
            All financial data stays strictly on your browser.
          </p>

          <div className="flex flex-col sm:flex-row items-center gap-3 mt-4 w-full justify-center">
            <Link 
              to="/app/dashboard"
              className="w-full sm:w-auto px-7 py-3.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-base font-bold shadow-lg hover:shadow-xl transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              Start Free — No Account Needed
            </Link>
            <a 
              href="#pricing"
              className="w-full sm:w-auto px-7 py-3.5 bg-slate-100 dark:bg-slate-900 hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 rounded-xl text-base font-bold transition-all flex items-center justify-center cursor-pointer"
            >
              See Pricing
            </a>
          </div>

          <span className="text-xs font-semibold text-slate-400 uppercase tracking-widest mt-1">
            Free forever for up to 10 holdings
          </span>

          {/* Screenshot Placeholder/Mockup */}
          <div className="w-full mt-12 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/40 dark:bg-slate-900/40 p-3 shadow-2xl backdrop-blur-xs select-none relative animate-fade-in">
            <div className="rounded-xl border border-slate-200/80 dark:border-slate-800 overflow-hidden bg-slate-100 dark:bg-slate-950 shadow-inner p-4 flex flex-col gap-4">
              <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-red-400" />
                  <div className="w-3 h-3 rounded-full bg-yellow-400" />
                  <div className="w-3 h-3 rounded-full bg-green-400" />
                </div>
                <div className="h-5 px-3 rounded-md bg-slate-200 dark:bg-slate-900 text-[10px] text-slate-400 font-mono flex items-center">
                  localhost:3000/app/dashboard
                </div>
                <div className="w-12 h-2" />
              </div>

              {/* Dashboard Preview Cards Mock */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-left">
                <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
                  <span className="text-[10px] font-bold text-slate-400 block uppercase">Net Worth</span>
                  <span className="text-lg font-bold font-mono text-slate-800 dark:text-slate-105 block">₹14,56,820</span>
                </div>
                <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
                  <span className="text-[10px] font-bold text-slate-400 block uppercase">Net Invested</span>
                  <span className="text-lg font-bold font-mono text-slate-800 dark:text-slate-105 block">₹10,50,000</span>
                </div>
                <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
                  <span className="text-[10px] font-bold text-slate-400 block uppercase">Absolute Gain</span>
                  <span className="text-lg font-bold font-mono text-emerald-600 block">+₹4,06,820</span>
                </div>
                <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
                  <span className="text-[10px] font-bold text-slate-400 block uppercase">Overall XIRR</span>
                  <span className="text-lg font-bold font-mono text-blue-600 block">16.48% p.a.</span>
                </div>
              </div>
            </div>
            <div className="absolute inset-0 rounded-2xl bg-gradient-to-t from-slate-50/20 via-transparent to-transparent flex items-end justify-center pb-6">
              <Link 
                to="/app/dashboard"
                className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white dark:bg-white dark:text-slate-900 rounded-lg text-xs font-bold shadow-lg transition-transform hover:-translate-y-0.5 cursor-pointer"
              >
                Launch Demo Dashboard
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Privacy Proof Section ────────────────────────────────────────────── */}
      <section className="py-16 bg-white dark:bg-slate-900 border-y border-slate-200 dark:border-slate-900 px-5">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-2xl sm:text-3xl font-extrabold font-sans text-slate-900 dark:text-slate-105">
              The FolioVault Security Guarantee
            </h2>
            <p className="text-sm sm:text-base text-slate-500 dark:text-slate-450 mt-1 max-w-lg mx-auto">
              We engineered the tracker starting with your right to secure, private bookkeeping.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            <div className="flex flex-col gap-3 p-6 rounded-xl border border-slate-150 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50">
              <div className="w-10 h-10 rounded-lg bg-emerald-100 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold">
                🔒
              </div>
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                Zero Data Upload
              </h3>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 leading-relaxed font-sans font-medium">
                All math, charts, and values are calculated entirely inside your browser. We never run databases that see your portfolios or holding profiles.
              </p>
            </div>

            <div className="flex flex-col gap-3 p-6 rounded-xl border border-slate-150 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50">
              <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold">
                🌐
              </div>
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                Works Offline
              </h3>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 leading-relaxed font-sans font-medium">
                Once loaded, browsing your historical holdings works smoothly without any active internet connection. Index quotes fetch instantly on demand.
              </p>
            </div>

            <div className="flex flex-col gap-3 p-6 rounded-xl border border-slate-150 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50">
              <div className="w-10 h-10 rounded-lg bg-amber-100 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 flex items-center justify-center font-bold">
                🚫
              </div>
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                No Selling or Cross-pitching
              </h3>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 leading-relaxed font-sans font-medium">
                We charge ₹99/month or ₹799/year. We never cross-sell credit cards, insurance policy trackers, regular commission mutual funds, or trade signals.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Features grid Section ──────────────────────────────────────────────── */}
      <section className="py-20 px-5 max-w-5xl mx-auto">
        <div className="space-y-20">
          
          <div className="flex flex-col md:flex-row items-center gap-10">
            <div className="flex-1 space-y-4">
              <span className="text-xs font-bold text-blue-600 uppercase tracking-widest block font-mono">FINANCIAL INTEGRITY</span>
              <h3 className="text-2xl sm:text-3xl font-extrabold text-slate-950 dark:text-slate-100 font-sans tracking-tight leading-tight">
                Accurate XIRR, Finally.
              </h3>
              <p className="text-sm sm:text-base text-slate-500 dark:text-slate-400 font-sans font-medium leading-relaxed">
                Standard brokerages show absolute metrics which are impressive but ignore the crucial time matrix. FolioVault implements real, spreadsheet-grade Excel-compatible XIRR equations. Model irregularities, monthly SIP investments, partial withdrawals, interest, and bonus splits correctly.
              </p>
            </div>
            <div className="flex-1 w-full p-4 border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 font-sans text-xs">
              <span className="font-semibold text-slate-500 uppercase block mb-3 text-[10px] tracking-wider">Example: XIRR vs Absolute Gain</span>
              <div className="space-y-2">
                <div className="flex justify-between border-b pb-1">
                  <span>Investment (01-Jan-2023):</span>
                  <span className="font-mono font-bold">-₹1,00,000</span>
                </div>
                <div className="flex justify-between border-b pb-1">
                  <span>Sells / Redemption (01-Jun-2023):</span>
                  <span className="font-mono font-bold">+₹20,000</span>
                </div>
                <div className="flex justify-between border-b pb-1">
                  <span>Current Value (01-Jan-2024):</span>
                  <span className="font-mono font-bold">+₹95,000</span>
                </div>
                <div className="flex justify-between pt-1 font-semibold text-sm">
                  <span>Absolute Gain:</span>
                  <span className="text-emerald-600 font-mono">+15.00%</span>
                </div>
                <div className="flex justify-between font-semibold text-sm">
                  <span>XIRR Annualized Return:</span>
                  <span className="text-blue-600 font-mono">+17.82% p.a.</span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-col md:flex-row-reverse items-center gap-10">
            <div className="flex-1 space-y-4">
              <span className="text-xs font-bold text-blue-600 uppercase tracking-widest block font-mono">CONSOLIDATION</span>
              <h3 className="text-2xl sm:text-3xl font-extrabold text-slate-950 dark:text-slate-100 font-sans tracking-tight leading-tight">
                All Investments in One View.
              </h3>
              <p className="text-sm sm:text-base text-slate-500 dark:text-slate-400 font-sans font-medium leading-relaxed">
                Track direct or regular mutual funds, stocks listed across NSE and BSE exchanges, PPF contributions, NPS tier splits, multi-bank Fixed Deposits, Sovereign Gold Bonds, and physical gold holdings. Group assets seamlessly and check real-time net-worth allocation without compromising data privacy.
              </p>
            </div>
            <div className="flex-1 w-full grid grid-cols-2 gap-3 text-sm text-left">
              {[
                { label: 'Mutual Funds', type: 'Direct & Regular Growth' },
                { label: 'Indian Stocks', type: 'NSE/BSE Listed Market Quotes' },
                { label: 'Government schemes', type: 'PPF & national NPS pension' },
                { label: 'Fixed Income', type: 'FDs, saving logs & gold' },
              ].map((item, id) => (
                <div key={id} className="p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg">
                  <span className="font-bold block text-slate-800 dark:text-slate-100">{item.label}</span>
                  <span className="text-xs text-slate-550 dark:text-slate-400 mt-0.5 block">{item.type}</span>
                </div>
              ))}
            </div>
          </div>

        </div>
      </section>

      {/* ─── AI Features Section (highlighted Pro) ─────────────────────────────── */}
      <section className="py-20 bg-gradient-to-br from-purple-600 via-fuchsia-600 to-pink-500 text-white px-5 relative overflow-hidden">
        <div className="absolute -top-32 -right-24 w-96 h-96 rounded-full bg-white/10 blur-3xl" />
        <div className="absolute -bottom-32 -left-24 w-96 h-96 rounded-full bg-pink-300/20 blur-3xl" />
        <div className="max-w-5xl mx-auto relative">
          <div className="text-center mb-12">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/15 border border-white/20 text-[10px] font-black uppercase tracking-widest">
              <Sparkles className="w-3 h-3" /> AI-Powered · Pro
            </span>
            <h2 className="text-3xl sm:text-4xl font-black font-sans tracking-tight leading-tight mt-3">
              A Coach That Actually Knows<br />Your Money.
            </h2>
            <p className="text-sm sm:text-base text-white/80 mt-3 max-w-2xl mx-auto leading-relaxed">
              Two AI features, both privacy-first. We only ever send a sanitised, aggregated summary of your portfolio — never your raw transactions.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-5">
            {/* AI Coach */}
            <div className="p-6 bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl space-y-3">
              <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center">
                <Sparkles className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-black tracking-tight">AI Portfolio Coach</h3>
              <p className="text-sm text-white/80 leading-relaxed">
                Personalised, plain-English insights about your real portfolio — diversification, XIRR vs FD benchmarks, regular-MF commission leak, tax harvesting. Chat with it like a CA friend.
              </p>
              <ul className="text-xs text-white/75 space-y-1.5 pt-1">
                <li className="flex items-start gap-1.5">✓ 4-6 daily personalised insights</li>
                <li className="flex items-start gap-1.5">✓ Free-form Q&amp;A on your portfolio</li>
                <li className="flex items-start gap-1.5">✓ Indian tax rules baked in (LTCG 12.5%, STCG 20%, 80C)</li>
              </ul>
            </div>

            {/* AI CAS Parser */}
            <div className="p-6 bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl space-y-3">
              <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center text-2xl">
                🧾
              </div>
              <h3 className="text-lg font-black tracking-tight">AI CAS PDF Parser</h3>
              <p className="text-sm text-white/80 leading-relaxed">
                Drop in your CAMS or KFintech Consolidated Account Statement. Gemini reads every folio, every SIP, every switch — even password-protected PDFs — and imports the whole ledger in one click.
              </p>
              <ul className="text-xs text-white/75 space-y-1.5 pt-1">
                <li className="flex items-start gap-1.5">✓ Works with CAMS &amp; KFintech CAS</li>
                <li className="flex items-start gap-1.5">✓ Password-protected PDFs supported</li>
                <li className="flex items-start gap-1.5">✓ Years of history imported in seconds</li>
              </ul>
            </div>
          </div>

          <div className="text-center mt-8">
            <Link
              to="/app/dashboard"
              className="inline-flex items-center gap-2 px-6 py-3 bg-white text-purple-700 hover:bg-slate-100 font-black rounded-xl text-sm shadow-lg transition-transform hover:-translate-y-0.5"
            >
              Try Pro free for a day →
            </Link>
            <p className="text-[10px] text-white/70 mt-2 uppercase tracking-widest font-bold">
              From ₹99/mo · Cancel anytime
            </p>
          </div>
        </div>
      </section>

      {/* ─── Comparison Table Section ─────────────────────────────────────────── */}
      <section className="py-20 bg-white dark:bg-slate-900 border-y border-slate-200 dark:border-slate-900 px-5">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-2xl sm:text-3xl font-black font-sans text-slate-900 dark:text-slate-100 leading-tight">
              Why Investors Choose FolioVault
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-sm mx-auto font-sans font-medium">
              A quick comparison of safety-first tracking compared to traditional platforms.
            </p>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm max-w-full">
            <table className="w-full text-sm text-left text-slate-600 dark:text-slate-350 bg-white dark:bg-slate-900">
              <thead className="bg-slate-50 dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 uppercase tracking-wider border-b border-slate-200 dark:border-slate-700">
                <tr>
                  <th className="px-5 py-4">Feature</th>
                  <th className="px-5 py-4 text-blue-600 dark:text-blue-400">FolioVault</th>
                  <th className="px-5 py-4">INDmoney</th>
                  <th className="px-5 py-4">Kuvera</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-150 dark:divide-slate-800 font-sans font-medium">
                <tr>
                  <td className="px-5 py-3.5 text-slate-900 dark:text-slate-200 font-medium">Private IndexedDB storage</td>
                  <td className="px-5 py-3.5 text-emerald-600 font-bold">✅ Yes (105% Offline)</td>
                  <td className="px-5 py-3.5 text-red-500">❌ Uploaded to server</td>
                  <td className="px-5 py-3.5 text-red-500">❌ Uploaded to server</td>
                </tr>
                <tr>
                  <td className="px-5 py-3.5 text-slate-900 dark:text-slate-200 font-medium">Earns via selling profiles</td>
                  <td className="px-5 py-3.5 text-emerald-650 font-bold text-emerald-600">❌ Never</td>
                  <td className="px-5 py-3.5 text-amber-600">⚠️ Yes (Brokerage bias)</td>
                  <td className="px-5 py-3.5 text-amber-600">⚠️ Yes (Product sales)</td>
                </tr>
                <tr>
                  <td className="px-5 py-3.5 text-slate-900 dark:text-slate-200 font-medium">Calculates granular XIRR</td>
                  <td className="px-5 py-3.5 text-emerald-600 font-bold">✅ Fully accurate</td>
                  <td className="px-5 py-3.5">⚠️ Basic absolute only</td>
                  <td className="px-5 py-3.5">⚠️ Basic static</td>
                </tr>
                <tr>
                  <td className="px-5 py-3.5 text-slate-900 dark:text-slate-200 font-medium">Mandatory phone login</td>
                  <td className="px-5 py-3.5 text-emerald-600 font-bold">❌ No, instant launch</td>
                  <td className="px-5 py-3.5 text-red-500">✅ Required with OTP</td>
                  <td className="px-5 py-3.5 text-red-500">✅ Required with credentials</td>
                </tr>
                <tr>
                  <td className="px-5 py-3.5 text-slate-900 dark:text-slate-200 font-medium">Pricing model</td>
                  <td className="px-5 py-3.5 text-blue-600 font-bold">₹99/mo or ₹799/yr</td>
                  <td className="px-5 py-3.5 text-slate-400 dark:text-slate-400">Free (User is inventory)</td>
                  <td className="px-5 py-3.5 text-slate-400 dark:text-slate-400">Free (User is inventory)</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="text-center font-sans font-bold text-slate-400 text-xs mt-3 italic leading-relaxed uppercase tracking-wider">
            * Note: "Free" tools earn revenue by selling you financial products. You are their inventory product.
          </p>
        </div>
      </section>

      {/* ─── Pricing Section ─────────────────────────────────────────────────── */}
      <section id="pricing" className="py-20 px-5">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-extrabold font-sans text-slate-900 dark:text-slate-100 tracking-tight leading-tight">
              One Flat Price. Zero Sales Reps.
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-md mx-auto font-sans font-semibold">
              Pay monthly for flexibility, or yearly to save 33%. Cancel anytime — your data is always yours.
            </p>
          </div>

          {/* Billing interval toggle */}
          <div className="flex justify-center mb-10">
            <div className="inline-flex bg-slate-100 dark:bg-slate-900 p-1 rounded-xl border border-slate-200 dark:border-slate-800">
              <button
                onClick={() => setBillingInterval('monthly')}
                className={cn(
                  'px-5 py-2 rounded-lg text-sm font-bold transition-all',
                  billingInterval === 'monthly'
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300',
                )}
              >
                Monthly
              </button>
              <button
                onClick={() => setBillingInterval('yearly')}
                className={cn(
                  'px-5 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-1.5',
                  billingInterval === 'yearly'
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300',
                )}
              >
                Yearly
                <span className="px-1.5 py-0.5 rounded text-[10px] font-black bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 uppercase">
                  Save 33%
                </span>
              </button>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-8 max-w-2xl mx-auto items-stretch font-sans">

            {/* Free Plan */}
            <div className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col justify-between">
              <div>
                <span className="text-xs font-bold text-slate-400 block uppercase tracking-widest">Free Tier</span>
                <span className="text-3xl font-black text-slate-900 dark:text-slate-100 mt-2 block font-mono">₹0</span>
                <span className="text-[11px] text-slate-400 block mt-1">Perfect for trial tracking</span>
                <hr className="my-4 border-slate-200 dark:border-slate-800" />
                <ul className="space-y-2.5 text-xs font-semibold">
                  <li className="flex items-center gap-2"><Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" /> Up to 10 active holdings</li>
                  <li className="flex items-center gap-2"><Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" /> Accurate Newton-Raphson XIRR</li>
                  <li className="flex items-center gap-2"><Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" /> Local IndexedDB storage</li>
                  <li className="flex items-center gap-2"><Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" /> Manual transaction entry</li>
                  <li className="flex items-center gap-2"><Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" /> Free PDF Capital Gains report</li>
                  <li className="text-slate-400 line-through">❌ Excel / Zerodha CSV Import</li>
                  <li className="text-slate-400 line-through">❌ AI Coach & Cloud backup</li>
                </ul>
              </div>
              <Link
                to="/app/dashboard"
                className="w-full py-2.5 px-4 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-center text-xs font-bold rounded-lg mt-6 text-slate-800 dark:text-slate-200"
              >
                Launch Free Tracker
              </Link>
            </div>

            {/* Pro Plan */}
            <div className="p-6 rounded-2xl border-2 border-amber-500 bg-white dark:bg-slate-900 flex flex-col justify-between relative shadow-xl transform md:-translate-y-2">
              <span className="absolute top-0 right-0 transform translate-x-0 -translate-y-1/2 p-1 px-3 bg-gradient-to-r from-amber-500 to-orange-500 rounded-full text-[9px] text-white font-extrabold uppercase tracking-widest shadow-md flex items-center gap-1">
                <Crown className="w-2.5 h-2.5" /> Most Popular
              </span>
              <div>
                <span className="text-xs font-bold text-amber-600 dark:text-amber-400 block uppercase tracking-widest">FolioVault Pro</span>
                <div className="flex items-end gap-1 mt-2">
                  <span className="text-4xl font-black text-slate-900 dark:text-slate-100 font-mono">
                    {billingInterval === 'yearly' ? '₹799' : '₹99'}
                  </span>
                  <span className="text-sm text-slate-500 font-bold pb-1.5">
                    /{billingInterval === 'yearly' ? 'year' : 'month'}
                  </span>
                </div>
                <span className="text-[11px] text-emerald-600 dark:text-emerald-400 block mt-1 font-bold">
                  {billingInterval === 'yearly'
                    ? 'Just ₹67/month — billed annually. Save ₹389 vs monthly.'
                    : 'Flexible. Cancel anytime. No commitment.'}
                </span>
                <hr className="my-4 border-slate-200 dark:border-slate-800" />
                <ul className="space-y-2 text-xs font-semibold grid grid-cols-1 sm:grid-cols-2 gap-x-3">
                  {PRO_FEATURES.map((f) => (
                    <li key={f} className="flex items-start gap-1.5">
                      <Check className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <Link
                to="/app/dashboard"
                className="w-full py-3 px-4 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white text-center text-sm font-black rounded-lg mt-6 shadow-lg shadow-amber-500/20 transition-all"
              >
                {billingInterval === 'yearly' ? 'Start Yearly — ₹799' : 'Start Monthly — ₹99'}
              </Link>
            </div>

          </div>

          <p className="text-center text-xs text-slate-400 mt-8 italic">
            Secure payment by Razorpay. We never sell your data, never cross-sell, never spam.
          </p>
        </div>
      </section>

      {/* ─── FAQ Section ─────────────────────────────────────────────────────── */}
      <section className="py-20 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-900 px-5">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-2xl sm:text-3xl font-black font-sans text-slate-900 dark:text-slate-105 leading-tight">
              Frequently Asked Questions
            </h2>
            <p className="text-sm text-slate-400 mt-1 max-w-sm mx-auto font-sans font-medium">
              We answers all your queries about security, browser states, and renewals.
            </p>
          </div>

          <div className="space-y-4 font-sans max-w-2xl mx-auto">
            {faqs.map((faq, idx) => (
              <div 
                key={idx} 
                className="border border-slate-150 dark:border-slate-800 rounded-xl bg-slate-50 dark:bg-slate-950/30 overflow-hidden"
              >
                <button
                  onClick={() => toggleFaq(idx)}
                  className="w-full flex items-center justify-between p-4 text-sm font-bold text-slate-800 dark:text-slate-100 font-sans text-left focus:outline-none cursor-pointer"
                >
                  <span>{faq.q}</span>
                  <ChevronDown className={`w-4 h-4 shrink-0 transition-transform text-slate-400 ${activeFaq === idx ? 'transform rotate-180' : ''}`} />
                </button>
                {(activeFaq === idx || isMobile) && (
                  <div className="px-4 pb-4 text-xs sm:text-sm text-slate-500 dark:text-slate-405 leading-relaxed font-sans font-semibold border-t border-slate-200/50 dark:border-slate-800/50 pt-3">
                    {faq.a}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Footer Section ───────────────────────────────────────────────────── */}
      <footer className="border-t border-slate-200 dark:border-slate-900 py-12 px-5 bg-slate-100 dark:bg-slate-950/90 text-sm font-sans font-medium text-slate-500 dark:text-slate-405">
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex flex-col items-center md:items-start gap-1">
            <span className="text-sm font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider block">FolioVault</span>
            <span className="text-xs text-slate-450 block text-center md:text-left leading-normal">
              Built for Indian investors who value financial privacy.<br />
              All computations stay on your device.
            </span>
          </div>
          <div className="flex gap-4 text-xs font-semibold">
            <Link to="/privacy" className="hover:text-blue-500 transition-colors">Privacy Policy</Link>
            <span className="text-slate-300 dark:text-slate-800">|</span>
            <span className="text-[10px] text-slate-400">Mutual Fund lists: MFAPI.in • Stock indices: Yahoo Finance</span>
          </div>
        </div>
      </footer>

    </div>
  );
}
