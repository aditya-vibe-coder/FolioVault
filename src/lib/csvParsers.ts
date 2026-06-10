/**
 * CSV parsers for the Import center.
 *
 *  • Zerodha Console "tradebook" CSV  (the only column ordering supported)
 *  • FolioVault generic template CSV  (downloadable from the import page)
 */
import Papa from 'papaparse';
import { uuid } from './formatters';
import type { TransactionType } from '../types';

/* ─── Zerodha tradebook ─────────────────────────────────────────────────── */

export interface ParsedRow {
  id: string;                 // local row id (uuid)
  symbol: string;
  isin?: string;
  exchange?: 'NSE' | 'BSE';
  date: Date;
  type: TransactionType;
  units: number;
  price: number;
  amount: number;
}

interface ZerodhaParseResult {
  rows: ParsedRow[];
  errors: string[];
  totalSkipped: number;
}

/**
 * The Zerodha Console tradebook CSV typically has these headers:
 *   symbol, isin, trade_date, exchange, segment, series, trade_type,
 *   quantity, price, turnover
 *
 * We accept any subset, but at minimum we need symbol, trade_date,
 * quantity, price, and trade_type.
 */
function parseFlexibleDate(raw: any): Date | null {
  if (!raw) return null;
  if (raw instanceof Date) return isNaN(raw.getTime()) ? null : raw;
  const s = String(raw).trim();
  if (!s) return null;

  // Try YYYY-MM-DD first
  if (/^\d{4}-\d{1,2}-\d{1,2}/.test(s)) {
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }
  // DD-MM-YYYY or DD/MM/YYYY
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if (m) {
    const dd = parseInt(m[1], 10);
    const mm = parseInt(m[2], 10);
    let yyyy = parseInt(m[3], 10);
    if (yyyy < 100) yyyy += 2000;
    // Heuristic: if first part > 12, it must be DD-MM
    if (dd > 12) {
      return new Date(yyyy, mm - 1, dd);
    }
    // Otherwise assume DD-MM-YYYY (Indian convention)
    return new Date(yyyy, mm - 1, dd);
  }
  const fallback = new Date(s);
  return isNaN(fallback.getTime()) ? null : fallback;
}

function normaliseTradeType(t: string): TransactionType | null {
  const up = t.trim().toUpperCase();
  if (up === 'BUY' || up === 'B')  return 'buy';
  if (up === 'SELL' || up === 'S') return 'sell';
  return null;
}

