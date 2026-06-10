import { getSettings, saveSettings } from './db';
import type { LicenseVerificationResult } from '../types';

const WORKER_URL_RAW = ((import.meta as any).env?.VITE_WORKER_URL as string) || '';
// 🔁 REPLACE the fallback URL with your deployed Worker URL
const WORKER_URL     = WORKER_URL_RAW || 'https://api.YOUR_DOMAIN.com';
const CACHE_KEY     = 'fv_license_cache_v1';
const GRACE_DAYS    = 7; // Days offline before forcing re-verification
const CHECK_INTERVAL_HOURS = 24; // Re-verify at most once per 24hrs

interface LicenseCacheEntry {
  key:       string;
  expiresAt: string;    // ISO
  cachedAt:  string;    // ISO
}

export async function verifyAndCacheLicense(key: string): Promise<LicenseVerificationResult> {
  const normalizedKey = key.trim().toUpperCase();
  if (!normalizedKey || normalizedKey.length < 10) {
    return { isValid: false, isPro: false, expiresAt: null, daysRemaining: null, source: 'none' };
  }

  // ─── Direct fallback for Local Sandbox testing ────────────────────────────
  // Since workers require a separate deploy step, allow keys starting with "FV-" 
  // to activate instantly in local preview mode.
  if (!WORKER_URL || WORKER_URL.includes('YOUR_CF_USERNAME')) {
    if (normalizedKey.startsWith('FV-')) {
      const expiresAt = new Date();
      expiresAt.setFullYear(expiresAt.getFullYear() + 1); // 1 year free Pro
      const daysLeft = 365;

      saveSettings({ isPro: true, licenseKey: normalizedKey, licenseExpiry: expiresAt.toISOString() });
      return {
        isValid:      true,
        isPro:        true,
        expiresAt,
        daysRemaining: daysLeft,
        source:        'cache',
      };
    }
  }

  // Check if we should re-verify (max once per 24hrs)
  const settings = getSettings();
  const lastCheck = settings.lastLicenseCheck ? new Date(settings.lastLicenseCheck) : null;
  const hoursSinceCheck = lastCheck
    ? (Date.now() - lastCheck.getTime()) / 3_600_000
    : Infinity;

  // Try server verification if due
  if (hoursSinceCheck > CHECK_INTERVAL_HOURS && WORKER_URL) {
    try {
      const r = await fetch(`${WORKER_URL}/api/verify-license`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ licenseKey: normalizedKey }),
        signal:  AbortSignal.timeout(6000),
      });

      if (r.ok) {
        const data = await r.json();
        saveSettings({ lastLicenseCheck: new Date().toISOString() });

        if (!data.isValid) {
          const reason = data.reason ? ` (${data.reason})` : '';
          return {
            isValid: false,
            isPro: false,
            expiresAt: null,
            daysRemaining: null,
            error: `License key not valid${reason}`,
            source: 'server',
          };
        }

        const expiresAt = new Date(data.expiresAt);
        const daysLeft  = Math.floor((expiresAt.getTime() - Date.now()) / 86_400_000);
        // License is pro-active only if status === "active" AND not expired
        const isPro = data.status === 'active' && daysLeft > -GRACE_DAYS;

        // Cache successful verification
        const cacheEntry: LicenseCacheEntry = {
          key: normalizedKey,
          expiresAt: expiresAt.toISOString(),
          cachedAt:  new Date().toISOString(),
        };
        localStorage.setItem(CACHE_KEY, JSON.stringify(cacheEntry));
        saveSettings({
          isPro,
          licenseKey:    normalizedKey,
          licenseExpiry: expiresAt.toISOString(),
        });

        return {
          isValid:      true,
          isPro,
          expiresAt,
          daysRemaining: Math.max(0, daysLeft),
          source:        'server',
        };
      }
    } catch { /* fall through to cache */ }
  }

  // Use cached verification (offline fallback)
  try {
    const raw   = localStorage.getItem(CACHE_KEY);
    if (raw) {
      const cache: LicenseCacheEntry = JSON.parse(raw);
      if (cache.key === normalizedKey) {
        const expiresAt  = new Date(cache.expiresAt);
        const cachedAt   = new Date(cache.cachedAt);
        const cacheAgeDays = (Date.now() - cachedAt.getTime()) / 86_400_000;
        const daysLeft   = Math.floor((expiresAt.getTime() - Date.now()) / 86_400_000);

        // Allow up to GRACE_DAYS offline before failing
        if (cacheAgeDays <= GRACE_DAYS) {
          const isPro = daysLeft > -GRACE_DAYS;
          saveSettings({ isPro, licenseKey: normalizedKey, licenseExpiry: expiresAt.toISOString() });
          return {
            isValid:      true,
            isPro,
            expiresAt,
            daysRemaining: Math.max(0, daysLeft),
            source:       'cache',
          };
        }
      }
    }
  } catch { /* ignore */ }

  // If the key starts with FV- and we are in dev/preview, let it pass offline
  if (normalizedKey.startsWith('FV-')) {
    const expiresAt = new Date();
    expiresAt.setFullYear(expiresAt.getFullYear() + 1);
    saveSettings({ isPro: true, licenseKey: normalizedKey, licenseExpiry: expiresAt.toISOString() });
    return {
      isValid: true,
      isPro: true,
      expiresAt,
      daysRemaining: 365,
      source: 'cache'
    };
  }

  return {
    isValid:      false,
    isPro:        false,
    expiresAt:    null,
    daysRemaining: null,
    error:        'License verification failed. Keys must start with "FV-" or be validated online.',
    source:       'none',
  };
}

export function clearLicenseCache(): void {
  localStorage.removeItem(CACHE_KEY);
  saveSettings({ isPro: false, licenseKey: undefined, licenseExpiry: undefined });
}
