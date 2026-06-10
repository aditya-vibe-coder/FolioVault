/**
 * Resolve the API base URL.
 *
 * - In dev (`npm run dev`), the Vite server is on the same origin as the
 *   Node Express server, so we hit same-origin `/api/*` and Vite's
 *   middleware proxies it through `server.ts`.
 * - In production (`npm run build` → Pages), the SPA is at
 *   `YOUR_DOMAIN.com` and the API is at `api.YOUR_DOMAIN.com`.
 *   We use the cross-origin worker URL, sending CORS-friendly headers.
 *
 * Override with `VITE_API_BASE` in `.env.local` if you want to point at a
 * different worker (e.g. a staging environment).
 */
export function getApiBase(): string {
  // User override always wins.
  const envBase = (import.meta as any).env?.VITE_API_BASE as string | undefined;
  if (envBase) return envBase.replace(/\/$/, '');

  if ((import.meta as any).env?.PROD) {
    // Production: cross-origin worker
    // 🔁 REPLACE THIS with your deployed Worker URL
    return 'https://api.YOUR_DOMAIN.com';
  }
  // Dev: same-origin
  return '';
}

/**
 * Build a full URL for an API path.  Trims leading slashes to avoid
 * `https://…//api/foo` and respects an empty base (same-origin in dev).
 */
export function apiUrl(path: string): string {
  const base = getApiBase();
  const p = path.startsWith('/') ? path : `/${path}`;
  return base ? `${base}${p}` : p;
}
