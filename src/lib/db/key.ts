import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { getActiveKey, isVaultSetup } from '../auth/vault';

/**
 * Encryption-key resolution for the SQLCipher database.
 *
 * Keys are unlocked via the Master Password vault in memory.
 * If DIARY_DB_KEY is set in the environment, it acts as an override.
 */

const KEY_PATH = resolve(process.env.DIARY_KEY_PATH ?? './data/diary.key');

export function getDatabaseKey(): string {
  const fromEnv = process.env.DIARY_DB_KEY?.trim();
  if (fromEnv) return fromEnv;

  const activeKey = getActiveKey();
  if (activeKey) return activeKey;

  // Fallback for initial startup before vault migration
  if (!isVaultSetup() && existsSync(KEY_PATH)) {
    try {
      return readFileSync(KEY_PATH, 'utf8').trim();
    } catch {
      /* ignore */
    }
  }

  throw new Error('Database is locked. Master password required.');
}

