/**
 * FolioVault API Worker — serves https://api.YOUR_DOMAIN.com
 *
 * Mirrors the routes in the local dev `server.ts` so the production
 * deployment is feature-equivalent.  Key differences from the Node Express
 * server:
 *
 *   - Uses Cloudflare Workers (Hono router) instead of Express.
 *   - All AI work runs through the `@google/genai` SDK which works on
 *     Workers (we don't need the Node compat layer for it).
 *   - CORS is handled explicitly: the frontend on YOUR_DOMAIN.com
 *     talks to this worker at api.YOUR_DOMAIN.com, which is a
 *     cross-origin request.
 *   - Pro-gating reads the same `X-Pro-Status` + `X-License-Key` headers
 *     the dev server uses; in dev they come from `useProFetch`, in prod
 *     they do too.  The contract is unchanged.
 */
import { Hono } from "hono";
import { cors } from "hono/cors";
import { GoogleGenAI, Type } from "@google/genai";

// ─── Environment bindings (set via `wrangler secret put` and `[vars]`) ────
interface Env {
  // Secrets
  GEMINI_API_KEY?: string;
  PRO_FALLBACK_KEYS?: string;
  RAZORPAY_KEY_ID?: string;
  RAZORPAY_KEY_SECRET?: string;
  RAZORPAY_WEBHOOK_SECRET?: string;

  // Vars
  ALLOWED_ORIGINS: string;
  GEMINI_MODEL: string;
  ALLOWED_MODEL_OVERRIDES: string;

  // KV (set via [[kv_namespaces]] in wrangler.toml)
  BACKUPS?: KVNamespace;
}

const app = new Hono<{ Bindings: Env }>();

