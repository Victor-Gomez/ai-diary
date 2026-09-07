import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

/**
 * Encryption-key resolution for the SQLCipher database.
 *
 * Security model (documented deliberately — see Settings > Privacy):
 *  - The diary DB is fully encrypted at rest with SQLCipher (AES-256).
 *  - There is NO account/authentication. To stay frictionless while still
 *    encrypting at rest, the key is a locally-stored random secret:
 *      1. If DIARY_DB_KEY is set, it is used as the passphrase (lets a user
 *         supply their own passphrase, e.g. from an OS keychain wrapper).
 *      2. Otherwise a 32-byte random key is generated once and stored in a
 *         key file (DIARY_KEY_PATH, default ./data/diary.key), kept OUT of the
 *         DB file and out of version control.
 *
 * This protects the diary if the .db file is copied elsewhere (cloud sync,
 * backup, shared drive) without the key. In a future Tauri build this module
 * is the single place to swap in the OS keychain / Stronghold for key storage.
 */

const KEY_PATH = resolve(process.env.DIARY_KEY_PATH ?? './data/diary.key');

function loadOrCreateKeyFile(): string {
  if (existsSync(KEY_PATH)) {
    return readFileSync(KEY_PATH, 'utf8').trim();
  }
  mkdirSync(dirname(KEY_PATH), { recursive: true });
  const key = randomBytes(32).toString('base64');
  writeFileSync(KEY_PATH, key, { encoding: 'utf8', mode: 0o600 });
  try {
    chmodSync(KEY_PATH, 0o600); // best-effort on Windows
  } catch {
    /* chmod is a no-op on some platforms; ignore */
  }
  return key;
}

export function getDatabaseKey(): string {
  const fromEnv = process.env.DIARY_DB_KEY?.trim();
  if (fromEnv) return fromEnv;
  return loadOrCreateKeyFile();
}
