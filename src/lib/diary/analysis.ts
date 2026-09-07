import { getDb } from '../db/client';
import { newId } from '../utils/id';
import { nowIso } from '../utils/date';
import type { EntryAnalysis, EntryAnalysisResult } from '@/types';

export interface AnalysisRow {
  id: string;
  entry_id: string;
  summary: string;
  mood: number;
  stress: number;
  energy: number;
  topics: string;
  people: string;
  places: string;
  activities: string;
  important: number;
  created_at: string;
  updated_at: string;
}

function parseList(json: string): string[] {
  try {
    const v: unknown = JSON.parse(json);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export function mapAnalysisRow(row: AnalysisRow): EntryAnalysis {
  return {
    id: row.id,
    entryId: row.entry_id,
    summary: row.summary,
    mood: row.mood,
    stress: row.stress,
    energy: row.energy,
    topics: parseList(row.topics),
    people: parseList(row.people),
    places: parseList(row.places),
    activities: parseList(row.activities),
    important: row.important === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Persist analysis for an entry. Stored in a separate table (never mutating the
 * entry text). Upserts so re-analysing an entry replaces its previous analysis.
 */
export function saveAnalysis(entryId: string, result: EntryAnalysisResult): EntryAnalysis {
  const db = getDb();
  const now = nowIso();
  const existing = db
    .prepare<{ id: string; created_at: string }>(
      `SELECT id, created_at FROM entry_analysis WHERE entry_id = ?`,
    )
    .get(entryId);

  const id = existing?.id ?? newId();
  const createdAt = existing?.created_at ?? now;

  db.prepare(
    `INSERT INTO entry_analysis
       (id, entry_id, summary, mood, stress, energy, topics, people, places,
        activities, important, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(entry_id) DO UPDATE SET
       summary=excluded.summary, mood=excluded.mood, stress=excluded.stress,
       energy=excluded.energy, topics=excluded.topics, people=excluded.people,
       places=excluded.places, activities=excluded.activities,
       important=excluded.important, updated_at=excluded.updated_at`,
  ).run(
    id,
    entryId,
    result.summary,
    result.mood,
    result.stress,
    result.energy,
    JSON.stringify(result.topics),
    JSON.stringify(result.people),
    JSON.stringify(result.places),
    JSON.stringify(result.activities),
    result.important ? 1 : 0,
    createdAt,
    now,
  );

  return {
    id,
    entryId,
    ...result,
    createdAt,
    updatedAt: now,
  };
}

export function getAnalysis(entryId: string): EntryAnalysis | null {
  const row = getDb()
    .prepare<AnalysisRow>(`SELECT * FROM entry_analysis WHERE entry_id = ?`)
    .get(entryId);
  return row ? mapAnalysisRow(row) : null;
}

/** All distinct topics/people across analyses, for search filters. */
export function collectFacets(): { topics: string[]; people: string[] } {
  const rows = getDb()
    .prepare<{ topics: string; people: string }>(
      `SELECT topics, people FROM entry_analysis`,
    )
    .all();
  const topics = new Set<string>();
  const people = new Set<string>();
  for (const r of rows) {
    for (const t of parseList(r.topics)) topics.add(t);
    for (const p of parseList(r.people)) people.add(p);
  }
  return {
    topics: [...topics].sort(),
    people: [...people].sort(),
  };
}