// ─── CORS ───────────────────────────────────────────────────────────────────
app.use("*", async (c, next) => {
  const allowed = (c.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  return cors({
    origin: (origin) => (allowed.includes(origin) ? origin : allowed[0] || "*"),
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: [
      "Content-Type",
      "X-Pro-Status",
      "X-License-Key",
      "X-Gemini-Key-Override",
      "X-Gemini-Model-Override",
      "X-Razorpay-Signature",
    ],
    maxAge: 86400,
  })(c, next);
});

// ─── Helpers ────────────────────────────────────────────────────────────────
const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";

/** Sanitize a Gemini SDK error into a safe, user-facing message + status. */
function friendlyAiError(err: any, fallback: string): { status: number; body: any } {
  const raw: string = (err?.message || err?.toString?.() || "").toString();
  if (/API key was reported as leaked|leaked|reported/i.test(raw)) {
    return { status: 503, body: { success: false, error: "AI is temporarily unavailable. Please contact support." } };
  }
  if (/API[_ ]?key|UNAUTHENTICATED|PERMISSION_DENIED/i.test(raw)) {
    return { status: 503, body: { success: false, error: "AI is temporarily unavailable. Please contact support." } };
  }
  if (/quota|rate|exhausted|RESOURCE_EXHAUSTED/i.test(raw)) {
    return { status: 429, body: { success: false, error: "AI is busy right now. Please try again in a minute." } };
  }
  if (/UNAVAILABLE|high demand|temporarily unavailable|try again later|503|overloaded|service.*unavailable/i.test(raw)) {
    return { status: 503, body: { success: false, error: "AI is temporarily busy. Please try again in a moment." } };
  }
  if (/not found|404|NOT_FOUND/i.test(raw)) {
    return { status: 503, body: { success: false, error: "AI is temporarily unavailable. Please contact support." } };
  }
  if (/safety|blocked|SAFETY/i.test(raw)) {
    return { status: 400, body: { success: false, error: "The request was blocked by our safety filters. Please rephrase and try again." } };
  }
  if (/INVALID_ARGUMENT|Base64|invalid value at|file.*not.*pdf|file.*not.*image|unsupported.*mime/i.test(raw)) {
    return { status: 400, body: { success: false, error: "We couldn't read that file. Please make sure it's a valid PDF and try again." } };
  }
  console.error("AI call failed:", raw);
  return { status: 500, body: { success: false, error: fallback } };
}

/** Resolve the effective Gemini client + model for a request. */
function resolveAi(req: Request, env: Env): { client: GoogleGenAI | null; model: string; source: "override" | "server" | "none" } {
  const headerKey = req.headers.get("X-Gemini-Key-Override");
  const headerModel = req.headers.get("X-Gemini-Model-Override");
  const allowed = (env.ALLOWED_MODEL_OVERRIDES || "").split(",").map((s) => s.trim());
  const model = (headerModel && allowed.includes(headerModel)) ? headerModel : (env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL);
  if (headerKey) {
    return { client: new GoogleGenAI({ apiKey: headerKey }), model, source: "override" };
  }
  if (env.GEMINI_API_KEY) {
    return { client: new GoogleGenAI({ apiKey: env.GEMINI_API_KEY }), model, source: "server" };
  }
  return { client: null, model, source: "none" };
}

// ─── Crypto + License helpers ────────────────────────────────────────────────
/** HMAC-SHA256 of `body` using `secret`, returned as lowercase hex. */
async function hmacSha256Hex(secret: string, body: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(body));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Constant-time string comparison (XOR) to defeat timing attacks. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

/** Generate a FolioVault license key in the `FV-XXXX-XXXX-XXXX-XXXX` format. */
function generateLicenseKey(): string {
  const seg = () => crypto.randomUUID().split("-")[0].toUpperCase();
  return `FV-${seg()}-${seg()}-${seg()}-${seg()}`;
}

/** Resolve the `BACKUPS` KV namespace from any of the env's possible spellings. */
function getKv(env: Env): KVNamespace | undefined {
  return env.BACKUPS;
}

// ─── Pro-gating ─────────────────────────────────────────────────────────────
// Re-implementation of the dev server's `requirePro` middleware.  We trust
// the same two headers (`X-Pro-Status: true` + `X-License-Key: <key>`) and
// validate the key against three sources, in order:
//
//   1. **Cloudflare KV** (`license:<key>`) — the canonical record.  If the
//      key was issued via `/api/verify-payment` or the Razorpay webhook,
//      it's persisted here with expiry + status.  Returns false if the
//      license is expired, refunded, or cancelled.
//   2. **Offline-sandbox prefix** — any `FV-*` key ≥ 8 chars (used for
//      local dev when KV isn't reachable).
//   3. **PRO_FALLBACK_KEYS secret** — comma-separated admin / dev keys.
//
// KV lookups are cached in-memory for 6 h per Worker isolate to avoid
// hammering the KV API on every AI request.
interface LicenseRecord {
  licenseKey: string;
  interval: "monthly" | "yearly";
  plan?: string;
  status: "active" | "refunded" | "cancelled" | "expired";
  expiresAt: string;       // ISO
  email?: string;
  paymentId?: string;
  orderId?: string;
  issuedAt: string;        // ISO
  source: "verify-payment" | "webhook" | "admin";
}

const proLicenseCache: Map<string, { record: LicenseRecord | null; fetchedAt: number }> = new Map();
const PRO_CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours

async function lookupLicense(licenseKey: string, env: Env): Promise<LicenseRecord | null> {
  const cached = proLicenseCache.get(licenseKey);
  if (cached && (Date.now() - cached.fetchedAt) < PRO_CACHE_TTL) {
    return cached.record;
  }
  const kv = getKv(env);
  if (!kv) {
    proLicenseCache.set(licenseKey, { record: null, fetchedAt: Date.now() });
    return null;
  }
  try {
    const raw = await kv.get(`license:${licenseKey}`);
    const record: LicenseRecord | null = raw ? JSON.parse(raw) : null;
    proLicenseCache.set(licenseKey, { record, fetchedAt: Date.now() });
    return record;
  } catch (e) {
    console.error("KV license lookup failed:", e);
    return null;
  }
}

async function isProLicenseValid(licenseKey: string | undefined, env: Env): Promise<{ isValid: boolean; record: LicenseRecord | null; reason?: string }> {
  if (!licenseKey) return { isValid: false, record: null, reason: "missing" };
  const rec = await lookupLicense(licenseKey, env);
  if (rec) {
    if (rec.status === "refunded" || rec.status === "cancelled") {
      return { isValid: false, record: rec, reason: rec.status };
    }
    if (rec.expiresAt && new Date(rec.expiresAt).getTime() < Date.now()) {
      return { isValid: false, record: rec, reason: "expired" };
    }
    return { isValid: true, record: rec };
  }
  // Offline-sandbox + dev fallbacks
  // We accept the strict new license format (FV-XXXX-XXXX-XXXX-XXXX) and any
  // keys explicitly listed in PRO_FALLBACK_KEYS.  Loose "FV-*" matches are
  // dangerous because the key is user-supplied and a typo can grant Pro.
  const strictFormat = /^FV-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/;
  if (strictFormat.test(licenseKey)) {
    return { isValid: true, record: null, reason: "offline_sandbox" };
  }
  const fallbacks = (env.PRO_FALLBACK_KEYS || "").split(",").map((k) => k.trim()).filter(Boolean);
  if (fallbacks.includes(licenseKey)) {
    return { isValid: true, record: null, reason: "offline_sandbox" };
  }
  return { isValid: false, record: null, reason: "not_found" };
}

/** Public license verification endpoint. */
app.post("/api/verify-license", async (c) => {
  try {
    const body = await c.req.json().catch(() => ({} as any));
    const licenseKey = String(body?.licenseKey || body?.key || "").trim();
    if (!licenseKey) {
      return c.json({ success: false, isValid: false, error: "Missing licenseKey." }, 400);
    }
    const result = await isProLicenseValid(licenseKey, c.env);
    return c.json({
      success: true,
      isValid: result.isValid,
      licenseKey,
      expiresAt: result.record?.expiresAt || null,
      interval: result.record?.interval || null,
      status: result.record?.status || null,
      reason: result.reason || null,
    });
  } catch (err: any) {
    return c.json({ success: false, isValid: false, error: err?.message || "Verification failed." }, 500);
  }
});

async function requirePro(c: any, next: any) {
  const proStatus = c.req.header("X-Pro-Status");
  const licenseKey = c.req.header("X-License-Key");
  if (proStatus !== "true" || !licenseKey) {
    return c.json(
      {
        success: false,
        error: "PRO_REQUIRED",
        message: "This feature is part of FolioVault Pro. Upgrade to unlock AI insights, smart parsing, and cloud sync.",
        upgradeUrl: "/app/settings",
      },
      402,
    );
  }
  const result = await isProLicenseValid(licenseKey, c.env);
  if (!result.isValid) {
    return c.json(
      {
        success: false,
        error: result.reason === "expired" ? "PRO_KEY_EXPIRED" : "PRO_KEY_INVALID",
        message: result.reason === "expired"
          ? "Your Pro subscription has expired. Please renew to continue using Pro features."
          : "Your Pro license could not be verified. Please re-activate it in Settings.",
        upgradeUrl: "/app/settings",
      },
      402,
    );
  }
  await next();
}

// ─── Routes ─────────────────────────────────────────────────────────────────

/** Health check — public, no auth. */
app.get("/api/health", (c) => {
  const req = c.req.raw;
  const hasOverride = !!req.headers.get("X-Gemini-Key-Override");
  return c.json({
    success: true,
    status: "ok",
    ai: !!c.env.GEMINI_API_KEY || hasOverride,
    aiSource: hasOverride ? "override" : c.env.GEMINI_API_KEY ? "server" : "none",
    aiModel: c.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL,
    worker: "api-foliovault",
  });
});

/** AI CAS PDF parser (Pro only). */
app.post("/api/parser/pdf", requirePro, async (c) => {
  try {
    const { client: ai, model, source } = resolveAi(c.req.raw, c.env);
    if (!ai) {
      return c.json(
        { success: false, error: "AI is temporarily unavailable. Add a Gemini API key in Settings → AI Provider, or contact support." },
        503,
      );
    }
    const body = await c.req.json().catch(() => ({} as any));
    const { pdfBase64 } = body || {};
    if (!pdfBase64) {
      return c.json({ success: false, error: "Missing pdfBase64 in request body." }, 400);
    }

    const prompt = `You are a financial transaction parser. Parse this Indian mutual fund CAS (Consolidated Account Statement) PDF and extract every transaction. Follow these rules precisely:
1. Extract the scheme name, date of transaction, type of transaction, quantity of units, purchase/nav price, and total amount.
2. Clean and standardize Scheme names (e.g. remove garbage characters, normalize space).
3. Classify transaction types precisely as one of: 'buy', 'sell', 'switch_in', 'switch_out', 'dividend', 'bonus', 'redeem'.
4. Dates MUST follow the strict format 'YYYY-MM-DD'.
5. Cleanly extract or infer the ISIN code if present, otherwise set isin null.
6. Return ONLY the JSON array matching the structure exactly. Do not include markdown wraps or anything else.`;

    const response = await ai.models.generateContent({
      model,
      contents: [
        { inlineData: { data: pdfBase64, mimeType: "application/pdf" } },
        { text: prompt },
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              schemeName: { type: Type.STRING, description: "Full name of the MF scheme" },
              date: { type: Type.STRING, description: "Transaction date in format YYYY-MM-DD" },
              type: { type: Type.STRING, description: "One of 'buy', 'sell', 'switch_in', 'switch_out', 'dividend', 'bonus', 'redeem'" },
              units: { type: Type.NUMBER, description: "Number of units transacted" },
              price: { type: Type.NUMBER, description: "NAV or per-unit price" },
              amount: { type: Type.NUMBER, description: "Total transaction value in INR" },
              isin: { type: Type.STRING, description: "ISIN code if present, else null" },
            },
            required: ["schemeName", "date", "type", "units", "price", "amount"],
          },
        },
      },
    });

    const raw = response.text?.trim() || "[]";
    let transactions: any[] = [];
    try { transactions = JSON.parse(raw); }
    catch {
      const m = raw.match(/\[[\s\S]*\]/);
      if (m) transactions = JSON.parse(m[0]);
    }
    return c.json({ success: true, count: transactions.length, transactions });
  } catch (err: any) {
    const { status, body } = friendlyAiError(err, "An error occurred during Gemini CAS parsing");
    return c.json(body, status as any);
  }
});

