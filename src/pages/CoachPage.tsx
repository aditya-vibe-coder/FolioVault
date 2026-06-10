/**
 * AI Portfolio Coach
 *
 * Sends an aggregated, privacy-preserving summary of the user's portfolio
 * to Gemini and returns 3-5 personalised improvement suggestions.
 * The server endpoint is at POST /api/coach.
 */
import { useState, useRef, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Sparkles, Send, Loader2, MessageCircle, Lightbulb, RefreshCcw, AlertCircle, Crown, ShieldCheck } from 'lucide-react';
import { useLicense } from '../hooks/useLicense';
import { useHoldingsWithMetrics, usePortfolioMetrics } from '../hooks/usePortfolio';
import { useProFetch } from '../hooks/useProFetch';
import { ProBadge } from '../components/ui/ProBadge';
import { cn } from '../lib/formatters';
import type { AppContext } from '../components/Layout';
import type { HoldingWithMetrics } from '../types';
import { Helmet } from 'react-helmet-async';


interface CoachMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  createdAt: Date;
}

export default function CoachPage() {
  const { onUpgrade } = useOutletContext<AppContext>();
  const { isPro } = useLicense();
  const proFetch = useProFetch();
  const metrics = usePortfolioMetrics();
  const holdings = useHoldingsWithMetrics();
  const [messages, setMessages] = useState<CoachMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [insights, setInsights] = useState<{ title: string; body: string }[] | null>(null);
  const [loadingInsights, setLoadingInsights] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const portfolioSummary = useRef<unknown>(null);
  portfolioSummary.current = useMemoSummary(holdings, metrics);

  // Auto-load suggested insights on first mount
  useEffect(() => {
    if (!isPro || insights || loadingInsights) return;
    void loadInsights();
  }, [isPro]);

  const loadInsights = async () => {
    setLoadingInsights(true);
    setError(null);
    try {
      const r = await proFetch('/api/coach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'insights',
          portfolio: portfolioSummary.current,
        }),
      });
      if (r.status === 402) {
        setError('Your Pro license is required to use the AI Coach. Please verify your key in Settings.');
        return;
      }
      const data = await r.json();
      if (data.success && Array.isArray(data.insights)) {
        setInsights(data.insights);
      } else {
        setError(data.error || data.message || 'Could not generate insights.');
      }
    } catch (e: any) {
      setError(e?.message || 'Network error. Is the dev server running?');
    } finally {
      setLoadingInsights(false);
    }
  };

  const handleSend = async (text?: string) => {
    const message = (text ?? input).trim();
    if (!message || busy) return;

    const userMsg: CoachMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      text: message,
      createdAt: new Date(),
    };
    setMessages((m) => [...m, userMsg]);
    setInput('');
    setBusy(true);
    setError(null);

    try {
      const r = await proFetch('/api/coach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'chat',
          portfolio: portfolioSummary.current,
          history: messages.slice(-6).map((m) => ({ role: m.role, text: m.text })),
          message,
        }),
      });
      if (r.status === 402) {
        setError('Your Pro license is required to use the AI Coach. Please verify your key in Settings.');
        return;
      }
      const data = await r.json();
      if (data.success) {
        setMessages((m) => [...m, {
          id: crypto.randomUUID(),
          role: 'assistant',
          text: data.reply,
          createdAt: new Date(),
        }]);
      } else {
        setError(data.error || data.message || 'Coach is unavailable.');
      }
    } catch (e: any) {
      setError(e?.message || 'Network error.');
    } finally {
      setBusy(false);
    }
  };

  const SUGGESTED = [
    'How can I improve my XIRR?',
    'Am I over-diversified or under-diversified?',
    'What is my biggest risk right now?',
    'Suggest a rebalancing plan.',
  ];

  if (!isPro) {
    return (
      <ProLockedPage
        feature="AI Portfolio Coach"
        description="Get personalised, plain-English insights about your portfolio — powered by Gemini 1.5 Flash. Only an aggregated summary is sent, never your raw transactions."
        onUpgrade={onUpgrade}
        icon={<Sparkles className="w-6 h-6 text-white" />}
        accent="ai"
      />
    );
  }

  return (
    <div className="space-y-5 font-sans">
      <Helmet>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>
          <div className="p-5 bg-gradient-to-br from-purple-600 via-fuchsia-600 to-pink-500 rounded-2xl text-white shadow-lg shadow-purple-500/20 relative overflow-hidden">
        <div className="absolute -right-8 -top-8 w-40 h-40 rounded-full bg-white/10 blur-2xl" />
        <div className="relative flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Sparkles className="w-5 h-5" />
              <ProBadge variant="lock" size="sm" label="AI · PRO" className="!bg-white/20 !text-white !border-white/30" icon={<Crown className="w-3 h-3" />} />
            </div>
            <h1 className="text-2xl font-black tracking-tight">AI Portfolio Coach</h1>
            <p className="text-sm text-white/80 mt-1 max-w-2xl">
              Get personalised, plain-English insights about your portfolio — powered by Gemini 1.5 Flash. 100% private: only an aggregated summary is sent, never your raw transactions.
            </p>
          </div>
          <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest bg-white/15 border border-white/20 px-2.5 py-1 rounded-md">
            <ShieldCheck className="w-3 h-3" /> Privacy-preserving
          </div>
        </div>
      </div>

      {/* Auto-insights */}
      <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-black uppercase tracking-tight flex items-center gap-1.5">
            <Lightbulb className="w-4 h-4 text-amber-500" /> Today's personalised insights
          </h3>
          <button
            onClick={loadInsights}
            disabled={loadingInsights}
            className="text-xs font-bold text-blue-600 hover:underline flex items-center gap-1"
          >
            <RefreshCcw className={cn('w-3 h-3', loadingInsights && 'animate-spin')} /> Refresh
          </button>
        </div>

        {loadingInsights ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 bg-slate-100 dark:bg-slate-800 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : insights && insights.length > 0 ? (
          <div className="space-y-2.5">
            {insights.map((ins, i) => (
              <div key={i} className="p-3 bg-gradient-to-br from-amber-500/5 to-orange-500/5 border border-amber-500/10 rounded-xl">
                <p className="text-sm font-bold text-slate-900 dark:text-slate-100">{ins.title}</p>
                <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">{ins.body}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-slate-500 text-center py-4">No insights yet. Add some holdings to get started.</p>
        )}
      </div>

      {/* Chat */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden flex flex-col" style={{ minHeight: 480 }}>
        <div className="p-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/30 flex items-center justify-between">
          <p className="text-xs font-black uppercase tracking-widest text-slate-500 flex items-center gap-1.5">
            <MessageCircle className="w-3.5 h-3.5" /> Ask anything
          </p>
          <span className="text-[10px] text-slate-400">{messages.length} messages</span>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3 max-h-[480px]">
          {messages.length === 0 ? (
            <div className="text-center py-8 space-y-3">
              <Sparkles className="w-10 h-10 mx-auto text-purple-400" />
              <p className="text-sm text-slate-500">Ask the coach anything about your portfolio.</p>
              <div className="flex flex-wrap gap-2 justify-center">
                {SUGGESTED.map((s) => (
                  <button
                    key={s}
                    onClick={() => handleSend(s)}
                    className="px-3 py-1.5 text-xs font-semibold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={cn(
                    'flex',
                    m.role === 'user' ? 'justify-end' : 'justify-start',
                  )}
                >
                  <div className={cn(
                    'max-w-[80%] p-3 rounded-2xl text-sm whitespace-pre-wrap',
                    m.role === 'user'
                      ? 'bg-blue-600 text-white rounded-br-sm'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-bl-sm',
                  )}>
                    {m.text}
                  </div>
                </div>
              ))}
              {busy && (
                <div className="flex justify-start">
                  <div className="p-3 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center gap-2 text-xs text-slate-500">
                    <Loader2 className="w-3 h-3 animate-spin" /> Coach is thinking…
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </>
          )}
        </div>

        {error && (
          <div className="px-4 py-2 bg-red-500/5 border-t border-red-500/10 text-xs text-red-500 flex items-center gap-1.5">
            <AlertCircle className="w-3.5 h-3.5" /> {error}
          </div>
        )}

        <form
          onSubmit={(e) => { e.preventDefault(); handleSend(); }}
          className="p-3 border-t border-slate-200 dark:border-slate-800 flex gap-2"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={busy}
            placeholder="Ask the AI coach…"
            className="flex-1 px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm focus:outline-none focus:ring-1 focus:ring-purple-500"
          />
          <button
            type="submit"
            disabled={busy || !input.trim()}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-slate-400 text-white rounded-lg flex items-center gap-1.5 text-xs font-bold"
          >
            <Send className="w-3.5 h-3.5" /> Send
          </button>
        </form>
      </div>
    </div>
  );
}

/* ─── Helpers ────────────────────────────────────────────────────────── */

function ProLockedPage({
  feature, description, onUpgrade, icon, accent = 'pro',
}: { feature: string; description: string; onUpgrade: () => void; icon: React.ReactNode; accent?: 'pro' | 'ai' }) {
  const isAi = accent === 'ai';
  return (
    <div className="max-w-2xl mx-auto py-10">
      <div className={`p-8 border rounded-2xl text-center space-y-4 ${
        isAi
          ? 'bg-gradient-to-br from-purple-500/10 via-fuchsia-500/5 to-pink-500/5 border-purple-500/20'
          : 'bg-gradient-to-br from-amber-500/10 via-orange-500/5 to-transparent border-amber-500/20'
      }`}>
        <div className={`w-16 h-16 rounded-2xl flex items-center justify-center text-white mx-auto shadow-lg ${
          isAi ? 'bg-gradient-to-br from-purple-600 to-pink-500 shadow-purple-500/20' : 'bg-gradient-to-br from-amber-500 to-orange-500 shadow-amber-500/20'
        }`}>
          {icon}
        </div>
        <div className="flex justify-center">
          <ProBadge variant={isAi ? 'ai' : 'pro'} size="md" label={isAi ? 'AI · Pro Feature' : 'Pro Feature'} />
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
            className={`px-6 py-2.5 text-white font-bold rounded-lg text-sm shadow-lg inline-flex items-center justify-center gap-1.5 ${
              isAi
                ? 'bg-gradient-to-r from-purple-600 to-pink-500 hover:from-purple-700 hover:to-pink-600 shadow-purple-500/20'
                : 'bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 shadow-amber-500/20'
            }`}
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

function useMemoSummary(holdings: HoldingWithMetrics[], metrics: ReturnType<typeof usePortfolioMetrics>) {
  return {
    netWorth: Math.round(metrics.currentValue),
    netInvested: Math.round(metrics.totalInvested),
    absoluteGain: Math.round(metrics.absoluteGain),
    absoluteGainPercent: Number(metrics.absoluteGainPercent.toFixed(2)),
    xirr: metrics.overallXirr !== null ? Number((metrics.overallXirr * 100).toFixed(2)) : null,
    assetAllocation: Object.fromEntries(
      Object.entries(metrics.assetAllocation).filter(([, v]) => v > 0).map(([k, v]) => [k, Math.round(v)]),
    ),
    holdings: holdings
      .filter((h) => h.isActive)
      .map((h) => ({
        name: h.name,
        type: h.type,
        assetClass: h.assetClass,
        subCategory: h.subCategory ?? null,
        currentValue: Math.round(h.currentValue),
        absoluteGainPercent: Number(h.absoluteGainPercent.toFixed(2)),
        xirr: h.xirr !== null ? Number((h.xirr * 100).toFixed(2)) : null,
      })),
  };
}
