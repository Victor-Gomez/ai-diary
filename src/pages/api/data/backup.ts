import type { APIRoute } from 'astro';
import { readFileSync, existsSync } from 'node:fs';
import { getDb, getDbPath } from '@/lib/db/client';
import { serverError } from '@/lib/api';

export const prerender = false;

/**
 * Download a raw copy of the encrypted SQLite database file.
 * The file stays encrypted; restoring it requires the same key (data/diary.key
 * or DIARY_DB_KEY). We checkpoint the WAL first so the .db is self-contained.
 */
export const GET: APIRoute = () => {
  const path = getDbPath();
  try {
    getDb().pragma('wal_checkpoint(TRUNCATE)');
    if (!existsSync(path)) return serverError('Database file not found');
    const bytes = readFileSync(path);
    const stamp = new Date().toISOString().slice(0, 10);
    return new Response(new Uint8Array(bytes), {
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="diary-backup-${stamp}.db"`,
      },
    });
  } catch (e) {
    return serverError(`Backup failed: ${(e as Error).message}`);
  }
};
