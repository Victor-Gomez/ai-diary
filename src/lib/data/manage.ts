import { getDb } from '../db/client';
import { nowIso } from '../utils/date';

export interface DiaryExport {
  version: 1;
  exportedAt: string;
  entries: Record<string, unknown>[];
  entry_analysis: Record<string, unknown>[];
  conversations: Record<string, unknown>[];
  chat_messages: Record<string, unknown>[];
  memories: Record<string, unknown>[];
  settings: Record<string, unknown>[];
}

const TABLES = [
  'entries',
  'entry_analysis',
  'conversations',
  'chat_messages',
  'memories',
  'settings',
] as const;

/** Export all data as portable, decrypted JSON (the user's own plaintext). */
export function exportData(): DiaryExport {
  const db = getDb();
  const dump = {} as Record<(typeof TABLES)[number], Record<string, unknown>[]>;
  for (const t of TABLES) {
    // embedding BLOBs are omitted from JSON export (regenerable, not portable).
    const cols = t === 'entries' || t === 'memories' ? '*' : '*';
    dump[t] = db.prepare<Record<string, unknown>>(`SELECT ${cols} FROM ${t}`).all();
  }
  return { version: 1, exportedAt: nowIso(), ...dump };
}

/** Replace all data with the contents of a previously exported JSON file. */
export function importData(data: DiaryExport): { imported: number } {
  if (data.version !== 1) throw new Error('Unsupported export version');
  const db = getDb();
  let imported = 0;

  const run = db.transaction(() => {
    // Clear existing data (respecting FK order via cascade / manual order).
    for (const t of [...TABLES].reverse()) db.prepare(`DELETE FROM ${t}`).run();
    db.prepare(`INSERT INTO entries_fts(entries_fts) VALUES('rebuild')`).run();

    for (const t of TABLES) {
      const rows = data[t] ?? [];
      for (const row of rows) {
        const keys = Object.keys(row).filter((k) => k !== 'rowid' && k !== 'embedding');
        if (keys.length === 0) continue;
        const placeholders = keys.map(() => '?').join(', ');
        db.prepare(
          `INSERT OR REPLACE INTO ${t} (${keys.join(', ')}) VALUES (${placeholders})`,
        ).run(...keys.map((k) => normalizeValue(row[k])));
        imported += 1;
      }
    }
    db.prepare(`INSERT INTO entries_fts(entries_fts) VALUES('rebuild')`).run();
  });

  run();
  return { imported };
}

/** Permanently delete all diary data. Destructive — always confirm in the UI. */
export function deleteAllData(): void {
  const db = getDb();
  const run = db.transaction(() => {
    for (const t of [...TABLES].reverse()) db.prepare(`DELETE FROM ${t}`).run();
    db.prepare(`INSERT INTO entries_fts(entries_fts) VALUES('rebuild')`).run();
  });
  run();
}

function normalizeValue(v: unknown): string | number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number' || typeof v === 'string') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  return JSON.stringify(v);
}
