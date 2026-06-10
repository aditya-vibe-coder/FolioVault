import { useState } from 'react';
import { X, Check, Sparkles, Shield, Zap, Crown, Lock } from 'lucide-react';
import { useAppStore } from '../store/appStore';
import { useLicense } from '../hooks/useLicense';
import { initiatePurchase, type BillingInterval } from '../lib/razorpay';
import { verifyAndCacheLicense } from '../lib/license';
import { cn } from '../lib/formatters';

interface UpgradeModalProps {
  open: boolean;
  onClose: () => void;
}

const FEATURES_FREE = [
  'Up to 10 active holdings',
  'Accurate XIRR (Newton-Raphson)',
  'Manual transaction entry',
  'Local IndexedDB storage',
  'Free PDF reports',
];

const FEATURES_PRO = [
  '✨ AI Portfolio Coach (daily tips + chat)',
  '🧾 AI CAS PDF Parser (Gemini-powered)',
  'Unlimited holdings (any scale)',
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

export function UpgradeModal({ open, onClose }: UpgradeModalProps) {
  const { isPro, activate } = useLicense();
  const settings = useAppStore((s) => s.settings);
  const [interval, setInterval] = useState<BillingInterval>('yearly');
  const [typedKey, setTypedKey] = useState('');
  const [activating, setActivating] = useState(false);
  const [purchasing, setPurchasing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  if (!open) return null;

  const handlePurchase = async () => {
    setError(null);
    setSuccess(null);
    setPurchasing(true);
    try {
      const result = await initiatePurchase(settings.licenseKey ? '' : '', interval);
      if (result.success) {
        const verified = await verifyAndCacheLicense(result.licenseKey);
        if (verified.isValid) {
          await activate(result.licenseKey);
          setSuccess(
            `🎉 Welcome to FolioVault Pro! Your ${
              interval === 'monthly' ? 'monthly' : 'annual'
            } subscription is active.`,
          );
          setTimeout(() => onClose(), 2200);
        } else {
          setError(verified.error || 'License verification failed.');
        }
      } else {
        setError('error' in result ? result.error : 'Payment failed.');
      }
    } catch (e: any) {
      setError(e?.message || 'Unexpected error during purchase.');
    } finally {
      setPurchasing(false);
    }
  };

  const handleActivate = async () => {
    if (!typedKey.trim()) return;
    setActivating(true);
    setError(null);
    try {
      const res = await activate(typedKey.trim());
      if (res.isValid) {
        setSuccess('✅ License activated. Welcome to Pro!');
        setTimeout(() => onClose(), 1800);
      } else {
        setError(res.error || 'Invalid license key.');
      }
    } finally {
      setActivating(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto font-sans"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between sticky top-0 bg-white dark:bg-slate-900 z-10">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center text-white">
              <Crown className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-black uppercase tracking-tight text-slate-900 dark:text-slate-100">
                {isPro ? 'You\'re on Pro 🎉' : 'Upgrade to FolioVault Pro'}
              </h2>
              <p className="text-xs text-slate-500">
                {isPro
                  ? 'Manage your subscription below.'
                  : 'Unlock the full power of privacy-first investing.'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-5">
          {isPro ? (
            <ProManagement
              onClose={onClose}
              settings={settings}
            />
          ) : (
            <>
              {/* Billing toggle */}
              <div>
                <div className="flex items-center justify-center mb-3">
                  <div className="inline-flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700">
                    <button
                      onClick={() => setInterval('monthly')}
                      className={cn(
                        'px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5',
                        interval === 'monthly'
                          ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                          : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300',
                      )}
                    >
                      Monthly
                    </button>
                    <button
                      onClick={() => setInterval('yearly')}
                      className={cn(
                        'px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5',
                        interval === 'yearly'
                          ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                          : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300',
                      )}
                    >
                      Yearly
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-black bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 uppercase">
                        Save 33%
                      </span>
                    </button>
                  </div>
                </div>

              {/* Pricing card */}
              <PricingCard interval={interval} />

              {/* AI callout */}
              <div className="p-4 bg-gradient-to-br from-purple-500/10 via-fuchsia-500/5 to-pink-500/10 border border-purple-500/20 rounded-xl flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-purple-600 to-pink-500 flex items-center justify-center text-white shrink-0">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div className="text-xs">
                  <p className="font-black text-slate-900 dark:text-slate-100 flex items-center gap-1">
                    Unlock our AI suite
                    <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase bg-gradient-to-r from-purple-600 to-pink-500 text-white">
                      AI · Pro
                    </span>
                  </p>
                  <p className="text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                    Pro includes the <strong className="text-slate-700 dark:text-slate-200">AI Portfolio Coach</strong> and the <strong className="text-slate-700 dark:text-slate-200">AI CAS PDF parser</strong> — both privacy-preserving. We only ever send a sanitised summary, never raw transactions.
                  </p>
                </div>
              </div>
            </div>

              {/* Features */}
              <div className="grid sm:grid-cols-2 gap-3">
                <FeatureColumn title="Free" items={FEATURES_FREE} icon={<Shield className="w-4 h-4" />} muted />
                <FeatureColumn title="Pro" items={FEATURES_PRO} icon={<Zap className="w-4 h-4" />} accent />
              </div>

              {/* Purchase CTA */}
              <div className="space-y-2">
                <button
                  onClick={handlePurchase}
                  disabled={purchasing}
                  className="w-full py-3 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 disabled:from-slate-400 disabled:to-slate-500 text-white font-black rounded-xl text-sm transition-all shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2"
                >
                  {purchasing ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Connecting to Razorpay…
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      {interval === 'monthly' ? 'Start Monthly — ₹99/mo' : 'Start Yearly — ₹799/yr'}
                    </>
                  )}
                </button>
                {error && (
                  <p className="text-xs text-red-500 font-semibold text-center">{error}</p>
                )}
                {success && (
                  <p className="text-xs text-emerald-600 font-semibold text-center">{success}</p>
                )}
                <p className="text-[10px] text-center text-slate-400">
                  🔒 Secure payment by Razorpay. Cancel anytime — no questions asked.
                </p>
              </div>

              {/* Manual key activation */}
              <div className="border-t border-slate-200 dark:border-slate-800 pt-4">
                <p className="text-[10px] uppercase font-black tracking-widest text-slate-400 mb-2 flex items-center gap-1">
                  <Lock className="w-3 h-3" /> Already have a license key?
                </p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="FV-XXXX-XXXX-XXXX-XXXX"
                    value={typedKey}
                    onChange={(e) => setTypedKey(e.target.value.toUpperCase())}
                    className="flex-1 px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-amber-500"
                  />
                  <button
                    onClick={handleActivate}
                    disabled={activating || !typedKey.trim()}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-white text-xs font-bold rounded-lg"
                  >
                    {activating ? 'Verifying…' : 'Activate'}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Sub-components ──────────────────────────────────────────────────── */

function PricingCard({ interval }: { interval: BillingInterval }) {
  const isYearly = interval === 'yearly';
  return (
    <div className="p-5 rounded-2xl border-2 border-amber-500 bg-gradient-to-br from-amber-500/5 to-orange-500/5 relative overflow-hidden">
      <span className="absolute top-0 right-0 transform translate-x-0 -translate-y-1/2 px-3 py-1 bg-amber-500 rounded-full text-[9px] text-white font-extrabold uppercase tracking-widest shadow-md">
        Most Popular
      </span>
      <div className="flex items-end gap-3">
        <span className="text-5xl font-black font-mono text-slate-900 dark:text-white">
          {isYearly ? '₹799' : '₹99'}
        </span>
        <div className="pb-2">
          <span className="text-xs text-slate-500 font-bold block">
            /{isYearly ? 'year' : 'month'}
          </span>
          {isYearly && (
            <span className="text-[10px] text-emerald-600 font-bold">
              Just ₹67/month — billed annually
            </span>
          )}
        </div>
      </div>
      <p className="text-xs text-slate-500 mt-2">
        {isYearly
          ? 'Best value. 12 months for the price of 8. Includes everything below.'
          : 'Flexible monthly billing. Cancel anytime.'}
      </p>
    </div>
  );
}

function FeatureColumn({
  title, items, icon, muted, accent,
}: {
  title: string;
  items: string[];
  icon: React.ReactNode;
  muted?: boolean;
  accent?: boolean;
}) {
  return (
    <div className={cn(
      'p-4 rounded-xl border',
      muted && 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/40',
      accent && 'border-amber-500/30 bg-amber-500/5',
    )}>
      <p className={cn(
        'flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest mb-3',
        muted && 'text-slate-500',
        accent && 'text-amber-600 dark:text-amber-400',
      )}>
        {icon} {title}
      </p>
      <ul className="space-y-2">
        {items.map((f) => (
          <li key={f} className="flex items-start gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
            <Check className={cn(
              'w-3.5 h-3.5 shrink-0 mt-0.5',
              muted ? 'text-slate-400' : 'text-amber-500',
            )} />
            {f}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ProManagement({
  onClose, settings,
}: {
  onClose: () => void;
  settings: ReturnType<typeof useAppStore.getState>['settings'];
}) {
  const expiry = settings.licenseExpiry ? new Date(settings.licenseExpiry) : null;
  const daysLeft = expiry
    ? Math.max(0, Math.ceil((expiry.getTime() - Date.now()) / 86_400_000))
    : 0;
  return (
    <div className="space-y-3 text-sm">
      <div className="p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/20 space-y-1.5">
        <p className="font-bold text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
          <Check className="w-4 h-4" /> Pro is active
        </p>
        <p className="text-xs text-slate-600 dark:text-slate-300">
          License: <span className="font-mono">{settings.licenseKey}</span>
        </p>
        <p className="text-xs text-slate-600 dark:text-slate-300">
          {expiry
            ? `Renews / expires in ${daysLeft} day${daysLeft === 1 ? '' : 's'} (${expiry.toLocaleDateString('en-IN')})`
            : 'No expiry on file'}
        </p>
      </div>
      <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950/40 border border-slate-200 dark:border-slate-800">
        <p className="text-xs text-slate-500 leading-relaxed">
          FolioVault Pro is sold as a 1-year license. When it expires, you'll be prompted to renew —
          your local data is never touched, exported, or deleted.
        </p>
      </div>
      <button
        onClick={onClose}
        className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-lg text-xs"
      >
        Close
      </button>
    </div>
  );
}