export function parseZerodhaCSV(content: string): ZerodhaParseResult {
  const result: ZerodhaParseResult = { rows: [], errors: [], totalSkipped: 0 };

  const parsed = Papa.parse(content.trim(), {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (h) => h.trim().toLowerCase().replace(/[\s_-]+/g, '_'),
  });

  if (parsed.errors.length > 0) {
    parsed.errors.forEach((e) => result.errors.push(`CSV parse: ${e.message}`));
  }

  const rows = parsed.data as Record<string, any>[];
  if (rows.length === 0) {
    result.errors.push('No rows found in CSV.');
    return result;
  }

  // Detect column names
  const sample = rows[0];
  const symbolKey  = ['symbol', 'tradingsymbol', 'scrip', 'ticker'].find((k) => sample[k] !== undefined);
  const dateKey    = ['trade_date', 'date', 'tradedate', 'transaction_date'].find((k) => sample[k] !== undefined);
  const typeKey    = ['trade_type', 'type', 'transaction_type', 'side'].find((k) => sample[k] !== undefined);
  const qtyKey     = ['quantity', 'qty', 'units', 'shares'].find((k) => sample[k] !== undefined);
  const priceKey   = ['price', 'rate', 'trade_price', 'avg_price'].find((k) => sample[k] !== undefined);
  const turnoverKey= ['turnover', 'amount', 'total', 'value'].find((k) => sample[k] !== undefined);
  const isinKey    = ['isin'].find((k) => sample[k] !== undefined);
  const exchKey    = ['exchange'].find((k) => sample[k] !== undefined);

  if (!symbolKey || !dateKey || !typeKey || !qtyKey || !priceKey) {
    result.errors.push(
      'Required columns missing. Expected at least: symbol, trade_date, trade_type, quantity, price.',
    );
    return result;
  }

  rows.forEach((row, idx) => {
    try {
      const symbol = String(row[symbolKey] ?? '').trim();
      if (!symbol) {
        result.totalSkipped++;
        result.errors.push(`Row ${idx + 2}: missing symbol`);
        return;
      }
      const date = parseFlexibleDate(row[dateKey]);
      if (!date) {
        result.totalSkipped++;
        result.errors.push(`Row ${idx + 2}: unrecognised date "${row[dateKey]}"`);
        return;
      }
      const type = normaliseTradeType(String(row[typeKey] ?? ''));
      if (!type) {
        result.totalSkipped++;
        result.errors.push(`Row ${idx + 2}: invalid trade type "${row[typeKey]}"`);
        return;
      }
      const units = Number(row[qtyKey]);
      const price = Number(row[priceKey]);
      if (!isFinite(units) || units <= 0) {
        result.totalSkipped++;
        result.errors.push(`Row ${idx + 2}: invalid quantity "${row[qtyKey]}"`);
        return;
      }
      if (!isFinite(price) || price < 0) {
        result.totalSkipped++;
        result.errors.push(`Row ${idx + 2}: invalid price "${row[priceKey]}"`);
        return;
      }
      const turnover = turnoverKey ? Number(row[turnoverKey]) : units * price;
      const amount = isFinite(turnover) ? turnover : units * price;
      const exchange = (exchKey ? String(row[exchKey]).toUpperCase() : 'NSE');
      const isin = isinKey && row[isinKey] ? String(row[isinKey]) : undefined;

      result.rows.push({
        id: uuid(),
        symbol,
        isin,
        exchange: exchange === 'BSE' ? 'BSE' : 'NSE',
        date,
        type,
        units,
        price,
        amount,
      });
    } catch (err: any) {
      result.totalSkipped++;
      result.errors.push(`Row ${idx + 2}: ${err.message}`);
    }
  });

  return result;
}

/* ─── FolioVault template CSV ───────────────────────────────────────────── */

export interface TemplateRow {
  id: string;
  holdingName: string;
  holdingType: import('../types').HoldingType;
  assetClass: import('../types').AssetClass;
  symbol?: string;
  transactionType: TransactionType;
  date: Date;
  units: number;
  pricePerUnit: number;
  amount: number;
  notes?: string;
}

const TEMPLATE_COLUMNS = [
  'holding_name',
  'holding_type',
  'asset_class',
  'symbol',
  'transaction_type',
  'date',
  'units',
  'price_per_unit',
  'amount',
  'notes',
];

const VALID_HOLDING_TYPES: import('../types').HoldingType[] = [
  'mf', 'stock', 'etf', 'ppf', 'nps', 'fd', 'sgb', 'gold_physical', 'us_stock', 'other',
];
const VALID_ASSET_CLASSES: import('../types').AssetClass[] = [
  'equity', 'debt', 'gold', 'real_estate', 'cash', 'alternative',
];
const VALID_TX_TYPES: TransactionType[] = [
  'buy', 'sell', 'dividend', 'bonus', 'sip', 'redeem', 'switch_in', 'switch_out', 'interest',
];

