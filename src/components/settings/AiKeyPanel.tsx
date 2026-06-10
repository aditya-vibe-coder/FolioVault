import { useState, useEffect, useRef } from 'react';
import { Sparkles, Eye, EyeOff, Trash2, Check, AlertCircle, Loader2, ChevronDown } from 'lucide-react';
import { useAppStore } from '../../store/appStore';
import { cn } from '../../lib/formatters';
import { apiUrl } from '../../lib/apiBase';

const MODEL_OPTIONS: { value: string; label: string; description: string }[] = [
  { value: 'gemini-2.5-flash',     label: 'Gemini 2.5 Flash',     description: 'Fast & cheap — recommended for most users' },
  { value: 'gemini-2.5-pro',       label: 'Gemini 2.5 Pro',       description: 'Higher quality — slower & pricier' },
  { value: 'gemini-2.5-flash-lite',label: 'Gemini 2.5 Flash Lite',description: 'Lowest cost — shortest responses' },
  { value: 'gemini-3.5-flash',     label: 'Gemini 3.5 Flash',     description: 'Newest generation (if your key has access)' },
  { value: 'gemini-3-pro-preview', label: 'Gemini 3 Pro Preview', description: 'Bleeding edge — preview channel' },
  { value: 'gemini-3-flash-preview',label: 'Gemini 3 Flash Preview', description: 'Fast preview channel' },
];

/**
 * "AI Provider" settings card.
 *
 * Lets the user paste their own Gemini API key and pick a model.  The key
 * is stored in IndexedDB (via `useAppStore.setSettings`) and sent to the
 * server on every AI request as `X-Gemini-Key-Override`.  The server uses
 * it in place of its own env-var key, so a user without a server-side key
 * can still get AI features working.
 *
 * We never echo the key back in any telemetry.  The "verify" button pings
 * `/api/health?probe=1` — actually we use a tiny coach probe — to confirm
 * the key works end-to-end.
 */
