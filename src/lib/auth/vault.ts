import { randomBytes, pbkdf2Sync, createCipheriv, createDecipheriv } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { closeDb } from '../db/client';

interface VaultEnvelope {
  version: number;
  salt: string;
  iv: string;
  authTag: string;
  ciphertext: string;
  iterations: number;
  algorithm: string;
  createdAt: string;
  updatedAt?: string;
}

const VAULT_PATH = resolve(process.env.DIARY_VAULT_PATH ?? './data/vault.json');
const LEGACY_KEY_PATH = resolve(process.env.DIARY_KEY_PATH ?? './data/diary.key');
const ITERATIONS = 100_000;
const KEY_LENGTH = 32;
const DIGEST = 'sha256';
const SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes inactivity timeout

// In-memory runtime state
let activeDatabaseKey: string | null = null;
const activeSessions = new Map<string, { lastActive: number }>();

function deriveKek(password: string, salt: Buffer): Buffer {
  return pbkdf2Sync(password, salt, ITERATIONS, KEY_LENGTH, DIGEST);
}

function encryptKey(rawKey: string, password: string): VaultEnvelope {
  const salt = randomBytes(32);
  const iv = randomBytes(12);
  const kek = deriveKek(password, salt);

  const cipher = createCipheriv('aes-256-gcm', kek, iv);
  let ciphertext = cipher.update(rawKey, 'utf8', 'hex');
  ciphertext += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');

  return {
    version: 1,
    salt: salt.toString('hex'),
    iv: iv.toString('hex'),
    authTag,
    ciphertext,
    iterations: ITERATIONS,
    algorithm: 'aes-256-gcm',
    createdAt: new Date().toISOString(),
  };
}

function decryptKey(envelope: VaultEnvelope, password: string): string | null {
  try {
    const salt = Buffer.from(envelope.salt, 'hex');
    const iv = Buffer.from(envelope.iv, 'hex');
    const authTag = Buffer.from(envelope.authTag, 'hex');
    const kek = deriveKek(password, salt);

    const decipher = createDecipheriv('aes-256-gcm', kek, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(envelope.ciphertext, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted.trim();
  } catch {
    return null;
  }
}

export function isVaultSetup(): boolean {
  return existsSync(VAULT_PATH);
}

export function hasLegacyKey(): boolean {
  return !isVaultSetup() && existsSync(LEGACY_KEY_PATH);
}

export function getActiveKey(): string | null {
  const envKey = process.env.DIARY_DB_KEY?.trim();
  if (envKey) return envKey;
  return activeDatabaseKey;
}

export function createSession(): string {
  const token = randomBytes(32).toString('hex');
  activeSessions.set(token, { lastActive: Date.now() });
  return token;
}

export function validateSession(token?: string | null): boolean {
  // If DIARY_DB_KEY is explicitly passed in environment, consider vault always unlocked
  if (process.env.DIARY_DB_KEY?.trim()) return true;

  if (!activeDatabaseKey || !token) return false;
  const session = activeSessions.get(token);
  if (!session) return false;

  const now = Date.now();
  if (now - session.lastActive > SESSION_TTL_MS) {
    activeSessions.delete(token);
    if (activeSessions.size === 0) {
      lockVault();
    }
    return false;
  }

  session.lastActive = now;
  return true;
}

export function destroySession(token?: string | null): void {
  if (token) activeSessions.delete(token);
  if (activeSessions.size === 0) {
    lockVault();
  }
}

export function setupVault(password: string): { success: boolean; token?: string; error?: string } {
  if (!password || password.length < 6) {
    return { success: false, error: 'Password must be at least 6 characters long.' };
  }

  let dbKey: string;
  if (existsSync(LEGACY_KEY_PATH)) {
    try {
      dbKey = readFileSync(LEGACY_KEY_PATH, 'utf8').trim();
    } catch {
      dbKey = randomBytes(32).toString('base64');
    }
  } else {
    dbKey = randomBytes(32).toString('base64');
  }

  const envelope = encryptKey(dbKey, password);
  mkdirSync(dirname(VAULT_PATH), { recursive: true });
  writeFileSync(VAULT_PATH, JSON.stringify(envelope, null, 2), { encoding: 'utf8', mode: 0o600 });

  // If legacy key file existed, securely remove it now that it is sealed into vault
  if (existsSync(LEGACY_KEY_PATH)) {
    try {
      unlinkSync(LEGACY_KEY_PATH);
    } catch {
      /* ignore if locked */
    }
  }

  activeDatabaseKey = dbKey;
  const token = createSession();
  return { success: true, token };
}

export function unlockVault(password: string): { success: boolean; token?: string; error?: string } {
  if (!isVaultSetup()) {
    return { success: false, error: 'Vault has not been set up yet.' };
  }

  try {
    const raw = readFileSync(VAULT_PATH, 'utf8');
    const envelope: VaultEnvelope = JSON.parse(raw);
    const dbKey = decryptKey(envelope, password);

    if (!dbKey) {
      return { success: false, error: 'Incorrect master password.' };
    }

    activeDatabaseKey = dbKey;
    const token = createSession();
    return { success: true, token };
  } catch (err) {
    return { success: false, error: 'Could not read vault configuration.' };
  }
}

export function lockVault(): void {
  activeDatabaseKey = null;
  activeSessions.clear();
  closeDb();
}

export function changeMasterPassword(currentPassword: string, newPassword: string): { success: boolean; error?: string } {
  if (!isVaultSetup()) {
    return { success: false, error: 'Vault is not set up.' };
  }
  if (!newPassword || newPassword.length < 6) {
    return { success: false, error: 'New password must be at least 6 characters.' };
  }

  try {
    const raw = readFileSync(VAULT_PATH, 'utf8');
    const envelope: VaultEnvelope = JSON.parse(raw);
    const dbKey = decryptKey(envelope, currentPassword);

    if (!dbKey) {
      return { success: false, error: 'Current password is incorrect.' };
    }

    const newEnvelope = encryptKey(dbKey, newPassword);
    newEnvelope.createdAt = envelope.createdAt;
    newEnvelope.updatedAt = new Date().toISOString();
    writeFileSync(VAULT_PATH, JSON.stringify(newEnvelope, null, 2), { encoding: 'utf8', mode: 0o600 });
    activeDatabaseKey = dbKey;
    return { success: true };
  } catch {
    return { success: false, error: 'Failed to update vault password.' };
  }
}
