import React, { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useLicense } from '../hooks/useLicense';
import { useProFetch } from '../hooks/useProFetch';
import { useAppStore } from '../store/appStore';
import { useActivePortfolioId } from '../hooks/usePortfolio';
import { verifyAndCacheLicense } from '../lib/license';
import { exportEncryptedBackup, importEncryptedBackup, getEncryptedBackupString, decryptBackupString } from '../lib/backup';
import { ProBadge } from '../components/ui/ProBadge';
import {
  KeyRound,
  Download,
  Upload,
  RefreshCcw,
  Sliders,
  Sun,
  Moon,
  Check,
  Save,
  Lock,
  Laptop,
  Cloud,
  Crown,
  Sparkles,
} from 'lucide-react';
import { AiKeyPanel } from '../components/settings/AiKeyPanel';
import { apiUrl } from '../lib/apiBase';
import { Helmet } from 'react-helmet-async';

export default function SettingsPage() {
  const { onUpgrade } = useOutletContext<{ onUpgrade: () => void }>();
  const { isPro } = useLicense();
  const proFetch = useProFetch();
  const { settings, setSettings } = useAppStore();
  const activePortfolioId = useActivePortfolioId();
  const licenseKey = settings.licenseKey;

  // License Key Activation States
  const [typedLicense, setTypedLicense] = useState(licenseKey || '');
  const [activationMsg, setActivationMsg] = useState<string | null>(null);
  const [isSuccessMsg, setIsSuccessMsg] = useState(false);
  const [activating, setActivating] = useState(false);

  // Configuration thresholds states
  const [benchmarkRate, setBenchmarkRate] = useState(settings.benchmarkXirr ? String(settings.benchmarkXirr) : '7.0');
  const [configSaving, setConfigSaving] = useState(false);
  const [currSaved, setCurrSaved] = useState(false);

  // Secure Cryptography backup states
  const [cryptoKey, setCryptoKey] = useState('');
  const [decryptKey, setDecryptKey] = useState('');
  const [backupSuccess, setBackupSuccess] = useState<string | null>(null);
  const [restoreSuccess, setRestoreSuccess] = useState<string | null>(null);

  // Premium server sync backups
  const [cloudBackingUp, setCloudBackingUp] = useState(false);
  const [cloudBackupStatus, setCloudBackupStatus] = useState<string | null>(null);
  const [cloudRestoring, setCloudRestoring] = useState(false);
  const [cloudRestoreStatus, setCloudRestoreStatus] = useState<string | null>(null);
  const [cloudBackupId] = useState(activePortfolioId || 'main');

  // AI status (from /api/health)
  const [aiStatus, setAiStatus] = useState<null | { ai: boolean; aiSource: 'override' | 'server' | 'none'; aiModel: string }>(null);
  useEffect(() => {
    let cancelled = false;
    const probe = async () => {
      try {
        const r = await fetch(apiUrl('/api/health'));
        if (!r.ok || cancelled) return;
        const d = await r.json();
        if (!cancelled) setAiStatus({ ai: !!d.ai, aiSource: d.aiSource || 'none', aiModel: d.aiModel || '' });
      } catch { /* ignore */ }
    };
    probe();
    const t = window.setInterval(probe, 30000);
    return () => { cancelled = true; window.clearInterval(t); };
  }, [settings.geminiKey, settings.geminiModel]);

  const handleCloudBackup = async () => {
    if (!isPro) { onUpgrade(); return; }
    if (!cryptoKey) {
      alert("🔒 Input a secure custom password first to derive the AES encryption key!");
      return;
    }
    setCloudBackingUp(true);
    setCloudBackupStatus(null);
    try {
      const encryptedString = await getEncryptedBackupString(cryptoKey);
      const res = await proFetch('/api/backup/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: cloudBackupId,
          encryptedPayload: encryptedString
        })
      });
      if (res.status === 402) {
        alert("🔒 Cloud backup is a FolioVault Pro feature. Please upgrade.");
        return;
      }
      const data = await res.json();
      if (data.success) {
        setCloudBackupStatus(`✓ Cloud Backup Saved! Written securely with Zero-Knowledge Privacy!`);
      } else {
        alert("Cloud Backup rejected: " + (data.error || data.message || "Unknown server response"));
      }
    } catch (err: any) {
      alert("Encryption cloud upload failed: " + err.message);
    } finally {
      setCloudBackingUp(false);
    }
  };

  const handleCloudRestore = async () => {
    if (!isPro) { onUpgrade(); return; }
    if (!decryptKey) {
      alert("🔑 Provide the original encryption password to decrypt the Cloud payload!");
      return;
    }
    setCloudRestoring(true);
    setCloudRestoreStatus(null);
    try {
      const res = await proFetch(`/api/backup/download/${cloudBackupId}`);
      if (res.status === 402) {
        alert("🔒 Cloud restore is a FolioVault Pro feature. Please upgrade.");
        return;
      }
      if (res.status === 404) {
        alert("Cloud Restore Error: No backup snapshot has been uploaded matching this Portfolio ID yet!");
        return;
      }
      const data = await res.json();
      if (data.success) {
        const importRes = await decryptBackupString(data.encryptedPayload, decryptKey);
        if (importRes.success) {
          setCloudRestoreStatus("✓ Dynamic Cloud Restore Successful! Reloading portfolio...");
          setTimeout(() => window.location.reload(), 1500);
        } else {
          alert("Cloud Decryption failed: Password matches incorrect or payload corrupted.");
        }
      } else {
        alert("Cloud Restore rejected: " + (data.error || data.message || "Cloud record not found."));
      }
    } catch (err: any) {
      alert("Cloud restore network error: " + err.message);
    } finally {
      setCloudRestoring(false);
    }
  };

  // Toggle Theme Class directly on document body
  const handleToggleTheme = (theme: 'light' | 'dark' | 'system') => {
    setSettings({ theme });
  };

  // Process License verify
  const handleActivateLicense = async () => {
    if (!typedLicense.trim()) return;
    setActivating(true);
    setActivationMsg(null);

    try {
      const res = await verifyAndCacheLicense(typedLicense.trim().toUpperCase());
      if (res.isValid) {
        setIsSuccessMsg(true);
        setActivationMsg("Premium Key Verified! FolioVault Pro is now active. Refreshing layout...");
        // Fast refresh local Zustand values
        setSettings({ isPro: true, licenseKey: typedLicense.trim().toUpperCase() });
      } else {
        setIsSuccessMsg(false);
        setActivationMsg(res.error || "The license key code structure is invalid.");
      }
    } catch (e) {
      setIsSuccessMsg(false);
      setActivationMsg("Verification timeout. Key loaded in offline fallback.");
    } finally {
      setActivating(false);
    }
  };

  // Adjust Benchmark Rates saved
  const handleSaveConfig = async () => {
    setConfigSaving(true);
    setCurrSaved(false);

    try {
      const numRate = parseFloat(benchmarkRate) || 7.0;
      setSettings({ benchmarkXirr: numRate });
      setCurrSaved(true);
      setTimeout(() => setCurrSaved(false), 2000);
    } catch (e) {
      alert("IndexedDB write failed.");
    } finally {
      setConfigSaving(false);
    }
  };

  // Initiate AES-GCM Encrypted File Exports
  const handleExportBackup = async () => {
    if (!cryptoKey) {
      alert("🔒 Input a secure custom password. This password is required to decrypt your data!");
      return;
    }
    setBackupSuccess(null);

    try {
      await exportEncryptedBackup(cryptoKey);
      setBackupSuccess("Backup file exported successfully!");
    } catch (e: any) {
      alert("Encryption error: " + e.message);
    }
  };

  // Handle encrypted file restoration upload
  const handleRestoreBackupInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!decryptKey) {
      alert("🔑 Provide the original encryption password prior to loading the backup archive.");
      return;
    }
    setRestoreSuccess(null);

    try {
      const res = await importEncryptedBackup(file, decryptKey);
      if (res.success) {
        setRestoreSuccess("Success! Entire IndexedDB ledger restored successfully. Refreshing application state...");
        setTimeout(() => window.location.reload(), 1500);
      } else {
        alert("Restoration rejected: " + (res.error || "Verify password matches original encrypt setup."));
      }
    } catch (e: any) {
      alert("Decryption Failed: Password matches incorrect or backup data package corrupt.");
    }
  };

  return (
    <div className="space-y-6 font-sans select-none pb-12">
      <Helmet>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>
          
      {/* ─── Header ─── */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-black text-slate-800 dark:text-slate-100 uppercase tracking-tight">
            System Panel
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Manage local secure credentials, database parameters, style themes, and direct local backups.
          </p>
        </div>
        {aiStatus && (
          <div
            className={[
              'flex items-center gap-2 px-3 py-1.5 rounded-full border text-[11px] font-bold uppercase tracking-wider',
              aiStatus.ai
                ? aiStatus.aiSource === 'override'
                  ? 'bg-violet-500/10 border-violet-500/20 text-violet-700 dark:text-violet-300'
                  : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-700 dark:text-emerald-300'
                : 'bg-amber-500/10 border-amber-500/20 text-amber-700 dark:text-amber-300',
            ].join(' ')}
            title={aiStatus.ai ? `AI model: ${aiStatus.aiModel}` : 'No AI provider configured'}
          >
            <Sparkles className="w-3 h-3" />
            {aiStatus.ai
              ? aiStatus.aiSource === 'override'
                ? `AI · Your key · ${aiStatus.aiModel}`
                : `AI · Server · ${aiStatus.aiModel}`
              : 'AI offline'}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch">
        
        {/* ─── Box 1: License Activation ─── */}
        <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <KeyRound className="w-5 h-5 text-blue-600 dark:text-blue-450" />
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-101 uppercase tracking-wider">
                License Activation
              </h3>
            </div>
            
            {isPro ? (
              <div className="p-4 bg-emerald-500/5 border border-emerald-500/10 text-emerald-850 dark:text-emerald-400 rounded-xl text-xs space-y-1 sm:text-sm">
                <span className="font-extrabold block">✓ FolioVault Pro Activated</span>
                <span className="text-slate-500 text-xs block truncate leading-tight">Key: {licenseKey?.toUpperCase()}</span>
                <span className="text-[10px] uppercase font-bold text-slate-400 block pt-1.5 font-sans leading-none">
                  Unlimited Ledger active slots, sheets trade imports, and multi-asset metrics unlocked!
                </span>
              </div>
            ) : (
            <div className="space-y-3.5 text-xs text-left text-slate-750 dark:text-slate-350">
              <p className="leading-normal">
                Unlock unlimited portfolio holdings, instant Zerodha CSV imports, AI portfolio coach, ITR capital-gains PDF, encrypted cloud sync, and more.
              </p>

                <div className="space-y-1.5 font-semibold">
                  <label className="block mb-0.5 text-[10px] uppercase font-bold text-slate-400">Upgrade Enterprise License</label>
                  <input
                    type="text"
                    placeholder="FV-XXXX-XXXX-XXXX-XXXX"
                    value={typedLicense}
                    onChange={(e) => setTypedLicense(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 dark:border-slate-800 rounded-lg bg-white dark:bg-slate-950/80 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                {activationMsg && (
                  <p className={`text-[11px] font-bold ${isSuccessMsg ? 'text-emerald-600' : 'text-red-500'}`}>
                    {activationMsg}
                  </p>
                )}
              </div>
            )}
          </div>

          {!isPro && (
            <div className="flex gap-2 pt-6">
              <button
                onClick={onUpgrade}
                className="flex-1 py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-bold rounded-lg text-xs hover:shadow-lg transition-transform hover:-translate-y-0.5 cursor-pointer"
              >
                Purchase Pro — ₹99/mo or ₹799/yr
              </button>
              <button
                onClick={handleActivateLicense}
                disabled={activating || !typedLicense.trim()}
                className="flex-1 py-2.5 border border-slate-250 dark:border-slate-800 text-slate-700 dark:text-slate-300 font-bold rounded-lg text-xs hover:bg-slate-50 dark:hover:bg-slate-850 cursor-pointer disabled:opacity-30"
              >
                {activating ? 'Verifying...' : 'Submit Key'}
              </button>
            </div>
          )}
        </div>

        {/* ─── Box 2: Benchmark Threshold Parameter Settings ─── */}
        <div className="p-5 bg-white dark:bg-slate-900 border border-slate-205 dark:border-slate-800 rounded-2xl flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Sliders className="w-5 h-5 text-slate-400" />
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-101 uppercase tracking-wider">
                Investment Benchmarks
              </h3>
            </div>
            
            <div className="space-y-4 text-xs text-slate-750 dark:text-slate-350">
              <p className="leading-normal">
                Determine the comparison annual compound rate used across your Analytics indices dashboard comparisons. Default standard is bank deposits of 7.0% p.a.
              </p>

              <div className="space-y-1.5 font-semibold">
                <label className="block mb-0.5 text-[10px] uppercase font-bold text-slate-400">Benchmark Return Compare Price (% p.a.)</label>
                <input
                  type="number"
                  step="0.1"
                  value={benchmarkRate}
                  onChange={(e) => setBenchmarkRate(e.target.value)}
                  className="w-24 px-3 py-1.5 border border-slate-200 dark:border-slate-800 rounded-lg bg-white dark:bg-slate-950/80 font-mono text-xs focus:outline-none"
                />
              </div>
            </div>
          </div>

          <div className="pt-6">
            <button
              onClick={handleSaveConfig}
              disabled={configSaving}
              className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 cursor-pointer shadow-sm"
            >
              {currSaved ? <Check className="w-4 h-4 text-white" /> : <Save className="w-4 h-4" />}
              {currSaved ? 'Saved successfully!' : 'Store benchmark parameters'}
            </button>
          </div>
        </div>

        {/* ─── Box 2b: AI Provider (per-user Gemini key) ─── */}
        <AiKeyPanel />

        {/* ─── Box 3: Secure Cryptography Backup exports (AES-GCM) ─── */}
        <div className="p-5 bg-white dark:bg-slate-900 border border-slate-205 dark:border-slate-800 rounded-2xl flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Lock className="w-5 h-5 text-blue-600" />
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-101 uppercase tracking-wider">
                AES-GCM Local Database Backup (Encrypted)
              </h3>
            </div>
            
            <div className="space-y-3.5 text-xs text-left text-slate-750 dark:text-slate-350">
              <p className="leading-normal">
                Derives secure local files of your entire IndexedDB ledger. The database package is encrypted directly inside the browser sandbox using your password.
              </p>

              <div className="space-y-1.5 font-semibold">
                <label className="block text-[10px] uppercase font-bold text-slate-400">Set unique backup password</label>
                <input
                  type="password"
                  placeholder="Insert secure passwords..."
                  value={cryptoKey}
                  onChange={(e) => setCryptoKey(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white dark:bg-slate-950 font-sans text-xs focus:outline-none"
                />
                <span className="text-[10px] text-slate-400 leading-none italic block mt-0.5">
                  Keep this password safe. We do not store keys; lost passwords cannot be restored.
                </span>
              </div>
            </div>
          </div>

          <div className="pt-6 space-y-2">
            <button
              onClick={handleExportBackup}
              className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Download className="w-4 h-4" /> Export (.fv) encrypted file
            </button>

            <button
              onClick={handleCloudBackup}
              disabled={cloudBackingUp}
              className={`w-full py-2.5 text-white text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 cursor-pointer shadow-md transition-colors ${
                isPro
                  ? 'bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-500 shadow-emerald-500/10'
                  : 'bg-slate-900 hover:bg-slate-800 shadow-slate-500/10'
              }`}
            >
              {cloudBackingUp ? (
                <>
                  <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Encrypting & Syncing...
                </>
              ) : isPro ? (
                <>
                  <Cloud className="w-3.5 h-3.5" /> Encrypt & Upload to Cloud (Sync)
                </>
              ) : (
                <>
                  <Crown className="w-3.5 h-3.5" /> Unlock Cloud Sync with Pro
                </>
              )}
            </button>
            {cloudBackupStatus && (
              <span className="text-[10px] text-emerald-500 font-bold block text-center leading-tight mt-1">{cloudBackupStatus}</span>
            )}
          </div>
        </div>

        {/* ─── Box 4: Vault Restorations uploads ─── */}
        <div className="p-5 bg-white dark:bg-slate-900 border border-slate-205 dark:border-slate-800 rounded-2xl flex flex-col justify-between relative">
          <div className="absolute top-3 right-3">
            <ProBadge variant="pro" size="sm" label="CLOUD" />
          </div>
          <div>
            <div className="flex items-center gap-2 mb-3">
              <RefreshCcw className="w-5 h-5 text-emerald-550" />
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-101 uppercase tracking-wider">
                Vault Restore
              </h3>
            </div>
            
            <div className="space-y-3.5 text-xs text-left text-slate-750 dark:text-slate-350">
              <p className="leading-normal">
                Decrypt and load an existing backup file back into IndexedDB. This replaces existing local portfolios registry rows!
              </p>

              <div className="space-y-1.5 font-semibold">
                <label className="block text-[10px] uppercase font-bold text-slate-400">Input decryption password</label>
                <input
                  type="password"
                  placeholder="Enter original password..."
                  value={decryptKey}
                  onChange={(e) => setDecryptKey(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white dark:bg-slate-950 font-sans text-xs focus:outline-none"
                />
              </div>
            </div>
          </div>

          <div className="pt-6 space-y-2">
            <label className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-805 dark:text-slate-200 text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 cursor-pointer border border-dashed border-slate-300">
              <Upload className="w-4 h-4" /> Restore file upload (.fv)
              <input
                type="file"
                accept=".fv"
                onChange={handleRestoreBackupInput}
                className="hidden"
              />
            </label>

            <button
              onClick={handleCloudRestore}
              disabled={cloudRestoring}
              className={`w-full py-2.5 text-white text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 cursor-pointer shadow-md transition-colors ${
                isPro
                  ? 'bg-blue-600 hover:bg-blue-700 disabled:bg-blue-500 shadow-blue-500/10'
                  : 'bg-slate-900 hover:bg-slate-800 shadow-slate-500/10'
              }`}
            >
              {cloudRestoring ? (
                <>
                  <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Downloading & Decrypting...
                </>
                ) : isPro ? (
                  <>
                    <Cloud className="w-3.5 h-3.5" /> Download & Restore from Cloud
                  </>
                ) : (
                  <>
                    <Crown className="w-3.5 h-3.5" /> Unlock Cloud Restore with Pro
                  </>
                )}
            </button>
            {cloudRestoreStatus && (
              <span className="text-[10px] text-emerald-500 font-semibold block text-center leading-tight mt-1">{cloudRestoreStatus}</span>
            )}
          </div>
        </div>

      </div>

      {/* ─── Theme visual switches settings ─── */}
      <div className="p-5 bg-white dark:bg-slate-900 border border-slate-205 dark:border-slate-805 rounded-xl flex items-center justify-between flex-wrap gap-4 font-sans text-xs sm:text-sm">
        <div className="space-y-1">
          <span className="font-extrabold text-slate-900 dark:text-white block">Visual appearance theme</span>
          <span className="text-slate-455 text-xs block">Switch between light mode and dark eyes-safe night filters.</span>
        </div>
        <div className="flex border border-slate-200 dark:border-slate-800 p-1 bg-slate-50 dark:bg-slate-950 rounded-lg gap-1.5 flex-wrap">
          <button
            onClick={() => handleToggleTheme('light')}
            className={`py-1.5 px-3.5 rounded-md flex items-center gap-1 cursor-pointer font-bold transition-colors ${settings.theme === 'light' ? 'bg-white dark:bg-slate-800 shadow-sm text-slate-950 dark:text-white' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`}
          >
            <Sun className="w-4 h-4" /> Light
          </button>
          <button
            onClick={() => handleToggleTheme('dark')}
            className={`py-1.5 px-3.5 rounded-md flex items-center gap-1 cursor-pointer font-bold transition-colors ${settings.theme === 'dark' ? 'bg-white dark:bg-slate-800 shadow-sm text-slate-950 dark:text-white' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`}
          >
            <Moon className="w-4 h-4" /> Dark
          </button>
          <button
            onClick={() => handleToggleTheme('system')}
            className={`py-1.5 px-3.5 rounded-md flex items-center gap-1 cursor-pointer font-bold transition-colors ${settings.theme === 'system' ? 'bg-white dark:bg-slate-800 shadow-sm text-slate-950 dark:text-white' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`}
          >
            <Laptop className="w-4 h-4" /> System
          </button>
        </div>
      </div>

    </div>
  );
}
