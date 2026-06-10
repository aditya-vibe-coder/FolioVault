/**
 * Extra data models for FolioVault Pro features.
 */
import type { AssetClass, HoldingType } from '../types';

export type InsuranceType =
  | 'term_life'
  | 'health'
  | 'motor'
  | 'ulip'
  | 'endowment'
  | 'other';

export interface InsurancePolicy {
  id: string;
  portfolioId: string;
  type: InsuranceType;
  provider: string;          // e.g. "HDFC Life"
  policyName: string;
  policyNumber?: string;
  premiumAnnual: number;     // ₹/year
  sumAssured: number;        // ₹ cover
  startDate: Date;
  endDate?: Date;            // maturity
  nominee?: string;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export type LoanType =
  | 'home'
  | 'personal'
  | 'car'
  | 'education'
  | 'business'
  | 'gold'
  | 'credit_card'
  | 'other';

export interface Loan {
  id: string;
  portfolioId: string;
  type: LoanType;
  lender: string;            // "HDFC Bank"
  principal: number;         // original loan ₹
  outstandingPrincipal: number; // current outstanding
  interestRate: number;      // % p.a.
  tenureMonths: number;      // total
  emiAmount: number;         // ₹/month
  startDate: Date;
  endDate?: Date;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface FamilyMember {
  id: string;
  name: string;
  relation: 'self' | 'spouse' | 'parent' | 'child' | 'sibling' | 'other';
  dateOfBirth?: Date;
  notes?: string;
  createdAt: Date;
}

/**
 * Free-tier cap. Used to gate UI elements without hitting the Pro gate.
 */
export const FREE_HOLDING_LIMIT = 10;

/**
 * Asset class colour palette used by allocation charts.
 */
export const ASSET_CLASS_COLORS: Record<AssetClass, string> = {
  equity:       '#10B981', // emerald
  debt:         '#0EA5E9', // sky
  gold:         '#F59E0B', // amber
  real_estate:  '#8B5CF6', // violet
  cash:         '#64748B', // slate
  alternative:  '#EC4899', // pink
};

export const HOLDING_TYPE_COLORS: Record<HoldingType, string> = {
  mf:            '#10B981',
  stock:         '#0EA5E9',
  etf:           '#06B6D4',
  ppf:           '#A855F7',
  nps:           '#6366F1',
  fd:            '#F59E0B',
  sgb:           '#EAB308',
  gold_physical: '#D97706',
  us_stock:      '#EC4899',
  other:         '#64748B',
};