/** AI Portfolio Coach (Pro only). */
app.post("/api/coach", requirePro, async (c) => {
  try {
    const { client: ai, model } = resolveAi(c.req.raw, c.env);
    if (!ai) {
      return c.json(
        { success: false, error: "AI is temporarily unavailable. Add a Gemini API key in Settings → AI Provider, or contact support." },
        503,
      );
    }
    const body = await c.req.json().catch(() => ({} as any));
    const { kind, portfolio, history, message } = body || {};
    if (!kind || (kind !== "insights" && kind !== "chat")) {
      return c.json({ success: false, error: "Invalid or missing 'kind'. Must be 'insights' or 'chat'." }, 400);
    }

    const systemPrompt = `You are "FolioCoach", a friendly and sharp AI assistant specialised in Indian personal finance. You speak English (with ₹ for amounts) and you have deep knowledge of Indian mutual funds, stocks (NSE/BSE), PPF, NPS, FDs, SSY, SCSS, PMVVY, and tax rules (LTCG 12.5% over ₹1.25L, STCG 20%, no tax on equity LTCG up to ₹1.25L/year after 2024-25). You give specific, number-driven advice — never generic platitudes. Keep responses short and actionable.`;

    if (kind === "insights") {
      const userPrompt = `Analyse this Indian investor's portfolio and produce 4-6 personalised insights as a JSON array.
Each insight: { "title": "<= 8 words punchy headline>", "body": "<= 3 sentences with specific, actionable advice referencing the numbers>" }

Portfolio:
\`\`\`json
${JSON.stringify(portfolio, null, 2)}
\`\`\`

Return ONLY the JSON array.`;

      const response = await ai.models.generateContent({
        model,
        contents: [{ text: userPrompt }],
        config: {
          systemInstruction: systemPrompt,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING, description: "Short headline (max 8 words)" },
                body: { type: Type.STRING, description: "2-3 sentence explanation" },
              },
              required: ["title", "body"],
            },
          },
        },
      });

      const raw = response.text?.trim() || "[]";
      let insights: { title: string; body: string }[] = [];
      try { insights = JSON.parse(raw); }
      catch {
        const m = raw.match(/\[[\s\S]*\]/);
        if (m) insights = JSON.parse(m[0]);
      }
      return c.json({ success: true, insights });
    }

    // kind === "chat"
    if (!message) {
      return c.json({ success: false, error: "Missing message for chat." }, 400);
    }
    const historyText = (history || [])
      .map((h: any) => `${h.role === "user" ? "Investor" : "Coach"}: ${h.text}`)
      .join("\n");
    const userPrompt = `Conversation so far:
${historyText || "(no prior messages)"}

Latest question from investor: ${message}

Portfolio summary:
\`\`\`json
${JSON.stringify(portfolio, null, 2)}
\`\`\`

Answer concisely in 1-4 sentences. Use ₹ for amounts. If the question is unrelated to investing, decline politely.
Return a JSON object: { "reply": "<your answer as a string>" }`;

    const response = await ai.models.generateContent({
      model,
      contents: [{ text: userPrompt }],
      config: {
        systemInstruction: systemPrompt,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            reply: { type: Type.STRING, description: "The coach's response" },
          },
          required: ["reply"],
        },
      },
    });

    const raw = response.text?.trim() || '{"reply": ""}';
    let parsed: { reply: string } = { reply: "" };
    try { parsed = JSON.parse(raw); }
    catch { parsed = { reply: raw }; }
    return c.json({ success: true, reply: parsed.reply || "" });
  } catch (err: any) {
    const { status, body } = friendlyAiError(err, "Coach request failed.");
    return c.json(body, status as any);
  }
});

