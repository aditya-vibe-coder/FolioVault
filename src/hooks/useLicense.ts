/**
 * Hook that surfaces the current Pro status of the active user.
 *
 * It re-evaluates when the user types a new license key (via the
 * `LicenseActivation` UI in Settings) and triggers a re-verification
 * at most once per 24 hours, with a 7-day offline grace period.
 */
import { useEffect, useState, useCallback } from 'react';
import { useAppStore } from '../store/appStore';
import { verifyAndCacheLicense, clearLicenseCache as clearCache } from '../lib/license';
import type { LicenseVerificationResult } from '../types';

const TICK_MS = 60_000; // 1 min

export function useLicense() {
  const settings = useAppStore((s) => s.settings);
  const setSettings = useAppStore((s) => s.setSettings);
  const [verification, setVerification] = useState<LicenseVerificationResult>({
    isValid: !!settings.isPro,
    isPro: !!settings.isPro,
    expiresAt: settings.licenseExpiry ? new Date(settings.licenseExpiry) : null,
    daysRemaining: settings.licenseExpiry
      ? Math.floor((new Date(settings.licenseExpiry).getTime() - Date.now()) / 86_400_000)
      : null,
    source: 'cache',
  });

  // Recompute whenever licenseKey or expiry changes
  useEffect(() => {
    if (!settings.licenseKey) {
      setVerification({
        isValid: false,
        isPro: false,
        expiresAt: null,
        daysRemaining: null,
        source: 'none',
      });
      return;
    }
    setVerification((prev) => ({
      ...prev,
      isPro: !!settings.isPro,
      isValid: !!settings.isPro,
      expiresAt: settings.licenseExpiry ? new Date(settings.licenseExpiry) : null,
      daysRemaining: settings.licenseExpiry
        ? Math.max(0, Math.floor((new Date(settings.licenseExpiry).getTime() - Date.now()) / 86_400_000))
        : null,
    }));
  }, [settings.licenseKey, settings.licenseExpiry, settings.isPro]);

  // Tick down days remaining
  useEffect(() => {
    const t = setInterval(() => {
      setVerification((v) => {
        if (!v.expiresAt) return v;
        const days = Math.floor((v.expiresAt.getTime() - Date.now()) / 86_400_000);
        return { ...v, daysRemaining: Math.max(0, days) };
      });
    }, TICK_MS);
    return () => clearInterval(t);
  }, []);

  const activate = useCallback(
    async (key: string) => {
      const res = await verifyAndCacheLicense(key);
      setVerification(res);
      if (res.isValid) {
        await setSettings({
          isPro: res.isPro,
          licenseKey: key.trim().toUpperCase(),
          licenseExpiry: res.expiresAt?.toISOString(),
        });
      }
      return res;
    },
    [setSettings],
  );

  const deactivate = useCallback(async () => {
    clearCache();
    await setSettings({ isPro: false, licenseKey: undefined, licenseExpiry: undefined });
    setVerification({ isValid: false, isPro: false, expiresAt: null, daysRemaining: null, source: 'none' });
  }, [setSettings]);

  return {
    isPro: settings.isPro,
    licenseKey: settings.licenseKey,
    verification,
    activate,
    deactivate,
  };
}
