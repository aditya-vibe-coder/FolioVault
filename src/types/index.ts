export type AssetClass = 'equity' | 'debt' | 'gold' | 'real_estate' | 'cash' | 'alternative';

export type HoldingType =
  | 'mf'            // Mutual Fund
  | 'stock'         // Indian listed stock (NSE/BSE)
  | 'etf'           // Exchange Traded Fund
  | 'ppf'           // Public Provident Fund
  | 'nps'           // National Pension System
  | 'fd'            // Fixed Deposit
  | 'sgb'           // Sovereign Gold Bond
  | 'gold_physical' // Physical gold / gold coins
  | 'us_stock'      // US listed stock (manual INR entry)
  | 'other';        // Any other asset

export type TransactionType =
  | 'buy'
  | 'sell'
  | 'dividend'
  | 'bonus'
  | 'sip'
  | 'redeem'
  | 'switch_in'
  | 'switch_out'
  | 'interest';

export interface Portfolio {
  id: string;
  name: string;
  description?: string;
  createdAt: Date;
  isDefault: boolean;
  color?: string; // hex color for UI differentiation
}

export interface Holding {
  id: string;
  portfolioId: string;
  name: string;
  type: HoldingType;
  assetClass: AssetClass;
  symbol?: string;         // MF scheme code (e.g. "119598") or NSE ticker (e.g. "RELIANCE")
  isin?: string;
  folioNumber?: string;
  category?: string;       // "Large Cap", "ELSS", "Flexi Cap", "Bluechip"
  subCategory?: string;    // "Direct Growth", "Regular Growth"
  exchange?: 'NSE' | 'BSE';
  manualCurrentPrice?: number;  // For PPF/NPS/FD/physical gold
  manualCurrentDate?: Date;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
  isActive: boolean;       // false = fully exited
}

export interface Transaction {
  id: string;
  holdingId: string;
  portfolioId: string;     // Denormalized for fast queries
  date: Date;
  type: TransactionType;
  units?: number;
  price: number;           // Price per unit/NAV at time of transaction
  amount: number;          // Total amount in INR
  charges?: number;        // STT, brokerage, other charges
  notes?: string;
  importSource?: 'manual' | 'zerodha_csv' | 'template_csv' | 'cas_pdf';
  createdAt: Date;
}

export interface PriceCache {
  symbol: string;
  currentPrice: number;
  previousDayPrice?: number;
  lastUpdated: Date;
  ttlMinutes: number;
}

export interface AppSettings {
  theme: 'light' | 'dark' | 'system';
  defaultPortfolioId?: string;
  benchmarkXirr: number;     // Default 7.0 (FD rate for comparison)
  currency: 'INR';
  isPro: boolean;
  licenseKey?: string;
  licenseExpiry?: string;    // ISO string
  onboardingCompleted: boolean;
  lastLicenseCheck?: string; // ISO string
  /**
   * Optional user-supplied Gemini API key.  When present, the client sends
   * it on every AI request as `X-Gemini-Key-Override`, and the server uses
   * it instead of the server-side `GEMINI_API_KEY` env var.  Stored only
   * in IndexedDB + localStorage — never transmitted to the worker or any
   * third party.  Leave undefined to fall back to the server default.
   */
  geminiKey?: string;
  /**
   * Optional Gemini model override.  Sent as `X-Gemini-Model-Override`.
   * Useful for users with access to Gemini 3.5 / Pro tiers.
   */
  geminiModel?: string;
}

// ─── Computed types (never stored in DB) ──────────────────────────────────────

export interface HoldingAggregates {
  totalInvested: number;
  totalRedeemed: number;
  currentUnits: number;
  avgBuyPrice: number;
  transactionCount: number;
}

export interface HoldingWithMetrics extends Holding {
  aggregates: HoldingAggregates;
  currentPrice: number | null;
  currentValue: number;
  absoluteGain: number;
  absoluteGainPercent: number;
  xirr: number | null;
  dayChange?: number;
  dayChangePercent?: number;
  transactions: Transaction[];
}

export interface PortfolioMetrics {
  totalInvested: number;
  currentValue: number;
  absoluteGain: number;
  absoluteGainPercent: number;
  overallXirr: number | null;
  assetAllocation: Record<AssetClass, number>;
  dayChange: number;
  dayChangePercent: number;
}

export interface LicenseVerificationResult {
  isValid: boolean;
  isPro: boolean;
  expiresAt: Date | null;
  daysRemaining: number | null;
  error?: string;
  source: 'server' | 'cache' | 'none';
}