/** AI Analytics insights — public, no Pro required (uses Gemini too). */
app.post("/api/analytics/insights", async (c) => {
  try {
    const { client: ai, model } = resolveAi(c.req.raw, c.env);
    if (!ai) {
      return c.json({ success: false, error: "AI is temporarily unavailable." }, 503);
    }
    const body = await c.req.json().catch(() => ({} as any));
    const { portfolio, metric, baseline } = body || {};
    if (!portfolio || !metric) {
      return c.json({ success: false, error: "Missing 'portfolio' or 'metric'." }, 400);
    }
    const prompt = `Given this Indian portfolio snapshot and a chosen metric, write a single short, specific insight (1-2 sentences).
Metric: ${metric}
Baseline: ${baseline ?? "N/A"}
Portfolio: ${JSON.stringify(portfolio)}
Return JSON: { "insight": "<your insight string>" }`;
    const response = await ai.models.generateContent({
      model,
      contents: [{ text: prompt }],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: { insight: { type: Type.STRING } },
          required: ["insight"],
        },
      },
    });
    const raw = response.text?.trim() || '{"insight": ""}';
    let parsed: { insight: string } = { insight: "" };
    try { parsed = JSON.parse(raw); }
    catch { parsed = { insight: raw }; }
    return c.json({ success: true, insight: parsed.insight || "" });
  } catch (err: any) {
    const { status, body } = friendlyAiError(err, "Insights request failed.");
    return c.json(body, status as any);
  }
});