export function AiKeyPanel() {
  const settings = useAppStore((s) => s.settings);
  const setSettings = useAppStore((s) => s.setSettings);

  const [draftKey, setDraftKey] = useState(settings.geminiKey ?? '');
  const [draftModel, setDraftModel] = useState(settings.geminiModel ?? 'gemini-2.5-flash');
  const [reveal, setReveal] = useState(false);
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<null | { ok: boolean; msg: string }>(null);
  const debounceRef = useRef<number | null>(null);

  // Keep drafts in sync if the store changes elsewhere.
  useEffect(() => { setDraftKey(settings.geminiKey ?? ''); }, [settings.geminiKey]);
  useEffect(() => { setDraftModel(settings.geminiModel ?? 'gemini-2.5-flash'); }, [settings.geminiModel]);

  const dirty =
    (draftKey || '') !== (settings.geminiKey || '') ||
    (draftModel || '') !== (settings.geminiModel || 'gemini-2.5-flash');

  const save = async () => {
    const trimmed = draftKey.trim();
    await setSettings({
      geminiKey: trimmed || undefined,
      geminiModel: draftModel || 'gemini-2.5-flash',
    });
    setSaved(true);
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => setSaved(false), 1800);
  };

  const clear = async () => {
    setDraftKey('');
    await setSettings({ geminiKey: undefined, geminiModel: undefined });
    setTestResult(null);
    setSaved(true);
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => setSaved(false), 1800);
  };

  /**
   * Probe the live AI round-trip.  Sends a tiny coach request with the
   * override key + model and reports a green/red result.  The probe body
   * is intentionally minimal so we don't burn tokens.
   */
  const test = async () => {
    if (!draftKey.trim()) {
      setTestResult({ ok: false, msg: 'Paste a key first.' });
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      const r = await fetch(apiUrl('/api/coach'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Pro-Status': 'true',
          'X-License-Key': 'FV-PROBE',
          'X-Gemini-Key-Override': draftKey.trim(),
          'X-Gemini-Model-Override': draftModel || 'gemini-2.5-flash',
        },
        body: JSON.stringify({
          kind: 'chat',
          message: 'ping',
          portfolio: { netWorth: 0, netInvested: 0, xirr: 0, assetAllocation: { equity: 0, debt: 0 }, holdings: [] },
          history: [],
        }),
      });
      if (r.status === 200) {
        const d = await r.json();
        if (d.success) {
          setTestResult({ ok: true, msg: 'Connected to Gemini successfully.' });
        } else {
          setTestResult({ ok: false, msg: d.error || 'Unknown error.' });
        }
      } else if (r.status === 402) {
        setTestResult({ ok: false, msg: 'License gate rejected the probe. Activate Pro first to test.' });
      } else {
        const d = await r.json().catch(() => ({}));
        setTestResult({ ok: false, msg: d.error || `HTTP ${r.status}` });
      }
    } catch (e: any) {
      setTestResult({ ok: false, msg: e?.message || 'Network error.' });
    } finally {
      setTesting(false);
    }
  };

  const hasKey = !!settings.geminiKey;
  const modelLabel = MODEL_OPTIONS.find(m => m.value === (settings.geminiModel || 'gemini-2.5-flash'))?.label
    || settings.geminiModel
    || 'gemini-2.5-flash';

  return (
    <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider">
              AI Provider
            </h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight">
              Use your own Google Gemini key for the AI Coach and AI CAS PDF parser.
            </p>
          </div>
        </div>
        {hasKey && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Active
          </span>
        )}
      </div>

      <div className="space-y-3 text-xs text-slate-700 dark:text-slate-300">
        <div>
          <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">
            Gemini API Key
          </label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                type={reveal ? 'text' : 'password'}
                value={draftKey}
                onChange={(e) => setDraftKey(e.target.value)}
                placeholder="AIzaSy… or AQ.…"
                autoComplete="off"
                spellCheck={false}
                className="w-full pl-3 pr-10 py-2 border border-slate-200 dark:border-slate-800 rounded-lg bg-white dark:bg-slate-950/80 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-violet-500"
              />
              <button
                type="button"
                onClick={() => setReveal(v => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                aria-label={reveal ? 'Hide key' : 'Reveal key'}
                tabIndex={-1}
              >
                {reveal ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>
          <p className="text-[10px] text-slate-400 leading-tight mt-1.5">
            Stored locally in your browser only.  Never sent to our servers in plaintext
            (it's transmitted as a request header, not logged).{' '}
            <a
              href="https://aistudio.google.com/apikey"
              target="_blank"
              rel="noopener noreferrer"
              className="text-violet-600 dark:text-violet-400 hover:underline font-bold"
            >
              Get a free key →
            </a>
          </p>
        </div>

        <div>
          <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">
            Model
          </label>
          <div className="relative">
            <select
              value={draftModel}
              onChange={(e) => setDraftModel(e.target.value)}
              className="appearance-none w-full pl-3 pr-9 py-2 border border-slate-200 dark:border-slate-800 rounded-lg bg-white dark:bg-slate-950/80 text-xs focus:outline-none focus:ring-1 focus:ring-violet-500 cursor-pointer"
            >
              {MODEL_OPTIONS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label} — {m.description}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
          </div>
          <p className="text-[10px] text-slate-400 leading-tight mt-1.5">
            Currently using: <span className="font-mono font-bold text-slate-600 dark:text-slate-300">{modelLabel}</span>
          </p>
        </div>

        {testResult && (
          <div
            className={cn(
              'flex items-start gap-2 p-2.5 rounded-lg text-[11px] border',
              testResult.ok
                ? 'bg-emerald-500/5 border-emerald-500/20 text-emerald-700 dark:text-emerald-400'
                : 'bg-rose-500/5 border-rose-500/20 text-rose-700 dark:text-rose-400'
            )}
          >
            {testResult.ok
              ? <Check className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
              : <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />}
            <span className="leading-tight">{testResult.msg}</span>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2 pt-1">
        <button
          onClick={save}
          disabled={!dirty}
          className="flex-1 min-w-[100px] py-2 bg-violet-600 hover:bg-violet-700 disabled:bg-slate-300 dark:disabled:bg-slate-800 disabled:text-slate-500 text-white text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 cursor-pointer shadow-sm transition-colors"
        >
          {saved ? <Check className="w-3.5 h-3.5" /> : null}
          {saved ? 'Saved' : 'Save key & model'}
        </button>
        <button
          onClick={test}
          disabled={testing || !draftKey.trim()}
          className="px-4 py-2 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 cursor-pointer"
        >
          {testing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
          {testing ? 'Testing…' : 'Test connection'}
        </button>
        {hasKey && (
          <button
            onClick={clear}
            className="px-3 py-2 border border-rose-200 dark:border-rose-900/40 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 cursor-pointer"
            title="Remove the saved key and fall back to the server default"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
