/**
 * Tiny wrapper around fetch() that automatically attaches the user's Pro
 * license key + status as request headers. The server uses these to gate
 * AI endpoints so free users can't burn the Gemini API quota.
 *
 * Also forwards an optional per-user Gemini key + model override to the
 * server (via `X-Gemini-Key-Override` / `X-Gemini-Model-Override`) so
 * users can configure their own AI provider in Settings without touching
 * the server's environment.
 *
 * URLs are routed through `apiUrl()` so the same code path works in dev
 * (same-origin via the Node Express server) and in production (cross-
 * origin Cloudflare Worker at api.YOUR_DOMAIN.com).
 */
import { useCallback } from 'react';
import { useAppStore } from '../store/appStore';
import { useLicense } from './useLicense';
import { apiUrl } from '../lib/apiBase';

type FetchOptions = RequestInit & { skipAuthHeaders?: boolean };

export function useProFetch() {
  const settings = useAppStore((s) => s.settings);
  const { isPro } = useLicense();

  return useCallback(
    async (url: string, opts: FetchOptions = {}): Promise<Response> => {
      const headers = new Headers(opts.headers);
      if (!opts.skipAuthHeaders) {
        headers.set('X-Pro-Status', isPro ? 'true' : 'false');
        if (settings.licenseKey) headers.set('X-License-Key', settings.licenseKey);
        if (settings.geminiKey) headers.set('X-Gemini-Key-Override', settings.geminiKey);
        if (settings.geminiModel) headers.set('X-Gemini-Model-Override', settings.geminiModel);
      }
      return fetch(apiUrl(url), { ...opts, headers });
    },
    [isPro, settings.licenseKey, settings.geminiKey, settings.geminiModel],
  );
}
