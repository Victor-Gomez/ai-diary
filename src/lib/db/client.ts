import Database from 'better-sqlite3-multiple-ciphers';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { applySchema } from './schema';
import { getDatabaseKey } from './key';

/**
 * Single shared, encrypted SQLite connection for the whole server process.
 *
 * Persistence uses SQLCipher (via better-sqlite3-multiple-ciphers) so the diary
 * is fully encrypted at rest — including the full-text search index. The binding
 * ships prebuilt N-API binaries, so no native compilation is required.
 *
 * The DB path is configurable via DIARY_DB_PATH so a Tauri build can point it at
 * the platform's app-data directory later without code changes.
 */

const DB_PATH = resolve(process.env.DIARY_DB_PATH ?? './data/diary.db');

export function getDbPath(): string {
  return DB_PATH;
}

let db: Database | null = null;

export function getDb(): Database {
  if (db) return db;
  mkdirSync(dirname(DB_PATH), { recursive: true });

  const conn = new Database(DB_PATH);
  // Order matters: choose cipher, then supply the key, before any other access.
  conn.pragma("cipher='sqlcipher'");
  conn.pragma(`key='${getDatabaseKey().replace(/'/g, "''")}'`);
  // Fail fast with a clear message if the key is wrong / file is corrupt.
  conn.pragma('journal_mode = WAL');
  conn.pragma('foreign_keys = ON');

  applySchema(conn);
  db = conn;
  return db;
}

export function closeDb(): void {
  if (db) {
    try {
      db.pragma('wal_checkpoint(TRUNCATE)');
      db.close();
    } catch {
      /* ignore */
    } finally {
      db = null;
    }
  }
}

