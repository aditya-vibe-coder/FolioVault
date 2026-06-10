import { db, getSettings, saveSettings } from './db';

export async function exportEncryptedBackup(password: string): Promise<void> {
  const [portfolios, holdings, transactions] = await Promise.all([
    db.portfolios.toArray(),
    db.holdings.toArray(),
    db.transactions.toArray(),
  ]);

  const payload = JSON.stringify({
    version: 1,
    exportedAt: new Date().toISOString(),
    portfolios, holdings, transactions,
    settings: getSettings(),
  });

  const enc  = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv   = crypto.getRandomValues(new Uint8Array(12));

  const keyMat = await crypto.subtle.importKey(
    'raw', enc.encode(password), 'PBKDF2', false, ['deriveKey'],
  );
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 100_000, hash: 'SHA-256' },
    keyMat,
    { name: 'AES-GCM', length: 256 },
    false, ['encrypt'],
  );

  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv }, key, enc.encode(payload),
  );

  const output = JSON.stringify({
    v:    1,
    salt: Array.from(salt),
    iv:   Array.from(iv),
    data: Array.from(new Uint8Array(ciphertext)),
  });

  const blob = new Blob([output], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `foliovault-backup-${new Date().toISOString().split('T')[0]}.fvb`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function importEncryptedBackup(
  file: File,
  password: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const text   = await file.text();
    const { v, salt, iv, data } = JSON.parse(text);
    if (v !== 1) return { success: false, error: 'Unsupported backup version.' };

    const enc    = new TextEncoder();
    const keyMat = await crypto.subtle.importKey(
      'raw', enc.encode(password), 'PBKDF2', false, ['deriveKey'],
    );
    const key = await crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: new Uint8Array(salt), iterations: 100_000, hash: 'SHA-256' },
      keyMat,
      { name: 'AES-GCM', length: 256 },
      false, ['decrypt'],
    );

    let plaintext: string;
    try {
      const dec = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: new Uint8Array(iv) }, key, new Uint8Array(data),
      );
      plaintext = new TextDecoder().decode(dec);
    } catch {
      return { success: false, error: 'Wrong password or corrupted backup file.' };
    }

    const { portfolios, holdings, transactions, settings } = JSON.parse(plaintext);

    // Clear existing data, then import
    await db.transaction('rw', db.portfolios, db.holdings, db.transactions, async () => {
      await db.portfolios.clear();
      await db.holdings.clear();
      await db.transactions.clear();

      // Re-hydrate Date objects (JSON.stringify converts them to strings)
      await db.portfolios.bulkAdd(portfolios.map((p: any) => ({
        ...p, createdAt: new Date(p.createdAt),
      })));
      await db.holdings.bulkAdd(holdings.map((h: any) => ({
        ...h,
        createdAt:  new Date(h.createdAt),
        updatedAt:  new Date(h.updatedAt),
        manualCurrentDate: h.manualCurrentDate ? new Date(h.manualCurrentDate) : undefined,
      })));
      await db.transactions.bulkAdd(transactions.map((t: any) => ({
        ...t,
        date:      new Date(t.date),
        createdAt: new Date(t.createdAt),
      })));
    });

    if (settings) saveSettings(settings);
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e?.message ?? 'Import failed.' };
  }
}

export async function getEncryptedBackupString(password: string): Promise<string> {
  const [portfolios, holdings, transactions] = await Promise.all([
    db.portfolios.toArray(),
    db.holdings.toArray(),
    db.transactions.toArray(),
  ]);

  const payload = JSON.stringify({
    version: 1,
    exportedAt: new Date().toISOString(),
    portfolios, holdings, transactions,
    settings: getSettings(),
  });

  const enc  = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv   = crypto.getRandomValues(new Uint8Array(12));

  const keyMat = await crypto.subtle.importKey(
    'raw', enc.encode(password), 'PBKDF2', false, ['deriveKey'],
  );
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 100_000, hash: 'SHA-256' },
    keyMat,
    { name: 'AES-GCM', length: 256 },
    false, ['encrypt'],
  );

  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv }, key, enc.encode(payload),
  );

  const output = JSON.stringify({
    v:    1,
    salt: Array.from(salt),
    iv:   Array.from(iv),
    data: Array.from(new Uint8Array(ciphertext)),
  });

  return output;
}

export async function decryptBackupString(
  backupJson: string,
  password: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const { v, salt, iv, data } = JSON.parse(backupJson);
    if (v !== 1) return { success: false, error: 'Unsupported backup version.' };

    const enc    = new TextEncoder();
    const keyMat = await crypto.subtle.importKey(
      'raw', enc.encode(password), 'PBKDF2', false, ['deriveKey'],
    );
    const key = await crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: new Uint8Array(salt), iterations: 100_000, hash: 'SHA-256' },
      keyMat,
      { name: 'AES-GCM', length: 256 },
      false, ['decrypt'],
    );

    let plaintext: string;
    try {
      const dec = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: new Uint8Array(iv) }, key, new Uint8Array(data),
      );
      plaintext = new TextDecoder().decode(dec);
    } catch {
      return { success: false, error: 'Wrong password or corrupted backup file.' };
    }

    const { portfolios, holdings, transactions, settings } = JSON.parse(plaintext);

    await db.transaction('rw', db.portfolios, db.holdings, db.transactions, async () => {
      await db.portfolios.clear();
      await db.holdings.clear();
      await db.transactions.clear();

      await db.portfolios.bulkAdd(portfolios.map((p: any) => ({
        ...p, createdAt: new Date(p.createdAt),
      })));
      await db.holdings.bulkAdd(holdings.map((h: any) => ({
        ...h,
        createdAt:  new Date(h.createdAt),
        updatedAt:  new Date(h.updatedAt),
        manualCurrentDate: h.manualCurrentDate ? new Date(h.manualCurrentDate) : undefined,
      })));
      await db.transactions.bulkAdd(transactions.map((t: any) => ({
        ...t,
        date:      new Date(t.date),
        createdAt: new Date(t.createdAt),
      })));
    });

    if (settings) saveSettings(settings);
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e?.message ?? 'Import failed.' };
  }
}