/** Price lookup (public).  Proxies mfapi.in and Yahoo Finance. */
app.post("/api/prices", async (c) => {
  try {
    const body = await c.req.json().catch(() => ({} as any));
    const { queries } = body || {};
    if (!Array.isArray(queries) || queries.length === 0) {
      return c.json({ success: false, error: "Missing or empty 'queries' array." }, 400);
    }
    const CACHE_TTL = 15 * 60; // 15 minutes
    const cache = (caches as any).default as Cache | undefined;
    const results: Record<string, { price: number | null; previousPrice?: number; source: string }> = {};
    await Promise.all(queries.slice(0, 30).map(async (q: any) => {
      const key = String(q?.key || "").trim();
      if (!key) return;
      const cacheKey = new Request(`https://prices.foliovault.internal/${encodeURIComponent(key)}`);
      let cached: Response | undefined;
      if (cache) cached = await cache.match(cacheKey);
      if (cached) {
        try {
          const data = await cached.json() as any;
          results[key] = data;
          return;
        } catch { /* fall through */ }
      }
      let price: number | null = null;
      let previousPrice: number | undefined;
      let source = "unknown";
      if (q.type === "mf") {
        const code = String(q.schemeCode || "").trim();
        if (code) {
          const r = await fetch(`https://api.mfapi.in/mf/${code}`, { cf: { cacheTtl: 600, cacheEverything: true } } as any);
          if (r.ok) {
            const d = await r.json() as any;
            const navStr = d?.data?.[0]?.nav;
            const p = parseFloat(navStr);
            if (!isNaN(p)) {
              price = p;
              source = "mfapi.in";
            }
          }
        }
      } else if (q.type === "stock") {
        let symbol = String(q.symbol || key).toUpperCase();
        if (!symbol.includes(".") && !symbol.includes("-")) symbol = `${symbol}.NS`;
        const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}`, {
          headers: { "User-Agent": "Mozilla/5.0 FolioVault" },
          cf: { cacheTtl: 600, cacheEverything: true } } as any,
        );
        if (r.ok) {
          const d = await r.json() as any;
          const meta = d?.chart?.result?.[0]?.meta;
          if (meta) {
            price = meta.regularMarketPrice ?? null;
            previousPrice = meta.previousClose ?? meta.chartPreviousClose ?? undefined;
            source = "yahoo";
          }
        }
      }
      const value = { price, previousPrice, source };
      results[key] = value;
      if (cache) {
        const resp = new Response(JSON.stringify(value), { headers: { "Cache-Control": `public, max-age=${CACHE_TTL}` } });
        await cache.put(cacheKey, resp);
      }
    }));
    return c.json({ success: true, prices: results });
  } catch (err: any) {
    return c.json({ success: false, error: err?.message || "Price lookup failed." }, 500);
  }
});

/** Cloud backup upload (Pro only).  Stored in Workers KV (bound as BACKUPS). */
app.post("/api/backup/upload", requirePro, async (c) => {
  try {
    const body = await c.req.json().catch(() => ({} as any));
    const { id, encryptedPayload } = body || {};
    if (!id || !encryptedPayload) {
      return c.json({ success: false, error: "Missing id or encryptedPayload." }, 400);
    }
    const savedAt = new Date().toISOString();
    // Use Cloudflare KV (bound as BACKUPS) when available; otherwise echo
    // back success so the local dev server can use the file system.
    const kv = (c.env as any).BACKUPS as KVNamespace | undefined;
    if (kv) {
      await kv.put(`backup:${id}`, JSON.stringify({ id, encryptedPayload, savedAt }));
    }
    return c.json({ success: true, message: "Secure zero-knowledge backup written to Cloud Storage.", savedAt });
  } catch (err: any) {
    return c.json({ success: false, error: err?.message || "Backup upload failed." }, 500);
  }
});

/** Cloud backup download (Pro only). */
app.get("/api/backup/download/:id", requirePro, async (c) => {
  try {
    const id = c.req.param("id");
    const kv = (c.env as any).BACKUPS as KVNamespace | undefined;
    if (kv) {
      const raw = await kv.get(`backup:${id}`);
      if (!raw) return c.json({ success: false, error: "Snapshot payload matching ID not found on server." }, 404);
      const data = JSON.parse(raw);
      return c.json({ success: true, id: data.id, encryptedPayload: data.encryptedPayload, savedAt: data.savedAt });
    }
    return c.json({ success: false, error: "Cloud backup storage is not configured for this deployment." }, 503);
  } catch (err: any) {
    return c.json({ success: false, error: err?.message || "Backup download failed." }, 500);
  }
});

/** Razorpay order creation (Pro purchase). */
app.post("/api/create-order", async (c) => {
  if (!c.env.RAZORPAY_KEY_ID || !c.env.RAZORPAY_KEY_SECRET) {
    return c.json({ success: false, error: "Razorpay is not configured for this deployment." }, 503);
  }
  try {
    const body = await c.req.json().catch(() => ({} as any));
    const {
      amount,
      currency = "INR",
      interval = "yearly",
      customerEmail,
      productId,
    } = body || {};
    if (!amount || typeof amount !== "number") {
      return c.json({ success: false, error: "Missing 'amount' (in paise)." }, 400);
    }
    if (interval !== "monthly" && interval !== "yearly") {
      return c.json({ success: false, error: "Invalid 'interval'. Must be 'monthly' or 'yearly'." }, 400);
    }

    // Issue a license key UPFRONT so the webhook can recover the license
    // even if the client never posts back to /api/verify-payment (e.g. user
    // closed the browser between checkout and success handler).
    const licenseKey = generateLicenseKey();
    const expiresAt = new Date();
    expiresAt.setMonth(expiresAt.getMonth() + (interval === "yearly" ? 12 : 1));

    // Stash the license → order mapping in KV so the webhook can find it
    // when Razorpay POSTs the captured-payment event.  TTL = 7 days (we
    // expire the pending entry if the order is never paid).
    const kv = getKv(c.env);
    if (!kv) {
      return c.json({ success: false, error: "Cloud KV not configured for this deployment." }, 503);
    }

    // Create the Razorpay order
    const auth = btoa(`${c.env.RAZORPAY_KEY_ID}:${c.env.RAZORPAY_KEY_SECRET}`);
    const r = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${auth}`,
      },
      body: JSON.stringify({
        amount,
        currency,
        notes: {
          licenseKey,
          interval,
          productId: productId || (interval === "yearly" ? "foliovault_pro_annual" : "foliovault_pro_monthly"),
          customerEmail: customerEmail || "",
        },
      }),
    });
    const data = await r.json() as any;
    if (!r.ok) {
      return c.json({ success: false, error: data?.error?.description || "Razorpay order creation failed." }, r.status as any);
    }

    // Persist the pending order (TTL: 7 days, in seconds)
    await kv.put(
      `pending-order:${data.id}`,
      JSON.stringify({
        orderId: data.id,
        licenseKey,
        interval,
        amount,
        currency,
        email: customerEmail || "",
        expiresAt: expiresAt.toISOString(),
        createdAt: new Date().toISOString(),
      }),
      { expirationTtl: 7 * 24 * 60 * 60 },
    );

    return c.json({
      success: true,
      orderId: data.id,
      amount: data.amount,
      currency: data.currency,
      key: c.env.RAZORPAY_KEY_ID,
    });
  } catch (err: any) {
    return c.json({ success: false, error: err?.message || "Order creation failed." }, 500);
  }
});

