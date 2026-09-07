import { getDb } from '../db/client';
import type { AppSettings, AIProviderKind } from '@/types';

/** Defaults chosen for a private, offline-first first-run experience. */
export const DEFAULT_SETTINGS: AppSettings = {
  providerKind: 'mock',
  endpoint: 'http://localhost:11434/v1',
  model: '',
  apiKey: '',
  analysisEnabled: true,
  chatContextEntries: 6,
};

const VALID_KINDS: AIProviderKind[] = ['mock', 'local', 'gemini-nano', 'openai-compatible'];

export function getSettings(): AppSettings {
  const rows = getDb()
    .prepare<{ key: string; value: string }>(`SELECT key, value FROM settings`)
    .all();
  const map = new Map(rows.map((r) => [r.key, r.value]));

  const kind = map.get('providerKind');
  return {
    providerKind: VALID_KINDS.includes(kind as AIProviderKind)
      ? (kind as AIProviderKind)
      : DEFAULT_SETTINGS.providerKind,
    endpoint: map.get('endpoint') ?? DEFAULT_SETTINGS.endpoint,
    model: map.get('model') ?? DEFAULT_SETTINGS.model,
    apiKey: map.get('apiKey') ?? DEFAULT_SETTINGS.apiKey,
    analysisEnabled: map.has('analysisEnabled')
      ? map.get('analysisEnabled') === 'true'
      : DEFAULT_SETTINGS.analysisEnabled,
    chatContextEntries: map.has('chatContextEntries')
      ? Number(map.get('chatContextEntries')) || DEFAULT_SETTINGS.chatContextEntries
      : DEFAULT_SETTINGS.chatContextEntries,
  };
}

export function updateSettings(patch: Partial<AppSettings>): AppSettings {
  const db = getDb();
  const stmt = db.prepare(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  );
  const write = db.transaction((entries: [string, string][]) => {
    for (const [k, v] of entries) stmt.run(k, v);
  });

  const entries: [string, string][] = [];
  if (patch.providerKind !== undefined) entries.push(['providerKind', patch.providerKind]);
  if (patch.endpoint !== undefined) entries.push(['endpoint', patch.endpoint]);
  if (patch.model !== undefined) entries.push(['model', patch.model]);
  if (patch.apiKey !== undefined) entries.push(['apiKey', patch.apiKey]);
  if (patch.analysisEnabled !== undefined)
    entries.push(['analysisEnabled', String(patch.analysisEnabled)]);
  if (patch.chatContextEntries !== undefined)
    entries.push(['chatContextEntries', String(patch.chatContextEntries)]);

  if (entries.length) write(entries);
  return getSettings();
}
