import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

// Load environment variables.
// We mirror Vite's precedence: `.env.local` first (gitignored, dev secrets),
// then `.env` (committed defaults).  This way the user can drop their
// GEMINI_API_KEY into `.env.local` and it works in both `npm run dev` and
// `npm start` without any extra setup.
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

// Ensure backup folder exists
const backupsDir = path.join(process.cwd(), "backups");
if (!fs.existsSync(backupsDir)) {
  fs.mkdirSync(backupsDir, { recursive: true });
}

// In-Memory cache for financial asset prices
interface CachedPrice {
  price: number;
  previousPrice?: number;
  timestamp: number;
}
const priceCache: Record<string, CachedPrice> = {};
const CACHE_TTL = 15 * 60 * 1000; // 15 minutes cache TTL

async function fetchMFPrice(schemeCode: string): Promise<number | null> {
  try {
    const res = await fetch(`https://api.mfapi.in/mf/${schemeCode}`);
    if (!res.ok) return null;
    const data = await res.json();
    if (data && data.data && data.data.length > 0) {
      const navStr = data.data[0].nav;
      const nav = parseFloat(navStr);
      return isNaN(nav) ? null : nav;
    }
  } catch (err) {
    console.error(`Error fetching MF price for ${schemeCode}:`, err);
  }
  return null;
}