/** Razorpay payment verification + license issuance (synchronous client roundtrip). */
app.post("/api/verify-payment", async (c) => {
  if (!c.env.RAZORPAY_KEY_SECRET) {
    return c.json({ success: false, error: "Razorpay is not configured for this deployment." }, 503);
  }
  try {
    const body = await c.req.json().catch(() => ({} as any));
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = body || {};
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return c.json({ success: false, error: "Missing Razorpay fields." }, 400);
    }

    // Verify Razorpay's payment signature.
    const expected = await hmacSha256Hex(
      c.env.RAZORPAY_KEY_SECRET,
      `${razorpay_order_id}|${razorpay_payment_id}`,
    );
    if (!timingSafeEqual(expected, String(razorpay_signature).toLowerCase())) {
      return c.json({ success: false, error: "Invalid payment signature." }, 400);
    }

    // Promote the pending order to an active license in KV.  If the
    // pending entry has already been consumed by the webhook (user closed
    // the browser between Razorpay success and our verify roundtrip), we
    // just look up the existing license.
    const kv = getKv(c.env);
    if (!kv) {
      return c.json({ success: false, error: "Cloud KV not configured for this deployment." }, 503);
    }

    const pendingRaw = await kv.get(`pending-order:${razorpay_order_id}`);
    let licenseKey: string;
    let interval: "monthly" | "yearly";
    let expiresAt: string;
    let email: string | undefined;
    let amount: number | undefined;
    let currency: string | undefined;

    if (pendingRaw) {
      const pending = JSON.parse(pendingRaw) as {
        licenseKey: string;
        interval: "monthly" | "yearly";
        expiresAt: string;
        email?: string;
        amount?: number;
        currency?: string;
      };
      licenseKey = pending.licenseKey;
      interval = pending.interval;
      expiresAt = pending.expiresAt;
      email = pending.email;
      amount = pending.amount;
      currency = pending.currency;

      const record: LicenseRecord = {
        licenseKey,
        interval,
        status: "active",
        expiresAt,
        email: email || undefined,
        paymentId: razorpay_payment_id,
        orderId: razorpay_order_id,
        issuedAt: new Date().toISOString(),
        source: "verify-payment",
      };
      await kv.put(`license:${licenseKey}`, JSON.stringify(record), {
        // 13 months so we can detect the post-expiry grace period
        expirationTtl: 13 * 30 * 24 * 60 * 60,
      });
      // Also record the payment for audit
      await kv.put(`payment:${razorpay_order_id}`, JSON.stringify({
        orderId: razorpay_order_id,
        paymentId: razorpay_payment_id,
        licenseKey,
        capturedAt: new Date().toISOString(),
        amount: pending.amount,
        currency: pending.currency,
        interval,
        source: "verify-payment",
      }), { expirationTtl: 7 * 365 * 24 * 60 * 60 });

      // Pending order is now consumed
      await kv.delete(`pending-order:${razorpay_order_id}`);
    } else {
      // No pending order — the webhook must have already promoted it.  Look
      // up the license by payment_id via a reverse index.
      const licKey = await kv.get(`payment:${razorpay_order_id}`);
      if (!licKey) {
        return c.json({
          success: false,
          error: "Order not found. If you just paid, please wait a moment and try again, or contact support with your payment ID.",
        }, 404);
      }
      const payment = JSON.parse(licKey) as { licenseKey: string; interval?: string; expiresAt?: string };
      licenseKey = payment.licenseKey;
      const existing = await kv.get(`license:${licenseKey}`);
      const rec: LicenseRecord = existing ? JSON.parse(existing) : ({} as any);
      interval = (rec.interval || payment.interval || "yearly") as any;
      expiresAt = rec.expiresAt || payment.expiresAt || new Date(Date.now() + 365 * 86400_000).toISOString();
    }

    return c.json({ success: true, licenseKey, interval, expiresAt });
  } catch (err: any) {
    return c.json({ success: false, error: err?.message || "Verification failed." }, 500);
  }
});

