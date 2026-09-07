import { getProvider } from '../ai';
import { getSettings } from '../settings/settings';
import { getEntry } from './entries';
import { saveAnalysis } from './analysis';
import type { EntryAnalysis } from '@/types';

/**
 * Run AI analysis for an entry and persist it separately from the entry text.
 * Returns null if analysis is disabled or the entry doesn't exist.
 * The entry content is passed read-only; it is never modified here.
 */
export async function analyzeEntry(entryId: string): Promise<EntryAnalysis | null> {
  if (!getSettings().analysisEnabled) return null;
  const entry = getEntry(entryId);
  if (!entry || entry.content.trim().length === 0) return null;

  const provider = getProvider();
  const result = await provider.analyzeEntry(entry.content);
  return saveAnalysis(entryId, result);
}