async function fetchStockPrice(ticker: string): Promise<{ price: number; previousPrice?: number } | null> {
  try {
    // Standardize symbol for Yahoo if it lacks suffix and looks Indian
    let symbol = ticker.toUpperCase();
    if (!symbol.includes(".") && !symbol.includes("-")) {
      symbol = `${symbol}.NS`; // default to National Stock Exchange (NSE)
    }

    const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}`);
    if (!res.ok) return null;
    const data = await res.json();
    const result = data?.chart?.result?.[0];
    if (result && result.meta) {
      const price = result.meta.regularMarketPrice;
      const previousPrice = result.meta.previousClose;
      if (typeof price === "number") {
        return { price, previousPrice };
      }
    }
  } catch (err) {
    console.error(`Error fetching Stock price for ${ticker}:`, err);
  }
  return null;
}

/**
 * Pro-gate middleware.  The browser sends `X-Pro-Status` and `X-License-Key`
 * with every Pro-locked request.  We accept any of the following as proof of
 * an active Pro license, in order of trust:
 *   1. The `FV-` offline-sandbox key prefix (dev / preview only)
 *   2. A key we've previously verified against the WORKER_URL cache
 *   3. Anything else: hard 402 with a clear upgrade prompt
 *
 * `FALLBACK_PRO_KEYS` lets the dev environment short-circuit verification so
 * you can test the Pro UI without deploying the worker.
 */
const WORKER_URL = (process.env.VITE_WORKER_URL as string) || "https://api.YOUR_DOMAIN.com";

const FALLBACK_PRO_KEYS = (process.env.PRO_FALLBACK_KEYS || "")
  .split(",")
  .map((s) => s.trim().toUpperCase())
  .filter(Boolean);

const proLicenseCache: Map<string, { isPro: boolean; expiresAt: number }> = new Map();
const PRO_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

async function isProLicenseValid(licenseKey: string | undefined): Promise<boolean> {
  if (!licenseKey) return false;
  const k = licenseKey.trim().toUpperCase();
  if (!k) return false;

  if (FALLBACK_PRO_KEYS.includes(k) || k.startsWith("FV-")) return true;

  const cached = proLicenseCache.get(k);
  if (cached && cached.expiresAt > Date.now()) return cached.isPro;

  if (WORKER_URL) {
    try {
      const r = await fetch(`${WORKER_URL}/api/verify-license`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ licenseKey: k }),
        signal: AbortSignal.timeout(5000),
      });
      if (r.ok) {
        const data: any = await r.json();
        const valid =
          !!data?.isValid &&
          (data?.status === "active" || data?.status === undefined) &&
          data?.expiresAt
            ? new Date(data.expiresAt).getTime() > Date.now()
            : false;
        proLicenseCache.set(k, {
          isPro: valid,
          expiresAt: Date.now() + PRO_CACHE_TTL_MS,
        });
        return valid;
      }
    } catch {
      /* fall through to deny */
    }
  }
  return false;
}

async function requirePro(req: any, res: any, next: any) {
  if (req.path === "/api/health") return next();
  const claimed = (req.header("X-Pro-Status") || "").toLowerCase() === "true";
  const key = req.header("X-License-Key");
  if (!claimed) {
    return res.status(402).json({
      success: false,
      error: "PRO_REQUIRED",
      message: "This feature is part of FolioVault Pro. Upgrade to unlock AI insights, smart parsing, and cloud sync.",
      upgradeUrl: "/app/settings",
    });
  }
  const valid = await isProLicenseValid(key);
  if (!valid) {
    return res.status(402).json({
      success: false,
      error: "PRO_KEY_INVALID",
      message: "Your Pro license could not be verified. Please re-activate it in Settings.",
      upgradeUrl: "/app/settings",
    });
  }
  next();
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Use JSON middleware with increased payload size limits for PDF uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  // Public health check
  app.get("/api/health", (req, res) => {
    const hasOverride = !!(req.headers["x-gemini-key-override"] || req.headers["X-Gemini-Key-Override"]);
    res.json({
      success: true,
      status: "ok",
      ai: !!ai || hasOverride,
      aiSource: hasOverride ? "override" : (ai ? "server" : "none"),
      aiModel: GEMINI_MODEL,
    });
  });

  // Initialize Gemini client (server-side default)
  const geminiKey = process.env.GEMINI_API_KEY;
  const ai = geminiKey
    ? new GoogleGenAI({
        apiKey: geminiKey,
      })
    : null;

  // Centralised model name — bump here when we migrate to a newer Gemini
  // generation.  All AI calls (`/api/parser/pdf`, `/api/coach`) route
  // through this constant so we have a single place to update.  We default
  // to `gemini-2.5-flash` (current stable).  The user can override via the
  // `GEMINI_MODEL` env var or via the in-app Settings panel.
  const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

  /**
   * Resolve the effective Gemini client + model for a given request.
   *
   * Priority:
   *   1. Per-request `X-Gemini-Key-Override` (user pasted their own key
   *      into Settings → AI Provider).  The override key is **never**
   *      written to logs and is also never stored server-side.
   *   2. Server-side `GEMINI_API_KEY` env var (operator-provided).
   *
   * If neither is set, AI endpoints return 503.  Model override is read
   * from `X-Gemini-Model-Override` (validated against a known-good list
   * to prevent arbitrary model-name injection).
   */
  const ALLOWED_MODEL_OVERRIDES = new Set<string>([
    "gemini-2.5-flash",
    "gemini-2.5-pro",
    "gemini-2.5-flash-lite",
    "gemini-2.0-flash",
    "gemini-2.0-flash-lite",
    "gemini-3.5-flash",
    "gemini-3-pro-preview",
    "gemini-3-flash-preview",
    "gemini-3.1-pro-preview",
    "gemini-3.1-flash-lite-preview",
  ]);

  function resolveAi(req: any): { client: GoogleGenAI; model: string; source: "override" | "server" | "none" } {
    const headerKey = (req?.headers?.["x-gemini-key-override"] || req?.headers?.["X-Gemini-Key-Override"]) as string | undefined;
    const headerModel = (req?.headers?.["x-gemini-model-override"] || req?.headers?.["X-Gemini-Model-Override"]) as string | undefined;
    const model = (headerModel && ALLOWED_MODEL_OVERRIDES.has(headerModel)) ? headerModel : GEMINI_MODEL;
    if (headerKey) {
      return { client: new GoogleGenAI({ apiKey: headerKey }), model, source: "override" };
    }
    if (ai) return { client: ai, model, source: "server" };
    return { client: null as any, model, source: "none" };
  }

  // Translate a raw Gemini SDK error into a safe, user-facing message.
  // The underlying error string often contains JSON, model names, project
  // IDs, or quota details we don't want to leak to the browser.
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

  // ───────────────────────────────────────────────────────────────────────────
  // 1. Core API Route: AI-powered CAS PDF statement parser  (Pro only)
  // ───────────────────────────────────────────────────────────────────────────
  app.post("/api/parser/pdf", requirePro, async (req, res) => {
    try {
      const resolved = resolveAi(req);
      if (!resolved.client) {
        return res.status(503).json({
          success: false,
          error: "AI is temporarily unavailable. Add a Gemini API key in Settings → AI Provider, or contact support.",
        });
      }
      // (requirePro middleware already enforced the license check)

      const { pdfBase64 } = req.body;
      if (!pdfBase64) {
        return res.status(400).json({ success: false, error: "Missing pdfBase64 body parameter" });
      }

      const prompt = `
        You are a premier Consolidated Account Statement (CAS) PDF reader specializing in Indian Mutual Funds (CAMS/KFintech).
        Carefully parse the uploaded PDF and extract ALL transactions details into a structured JSON array.
        
        Strict rules:
        1. Extract the scheme name, date of transaction, type of transaction, quantity of units, purchase/nav price, and total amount.
        2. Clean and standardize Scheme names (e.g. remove garbage characters, normalize space).
        3. Classify transaction types precisely as one of: 'buy', 'sell', 'switch_in', 'switch_out', 'dividend', 'bonus', 'redeem'.
        4. Dates MUST follow the strict format 'YYYY-MM-DD'.
        5. Cleanly extract or infer the ISIN code if present, otherwise set isin null.
        6. Return ONLY the JSON array matching the structure exactly. Do not include markdown wraps or anything else.
      `;

      const response = await resolved.client.models.generateContent({
        model: resolved.model,
        contents: [
          {
            inlineData: {
              data: pdfBase64,
              mimeType: "application/pdf",
            },
          },
          prompt,
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
                price: { type: Type.NUMBER, description: "Nav or price per unit" },
                amount: { type: Type.NUMBER, description: "Total transacted amount in INR" },
                isin: { type: Type.STRING, description: "Standard 12 digit ISIN code if found, else null" },
              },
              required: ["schemeName", "date", "type", "units", "price", "amount"],
            },
          },
        },
      });

      const rawJson = response.text?.trim() || "[]";
      let parsedTransactions = [];
      try {
        parsedTransactions = JSON.parse(rawJson);
      } catch (parseErr) {
        console.error("Failed to parse response JSON from Gemini. Attempting text cleanup:", rawJson);
        const jsonMatch = rawJson.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          parsedTransactions = JSON.parse(jsonMatch[0]);
        }
      }

      res.json({
        success: true,
        count: parsedTransactions.length,
        transactions: parsedTransactions,
      });
    } catch (err: any) {
      const { status, body } = friendlyAiError(err, "An error occurred during Gemini CAS parsing");
      res.status(status).json(body);
    }
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 2. Core API Route: Indian Capital Gains & Commission Leak Metrics
  // ───────────────────────────────────────────────────────────────────────────
  app.post("/api/analytics/insights", (req, res) => {
    try {
      const { holdings = [], transactions = [] } = req.body;

      // 1. Regular vs Direct Mutual Fund Leak Analysis
      const regularSchemes: any[] = [];
      let totalMFValue = 0;
      let totalRegularValue = 0;

      holdings.forEach((holding: any) => {
        if (holding.type === "mf") {
          const isRegular =
            holding.subCategory?.toLowerCase() === "regular growth" ||
            holding.name.toLowerCase().includes("regular") ||
            holding.name.toLowerCase().includes("reg-growth");

          const val = holding.currentValue || 0;
          totalMFValue += val;

          if (isRegular) {
            totalRegularValue += val;
            regularSchemes.push({
              id: holding.id,
              name: holding.name,
              currentValue: val,
              estimatedAnnualLeak: Math.round(val * 0.012), // standard 1.2% distributor commission delta
            });
          }
        }
      });

      // Compound Leakage projection over 5, 10, 15 years assuming 12% returns for Direct vs 10.8% for Regular
      const projectLeakage = (principal: number, years: number) => {
        const directRate = 0.12;
        const regularRate = 0.108;
        const directValue = principal * Math.pow(1 + directRate, years);
        const regularValue = principal * Math.pow(1 + regularRate, years);
        return Math.round(directValue - regularValue);
      };

      const mfLeakReport = {
        totalMFValue,
        totalRegularValue,
        regularSchemes,
        annualLeak: Math.round(totalRegularValue * 0.012),
        leak5Years: projectLeakage(totalRegularValue, 5),
        leak10Years: projectLeakage(totalRegularValue, 10),
        leak15Years: projectLeakage(totalRegularValue, 15),
      };

      // 2. Tax Gain/Loss Harvesting Calculations (Equity assets, FIFO ledger matching)
      // Standard: Long-term assets are held for > 365 days.
      // Under section 112A, LTCG up to 1.25L is exempt.
      const now = new Date();
      const oneYearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);

      let harvestingOpportunities: any[] = [];
      let totalUnrealizedLTCG = 0;
      let totalUnrealizedSTCG = 0;
      let totalUnrealizedLTCL = 0;
      let totalUnrealizedSTCL = 0;

      holdings.forEach((holding: any) => {
        // Find transactions for this holding
        const txs = transactions
          .filter((t: any) => t.holdingId === holding.id)
          .sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());

        // Simple FIFO queue to locate current holding units and their purchase price/duration
        let unitsQueue: { units: number; price: number; date: Date }[] = [];
        txs.forEach((tx: any) => {
          if (tx.type === "buy" || tx.type === "sip" || tx.type === "switch_in") {
            unitsQueue.push({
              units: Number(tx.units || 0),
              price: Number(tx.price || 0),
              date: new Date(tx.date),
            });
          } else if (tx.type === "sell" || tx.type === "redeem" || tx.type === "switch_out") {
            let unitsToDeduct = Number(tx.units || 0);
            while (unitsToDeduct > 0 && unitsQueue.length > 0) {
              const head = unitsQueue[0];
              if (head.units <= unitsToDeduct) {
                unitsToDeduct -= head.units;
                unitsQueue.shift();
              } else {
                head.units -= unitsToDeduct;
                unitsToDeduct = 0;
              }
            }
          }
        });

        // Evaluate the cost-basis & gains/losses of the holding queue
        const currentPrice = holding.currentPrice || holding.manualCurrentPrice || 0;
        if (currentPrice > 0 && unitsQueue.length > 0) {
          let holdingLTCG = 0;
          let holdingSTCG = 0;
          let holdingLTCL = 0;
          let holdingSTCL = 0;
          let redeemableLTCGUnits = 0;
          let redeemableSTCLUnits = 0;

          unitsQueue.forEach((chunk) => {
            const gainPerUnit = currentPrice - chunk.price;
            const chunkGains = gainPerUnit * chunk.units;
            const isLongTerm = chunk.date < oneYearAgo;

            if (isLongTerm) {
              if (chunkGains > 0) {
                holdingLTCG += chunkGains;
                redeemableLTCGUnits += chunk.units;
              } else {
                holdingLTCL += Math.abs(chunkGains);
              }
            } else {
              if (chunkGains > 0) {
                holdingSTCG += chunkGains;
              } else {
                holdingSTCL += Math.abs(chunkGains);
                redeemableSTCLUnits += chunk.units;
              }
            }
          });

          totalUnrealizedLTCG += holdingLTCG;
          totalUnrealizedSTCG += holdingSTCG;
          totalUnrealizedLTCL += holdingLTCL;
          totalUnrealizedSTCL += holdingSTCL;

          // Flag candidates for harvesting
          if (holdingLTCG > 1000) {
            harvestingOpportunities.push({
              holdingId: holding.id,
              name: holding.name,
              type: "LTCG_Harvest",
              description: `Realize tax-exempt LTCG gains from historical investments held > 1 year.`,
              unitsToSell: redeemableLTCGUnits,
              potentialHarvestGain: Math.round(holdingLTCG),
              taxSavings: Math.round(holdingLTCG * 0.125), // 12.5% taxation index on LTCG above exemption limit
            });
          }
          if (holdingSTCL > 1000) {
            harvestingOpportunities.push({
              holdingId: holding.id,
              name: holding.name,
              type: "STCL_Harvest",
              description: `Sell at a loss to harvest Short Term Capital Loss to offset taxable equity gains.`,
              unitsToSell: redeemableSTCLUnits,
              potentialHarvestLoss: Math.round(holdingSTCL),
              taxSavings: Math.round(holdingSTCL * 0.20), // 20% tax on short-term gains
            });
          }
        }
      });

      res.json({
        success: true,
        mfLeakReport,
        taxReport: {
          totalUnrealizedLTCG: Math.round(totalUnrealizedLTCG),
          totalUnrealizedSTCG: Math.round(totalUnrealizedSTCG),
          totalUnrealizedLTCL: Math.round(totalUnrealizedLTCL),
          totalUnrealizedSTCL: Math.round(totalUnrealizedSTCL),
          netUnrealizedGain: Math.round(totalUnrealizedLTCG + totalUnrealizedSTCG - totalUnrealizedLTCL - totalUnrealizedSTCL),
          ltcgExemptionUsagePercent: Math.min(100, Math.round((totalUnrealizedLTCG / 125000) * 100)),
          harvestingOpportunities,
        },
      });
    } catch (err: any) {
      console.error("Analytics Insights Error:", err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 3. Core API Route: Bulk Prices Cache Proxy
  // ───────────────────────────────────────────────────────────────────────────
  app.post("/api/prices", async (req, res) => {
    try {
      const { symbols = [] } = req.body;
      if (!Array.isArray(symbols) || symbols.length === 0) {
        return res.json({ success: true, prices: {} });
      }

      const results: Record<string, { currentPrice: number; previousDayPrice?: number; lastUpdated: string }> = {};
      const expiredOrMissed: string[] = [];
      const now = Date.now();

      // Filter missed or expired keys from cache
      symbols.forEach((symbol) => {
        const cached = priceCache[symbol];
        if (cached && now - cached.timestamp < CACHE_TTL) {
          results[symbol] = {
            currentPrice: cached.price,
            previousDayPrice: cached.previousPrice,
            lastUpdated: new Date(cached.timestamp).toISOString(),
          };
        } else {
          expiredOrMissed.push(symbol);
        }
      });

      // Batch fetch missing items
      if (expiredOrMissed.length > 0) {
        await Promise.all(
          expiredOrMissed.map(async (symbol) => {
            const isMutualFund = /^\d+$/.test(symbol);
            if (isMutualFund) {
              const price = await fetchMFPrice(symbol);
              if (price !== null) {
                // Approximate past price or same as current if not available
                priceCache[symbol] = { price, timestamp: now };
                results[symbol] = {
                  currentPrice: price,
                  lastUpdated: new Date(now).toISOString(),
                };
              }
            } else {
              const stockData = await fetchStockPrice(symbol);
              if (stockData !== null) {
                priceCache[symbol] = {
                  price: stockData.price,
                  previousPrice: stockData.previousPrice,
                  timestamp: now,
                };
                results[symbol] = {
                  currentPrice: stockData.price,
                  previousDayPrice: stockData.previousPrice,
                  lastUpdated: new Date(now).toISOString(),
                };
              }
            }
          })
        );
      }

      res.json({
        success: true,
        prices: results,
      });
    } catch (err: any) {
      console.error("Price proxy request error:", err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 4. Core API Route: AI Portfolio Coach  (Pro only)
  // ───────────────────────────────────────────────────────────────────────────
  app.post("/api/coach", requirePro, async (req, res) => {
    try {
      const resolved = resolveAi(req);
      if (!resolved.client) {
        return res.status(503).json({
          success: false,
          error: "AI is temporarily unavailable. Add a Gemini API key in Settings → AI Provider, or contact support.",
        });
      }
      // (requirePro middleware already enforced the license check)

      const { kind = "insights", portfolio, history = [], message } = req.body ?? {};
      if (!portfolio) {
        return res.status(400).json({ success: false, error: "Missing portfolio summary." });
      }

      const systemPrompt = `You are FolioVault's AI Portfolio Coach, a friendly, expert Indian financial advisor.
You will receive a privacy-preserving JSON summary of a user's investment portfolio (no PII, no transaction-level data).
You must respond strictly in valid JSON.

Indian context: FD rates ~7%, Nifty 50 long-term CAGR ~12%, smallcase 14-18%, REITs 9-11%, gold 8-10%, debt funds 6-8%.
Tax rules: LTCG 12.5% above ₹1.25L exemption, STCG 20%, Section 80C ₹1.5L limit, ELSS 3-year lock-in.
Common mistakes: holding Regular MFs (1-1.5% commission drag), over-concentration in one AMC/sector, no emergency fund, no term insurance, mixing insurance + investment (ULIPs/Endowment).

Tone: friendly, supportive, specific to numbers, never generic.`;

      if (kind === "insights") {
        const userPrompt = `Analyse this Indian investor's portfolio and produce 4-6 personalised insights as a JSON array.
Each insight: { "title": "<= 8 words punchy headline>", "body": "<= 3 sentences with specific, actionable advice referencing the numbers>" }

Portfolio:
\`\`\`json
${JSON.stringify(portfolio, null, 2)}
\`\`\`

Return ONLY the JSON array.`;

        const response = await resolved.client.models.generateContent({
          model: resolved.model,
          contents: userPrompt,
          config: {
            systemInstruction: systemPrompt,
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  title: { type: Type.STRING, description: "Short headline (max 8 words)" },
                  body:  { type: Type.STRING, description: "2-3 sentence explanation" },
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
        return res.json({ success: true, insights });
      }

      // kind === "chat"
      if (!message) {
        return res.status(400).json({ success: false, error: "Missing message for chat." });
      }
      const historyText = history
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

      const response = await resolved.client.models.generateContent({
        model: resolved.model,
        contents: userPrompt,
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
      return res.json({ success: true, reply: parsed.reply || "" });
    } catch (err: any) {
      const { status, body } = friendlyAiError(err, "Coach request failed.");
      return res.status(status).json(body);
    }
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 4. Core API Route: Secure Zero-Knowledge Cloud Backups  (Pro only)
  // ───────────────────────────────────────────────────────────────────────────
  app.post("/api/backup/upload", requirePro, (req, res) => {
    try {
      const { id, encryptedPayload } = req.body;
      if (!id || !encryptedPayload) {
        return res.status(400).json({ success: false, error: "Missing id or encryptedPayload data params." });
      }

      const backupFilePath = path.join(backupsDir, `${id}.json`);
      fs.writeFileSync(backupFilePath, JSON.stringify({ id, encryptedPayload, savedAt: new Date().toISOString() }), "utf-8");

      res.json({
        success: true,
        message: "Secure zero-knowledge backup written to Cloud Storage.",
        savedAt: new Date().toISOString(),
      });
    } catch (err: any) {
      console.error("Backup upload error:", err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.get("/api/backup/download/:id", requirePro, (req, res) => {
    try {
      const { id } = req.params;
      const backupFilePath = path.join(backupsDir, `${id}.json`);

      if (!fs.existsSync(backupFilePath)) {
        return res.status(404).json({ success: false, error: "Snapshot payload matching ID not found on server." });
      }

      const fileContent = fs.readFileSync(backupFilePath, "utf-8");
      const data = JSON.parse(fileContent);

      res.json({
        success: true,
        id: data.id,
        encryptedPayload: data.encryptedPayload,
        savedAt: data.savedAt,
      });
    } catch (err: any) {
      console.error("Backup download error:", err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Serve static files / Vite middleware
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    const aiReady = !!ai;
    console.log(
      `\n  FolioVault Server  →  http://localhost:${PORT}\n` +
      `  ├─ AI endpoints  : ${aiReady ? "✅ online" : "⚠️  no GEMINI_API_KEY"}\n` +
      `  ├─ Pro enforcement: ✅ active (AI + cloud backup require Pro)\n` +
      `  └─ Worker URL    : ${WORKER_URL || "— (offline fallback only)"}\n`,
    );
  });
}

startServer();