export function parseTemplateCSV(content: string): ZerodhaParseResult & { templateRows: TemplateRow[] } {
  const result: ZerodhaParseResult & { templateRows: TemplateRow[] } = {
    rows: [],
    templateRows: [],
    errors: [],
    totalSkipped: 0,
  };

  const parsed = Papa.parse(content.trim(), {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (h) => h.trim().toLowerCase().replace(/[\s_-]+/g, '_'),
  });

  if (parsed.errors.length > 0) {
    parsed.errors.forEach((e) => result.errors.push(`CSV parse: ${e.message}`));
  }

  const rows = parsed.data as Record<string, any>[];
  if (rows.length === 0) {
    result.errors.push('No rows found in CSV.');
    return result;
  }

  rows.forEach((row, idx) => {
    try {
      const holdingName = String(row['holding_name'] ?? '').trim();
      if (!holdingName) {
        result.totalSkipped++;
        result.errors.push(`Row ${idx + 2}: holding_name is required`);
        return;
      }
      const holdingTypeRaw = String(row['holding_type'] ?? '').trim().toLowerCase();
      if (!VALID_HOLDING_TYPES.includes(holdingTypeRaw as any)) {
        result.totalSkipped++;
        result.errors.push(`Row ${idx + 2}: invalid holding_type "${holdingTypeRaw}"`);
        return;
      }
      const assetClassRaw = String(row['asset_class'] ?? '').trim().toLowerCase();
      if (!VALID_ASSET_CLASSES.includes(assetClassRaw as any)) {
        result.totalSkipped++;
        result.errors.push(`Row ${idx + 2}: invalid asset_class "${assetClassRaw}"`);
        return;
      }
      const txTypeRaw = String(row['transaction_type'] ?? '').trim().toLowerCase();
      if (!VALID_TX_TYPES.includes(txTypeRaw as any)) {
        result.totalSkipped++;
        result.errors.push(`Row ${idx + 2}: invalid transaction_type "${txTypeRaw}"`);
        return;
      }
      const date = parseFlexibleDate(row['date']);
      if (!date) {
        result.totalSkipped++;
        result.errors.push(`Row ${idx + 2}: invalid date "${row['date']}"`);
        return;
      }
      const units = Number(row['units']);
      const price = Number(row['price_per_unit']);
      const amount = Number(row['amount']);
      if (!isFinite(units) || !isFinite(price) || !isFinite(amount) || units < 0 || price < 0) {
        result.totalSkipped++;
        result.errors.push(`Row ${idx + 2}: units, price_per_unit, amount must be valid numbers`);
        return;
      }

      result.templateRows.push({
        id: uuid(),
        holdingName,
        holdingType: holdingTypeRaw as any,
        assetClass:  assetClassRaw as any,
        symbol:      row['symbol'] ? String(row['symbol']).trim() : undefined,
        transactionType: txTypeRaw as TransactionType,
        date,
        units,
        pricePerUnit: price,
        amount,
        notes: row['notes'] ? String(row['notes']) : undefined,
      });
    } catch (err: any) {
      result.totalSkipped++;
      result.errors.push(`Row ${idx + 2}: ${err.message}`);
    }
  });

  return result;
}

export function generateTemplateCSV(): string {
  const sample = [
    {
      holding_name:     'Axis Bluechip Fund - Direct Growth',
      holding_type:     'mf',
      asset_class:      'equity',
      symbol:           '125354',
      transaction_type: 'buy',
      date:             '2023-04-15',
      units:            '142.857',
      price_per_unit:   '35.00',
      amount:           '5000.00',
      notes:            'April SIP',
    },
    {
      holding_name:     'HDFC Bank Ltd',
      holding_type:     'stock',
      asset_class:      'equity',
      symbol:           'HDFCBANK',
      transaction_type: 'buy',
      date:             '2024-01-20',
      units:            '10',
      price_per_unit:   '1640.50',
      amount:           '16405.00',
      notes:            '',
    },
    {
      holding_name:     'PPF Account',
      holding_type:     'ppf',
      asset_class:      'debt',
      symbol:           '',
      transaction_type: 'buy',
      date:             '2024-03-31',
      units:            '0',
      price_per_unit:   '0',
      amount:           '150000.00',
      notes:            'FY 2023-24 deposit',
    },
  ];
  return Papa.unparse({ fields: TEMPLATE_COLUMNS, data: sample.map((r) => TEMPLATE_COLUMNS.map((c) => (r as any)[c] ?? '')) });
}