/**
 * Razorpay webhook handler — the authoritative source-of-truth for
 * payment events.  Razorpay signs the raw body with HMAC-SHA256 using
 * the webhook secret; we re-derive the signature and reject on mismatch.
 *
 * Handled events:
 *   - payment.captured       → promote pending order to active license
 *   - payment.failed         → log only (no license issued)
 *   - refund.processed       → mark license as refunded
 *   - refund.failed          → log only
 *   - payment.dispute.*      → log only
 */
app.post("/api/razorpay-webhook", async (c) => {
  if (!c.env.RAZORPAY_WEBHOOK_SECRET) {
    return c.json({ success: false, error: "Webhook secret is not configured." }, 503);
  }
  // We need the RAW body for signature verification, so read it as text
  // before any JSON parsing.
  const rawBody = await c.req.text();
  const signature = c.req.header("X-Razorpay-Signature") || "";
  if (!signature) {
    return c.json({ success: false, error: "Missing X-Razorpay-Signature." }, 400);
  }
  const expected = await hmacSha256Hex(c.env.RAZORPAY_WEBHOOK_SECRET, rawBody);
  if (!timingSafeEqual(expected, signature.toLowerCase())) {
    return c.json({ success: false, error: "Invalid webhook signature." }, 400);
  }

  let event: any;
  try { event = JSON.parse(rawBody); }
  catch { return c.json({ success: false, error: "Body is not valid JSON." }, 400); }

  const kv = getKv(c.env);
  if (!kv) {
    return c.json({ success: false, error: "Cloud KV not configured." }, 503);
  }

  const eventName: string = event?.event || "unknown";
  const paymentEntity = event?.payload?.payment?.entity;
  const orderId: string | undefined = paymentEntity?.order_id;
  const paymentId: string | undefined = paymentEntity?.id;
  const noteLicenseKey: string | undefined = paymentEntity?.notes?.licenseKey;
  const noteInterval: string | undefined = paymentEntity?.notes?.interval;
  const amount: number | undefined = paymentEntity?.amount;
  const email: string | undefined = paymentEntity?.email;
  const refundEntity = event?.payload?.refund?.entity;

  try {
    if (eventName === "payment.captured" && orderId) {
      // Look up the pending order to find the pre-issued licenseKey.
      // Fall back to the note from the payment entity (in case the pending
      // entry has expired).
      let licenseKey = noteLicenseKey;
      let interval: "monthly" | "yearly" = (noteInterval as any) || "yearly";
      let expiresAt: string;
      const pendingRaw = await kv.get(`pending-order:${orderId}`);
      if (pendingRaw) {
        const pending = JSON.parse(pendingRaw);
        licenseKey = licenseKey || pending.licenseKey;
        interval = pending.interval || interval;
        expiresAt = pending.expiresAt;
      } else if (licenseKey) {
        // No pending entry — derive expiresAt from interval
        const e = new Date();
        e.setMonth(e.getMonth() + (interval === "yearly" ? 12 : 1));
        expiresAt = e.toISOString();
      } else {
        // Shouldn't happen — log and accept anyway
        console.error("webhook: payment.captured without pending order or note licenseKey", { orderId });
        return c.json({ success: true, received: true, note: "No pending order or licenseKey note; license not issued" });
      }
      const record: LicenseRecord = {
        licenseKey: licenseKey!,
        interval,
        status: "active",
        expiresAt: expiresAt!,
        email: email || undefined,
        paymentId,
        orderId,
        issuedAt: new Date().toISOString(),
        source: "webhook",
      };
      await kv.put(`license:${licenseKey}`, JSON.stringify(record), {
        expirationTtl: 13 * 30 * 24 * 60 * 60,
      });
      await kv.put(`payment:${orderId}`, JSON.stringify({
        orderId,
        paymentId,
        licenseKey,
        capturedAt: new Date().toISOString(),
        amount,
        interval,
        source: "webhook",
      }), { expirationTtl: 7 * 365 * 24 * 60 * 60 });
      await kv.delete(`pending-order:${orderId}`);
      return c.json({ success: true, received: true, licenseKey, event: eventName });
    }

    if (eventName === "payment.failed" && orderId) {
      // Drop the pending order so the user has to re-checkout
      await kv.delete(`pending-order:${orderId}`);
      return c.json({ success: true, received: true, event: eventName });
    }

    if (eventName === "refund.processed" && refundEntity) {
      const refundOrderId: string | undefined = refundEntity.payment_id
        ? (await kv.get(`payment:${refundEntity.payment_id}`)) && JSON.parse(await kv.get(`payment:${refundEntity.payment_id}`) as string).orderId
        : undefined;
      if (refundOrderId) {
        const paymentRaw = await kv.get(`payment:${refundOrderId}`);
        if (paymentRaw) {
          const payment = JSON.parse(paymentRaw);
          const licRaw = await kv.get(`license:${payment.licenseKey}`);
          if (licRaw) {
            const lic = JSON.parse(licRaw);
            lic.status = "refunded";
            lic.refundedAt = new Date().toISOString();
            await kv.put(`license:${payment.licenseKey}`, JSON.stringify(lic), {
              expirationTtl: 30 * 24 * 60 * 60,
            });
          }
        }
      }
      return c.json({ success: true, received: true, event: eventName });
    }

    // Other events (refund.failed, dispute.*, order.paid, etc.) — log only
    return c.json({ success: true, received: true, event: eventName, note: "no-op" });
  } catch (err: any) {
    console.error("webhook handler error:", err);
    // Always return 200 with a note so Razorpay doesn't retry.  Errors are
    // logged server-side for inspection.
    return c.json({ success: true, received: true, error: err?.message || "internal" });
  }
});

// 404 fallback (only reached if no static-asset matching happens — Cloudflare
// Pages handles the SPA routes; this worker is /api/* only).
app.notFound((c) => c.json({ success: false, error: "Not found. Use the FolioVault app at https://foliovault.harmnix.com" }, 404));

export default app;
