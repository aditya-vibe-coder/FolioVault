/**
 * Dexie/IndexedDB schema for FolioVault.
 *
 * Tables
 *  • portfolios    — user-defined groupings of holdings
 *  • holdings      — individual assets (MF / stock / PPF / FD / etc.)
 *  • transactions  — buy / sell / SIP / dividend ledger entries
 *  • settings      — single-row key/value app preferences
 *  • insurance     — insurance policies (Pro)
 *  • loans         — outstanding loans / EMIs (Pro)
 *  • familyMembers — sub-profiles under a Pro license
 */
import Dexie, { type Table } from 'dexie';
import type {
  Portfolio,
  Holding,
  Transaction,
  AppSettings,
} from '../types';
import type { InsurancePolicy, Loan, FamilyMember } from '../types/extra';

const DEFAULT_SETTINGS: AppSettings = {
  theme: 'system',
  benchmarkXirr: 7.0,
  currency: 'INR',
  isPro: false,
  onboardingCompleted: false,
};

class FolioVaultDB extends Dexie {
  portfolios!:    Table<Portfolio,    string>;
  holdings!:      Table<Holding,      string>;
  transactions!:  Table<Transaction,  string>;
  settings!:      Table<AppSettings & { id: string }, string>;
  insurance!:     Table<InsurancePolicy, string>;
  loans!:         Table<Loan,         string>;
  familyMembers!: Table<FamilyMember, string>;

  constructor() {
    super('foliovault_v1');
    this.version(1).stores({
      portfolios:    'id, name, isDefault, createdAt',
      holdings:      'id, portfolioId, type, assetClass, symbol, isActive, createdAt',
      transactions:  'id, holdingId, portfolioId, date, type, createdAt',
      settings:      'id',
      insurance:     'id, portfolioId, type, createdAt',
      loans:         'id, portfolioId, type, createdAt',
      familyMembers: 'id, name, createdAt',
    });
  }
}

export const db = new FolioVaultDB();

/* ─── Settings helpers (singleton row) ──────────────────────────────────── */
const SETTINGS_ROW_ID = 'app';

export function getSettings(): AppSettings {
  // Dexie's .get is async but every existing caller treats it as sync.
  // The schema always seeds a default row on first read (see below) so this
  // is safe in practice. We also expose an async `getSettingsAsync`.
  return _settingsCache ?? DEFAULT_SETTINGS;
}

export async function getSettingsAsync(): Promise<AppSettings> {
  const row = await db.settings.get(SETTINGS_ROW_ID);
  return row ?? DEFAULT_SETTINGS;
}

export async function saveSettings(patch: Partial<AppSettings>): Promise<void> {
  const current = (await db.settings.get(SETTINGS_ROW_ID)) ?? {
    id: SETTINGS_ROW_ID,
    ...DEFAULT_SETTINGS,
  };
  const merged = { ...current, ...patch, id: SETTINGS_ROW_ID };
  await db.settings.put(merged);
  _settingsCache = merged;
  return;
}

// Module-level cache. Populated on first save / first async get.
let _settingsCache: AppSettings | null = null;

(async function seedSettings() {
  const row = await db.settings.get(SETTINGS_ROW_ID);
  if (!row) {
    const seeded = { id: SETTINGS_ROW_ID, ...DEFAULT_SETTINGS };
    await db.settings.put(seeded);
    _settingsCache = seeded;
  } else {
    _settingsCache = row;
  }
})();

/* ─── Seed default portfolio on first ever boot ─────────────────────────── */
(async function seedDefaultPortfolio() {
  const count = await db.portfolios.count();
  if (count === 0) {
    const id = (crypto.randomUUID?.() ?? `pf_${Date.now()}`) as string;
    await db.portfolios.add({
      id,
      name: 'My Portfolio',
      description: 'Default portfolio',
      isDefault: true,
      color: '#2563EB',
      createdAt: new Date(),
    });
    _settingsCache && (_settingsCache = { ..._settingsCache, defaultPortfolioId: id });
    await db.settings.put({ ...(_settingsCache ?? DEFAULT_SETTINGS), id: SETTINGS_ROW_ID });
  }
})();

/* ─── Helpers for new CRUD operations ───────────────────────────────────── */

export async function getDefaultPortfolioId(): Promise<string> {
  const settings = await getSettingsAsync();
  if (settings.defaultPortfolioId) {
    const exists = await db.portfolios.get(settings.defaultPortfolioId);
    if (exists) return exists.id;
  }
  const defs = await db.portfolios.filter((p) => p.isDefault).toArray();
  if (defs.length > 0) return defs[0].id;
  const all = await db.portfolios.toArray();
  if (all.length > 0) return all[0].id;
  return '';
}

export async function clearAllData(): Promise<void> {
  // Use a single rw transaction over all tables.  Dexie's overload limits
  // explicit table-arg form to 5 tables, so we use a callback that touches
  // each store and rely on the runtime support for any number of stores.
  await (db as any).transaction(
    'rw',
    [db.portfolios, db.holdings, db.transactions, db.insurance, db.loans, db.familyMembers],
    async () => {
      await Promise.all([
        db.portfolios.clear(),
        db.holdings.clear(),
        db.transactions.clear(),
        db.insurance.clear(),
        db.loans.clear(),
        db.familyMembers.clear(),
      ]);
    },
  );
}

export async function exportRawData(): Promise<{
  portfolios: Portfolio[];
  holdings: Holding[];
  transactions: Transaction[];
  insurance: InsurancePolicy[];
  loans: Loan[];
  familyMembers: FamilyMember[];
  settings: AppSettings;
}> {
  const [portfolios, holdings, transactions, insurance, loans, familyMembers, settings] =
    await Promise.all([
      db.portfolios.toArray(),
      db.holdings.toArray(),
      db.transactions.toArray(),
      db.insurance.toArray(),
      db.loans.toArray(),
      db.familyMembers.toArray(),
      getSettingsAsync(),
    ]);
  return { portfolios, holdings, transactions, insurance, loans, familyMembers, settings };
}

export async function importRawData(payload: {
  portfolios?: Portfolio[];
  holdings?: Holding[];
  transactions?: Transaction[];
  insurance?: InsurancePolicy[];
  loans?: Loan[];
  familyMembers?: FamilyMember[];
  settings?: Partial<AppSettings>;
}): Promise<void> {
  await clearAllData();
  await (db as any).transaction(
    'rw',
    [db.portfolios, db.holdings, db.transactions, db.insurance, db.loans, db.familyMembers, db.settings],
    async () => {
      if (payload.portfolios?.length)    await db.portfolios.bulkAdd(payload.portfolios);
      if (payload.holdings?.length)      await db.holdings.bulkAdd(payload.holdings);
      if (payload.transactions?.length)  await db.transactions.bulkAdd(payload.transactions);
      if (payload.insurance?.length)     await db.insurance.bulkAdd(payload.insurance);
      if (payload.loans?.length)         await db.loans.bulkAdd(payload.loans);
      if (payload.familyMembers?.length) await db.familyMembers.bulkAdd(payload.familyMembers);
      if (payload.settings) {
        const merged = { ...DEFAULT_SETTINGS, ...payload.settings };
        await db.settings.put({ ...merged, id: SETTINGS_ROW_ID });
        _settingsCache = merged as AppSettings;
      }
    },
  );
}
