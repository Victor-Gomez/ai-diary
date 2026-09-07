import { getDb } from '../db/client';
import { newId } from '../utils/id';
import { nowIso } from '../utils/date';
import { mapAnalysisRow, type AnalysisRow } from './analysis';
import type { DiaryEntry, DiaryEntryWithAnalysis, EntryAnalysis } from '@/types';

interface EntryRow {
  id: string;
  content: string;
  created_at: string;
  updated_at: string;
}

function mapEntryRow(row: EntryRow): DiaryEntry {
  return {
    id: row.id,
    content: row.content,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createEntry(content: string, createdAt?: string): DiaryEntry {
  const db = getDb();
  const id = newId();
  const ts = createdAt ?? nowIso();
  db.prepare(
    `INSERT INTO entries (id, content, created_at, updated_at) VALUES (?, ?, ?, ?)`,
  ).run(id, content, ts, ts);
  return { id, content, createdAt: ts, updatedAt: ts };
}

export function getEntry(id: string): DiaryEntry | null {
  const row = getDb()
    .prepare<EntryRow>(`SELECT * FROM entries WHERE id = ?`)
    .get(id);
  return row ? mapEntryRow(row) : null;
}

export function getEntryWithAnalysis(id: string): DiaryEntryWithAnalysis | null {
  const entry = getEntry(id);
  if (!entry) return null;
  return { ...entry, analysis: getAnalysisForEntry(id) };
}

/**
 * Update an entry's content. The AI analysis is intentionally NOT touched here —
 * the original text is the source of truth and is never modified by analysis.
 */
export function updateEntry(id: string, content: string): DiaryEntry | null {
  const db = getDb();
  const ts = nowIso();
  const res = db
    .prepare(`UPDATE entries SET content = ?, updated_at = ? WHERE id = ?`)
    .run(content, ts, id);
  if (res.changes === 0) return null;
  return getEntry(id);
}

export function deleteEntry(id: string): boolean {
  const res = getDb().prepare(`DELETE FROM entries WHERE id = ?`).run(id);
  return res.changes > 0;
}

export function listEntries(limit = 50, offset = 0): DiaryEntryWithAnalysis[] {
  const rows = getDb()
    .prepare<EntryRow & Partial<AnalysisRow & { a_id: string }>>(
      `SELECT e.*, a.id AS a_id, a.entry_id, a.summary, a.mood, a.stress,
              a.energy, a.topics, a.people, a.places, a.activities, a.important,
              a.created_at AS a_created_at, a.updated_at AS a_updated_at
         FROM entries e
         LEFT JOIN entry_analysis a ON a.entry_id = e.id
        ORDER BY e.created_at DESC
        LIMIT ? OFFSET ?`,
    )
    .all(limit, offset);
  return rows.map(joinRowToEntryWithAnalysis);
}

export function countEntries(): number {
  const row = getDb()
    .prepare<{ n: number }>(`SELECT COUNT(*) AS n FROM entries`)
    .get();
  return row?.n ?? 0;
}

/** Distinct YYYY-MM-DD date keys that have at least one entry (for the calendar). */
export function getEntryDateKeys(): string[] {
  const rows = getDb()
    .prepare<{ d: string }>(
      `SELECT DISTINCT substr(created_at, 1, 10) AS d FROM entries ORDER BY d`,
    )
    .all();
  return rows.map((r) => r.d);
}

/** Entries whose created_at falls on the given local YYYY-MM-DD. */
export function getEntriesByDate(dateKey: string): DiaryEntryWithAnalysis[] {
  const rows = getDb()
    .prepare<EntryRow & Partial<AnalysisRow & { a_id: string }>>(
      `SELECT e.*, a.id AS a_id, a.entry_id, a.summary, a.mood, a.stress,
              a.energy, a.topics, a.people, a.places, a.activities, a.important,
              a.created_at AS a_created_at, a.updated_at AS a_updated_at
         FROM entries e
         LEFT JOIN entry_analysis a ON a.entry_id = e.id
        WHERE substr(e.created_at, 1, 10) = ?
        ORDER BY e.created_at DESC`,
    )
    .all(dateKey);
  return rows.map(joinRowToEntryWithAnalysis);
}

/** Recent entries paired with analysis, oldest signal for trends first. */
export function getRecentAnalyses(limit = 30): { entry: DiaryEntry; analysis: EntryAnalysis }[] {
  const rows = getDb()
    .prepare<EntryRow & AnalysisRow & { a_id: string }>(
      `SELECT e.*, a.id AS a_id, a.entry_id, a.summary, a.mood, a.stress,
              a.energy, a.topics, a.people, a.places, a.activities, a.important,
              a.created_at AS a_created_at, a.updated_at AS a_updated_at
         FROM entries e
         JOIN entry_analysis a ON a.entry_id = e.id
        ORDER BY e.created_at DESC
        LIMIT ?`,
    )
    .all(limit);
  return rows.map((r) => ({
    entry: mapEntryRow(r),
    analysis: mapAnalysisRow(remapAnalysisAlias(r)),
  }));
}

// --- helpers shared with analysis join queries -----------------------------

function getAnalysisForEntry(entryId: string): EntryAnalysis | null {
  const row = getDb()
    .prepare<AnalysisRow>(`SELECT * FROM entry_analysis WHERE entry_id = ?`)
    .get(entryId);
  return row ? mapAnalysisRow(row) : null;
}

/** Rebuild an AnalysisRow from the aliased columns used in JOIN queries. */
function remapAnalysisAlias(
  r: EntryRow & Partial<AnalysisRow & { a_id: string; a_created_at: string; a_updated_at: string }>,
): AnalysisRow {
  return {
    id: r.a_id as string,
    entry_id: r.entry_id as string,
    summary: r.summary ?? '',
    mood: r.mood ?? 0.5,
    stress: r.stress ?? 0.5,
    energy: r.energy ?? 0.5,
    topics: r.topics ?? '[]',
    people: r.people ?? '[]',
    places: r.places ?? '[]',
    activities: r.activities ?? '[]',
    important: r.important ?? 0,
    created_at: r.a_created_at ?? '',
    updated_at: r.a_updated_at ?? '',
  };
}

function joinRowToEntryWithAnalysis(
  r: EntryRow & Partial<AnalysisRow & { a_id: string; a_created_at: string; a_updated_at: string }>,
): DiaryEntryWithAnalysis {
  const entry = mapEntryRow(r);
  const analysis = r.a_id ? mapAnalysisRow(remapAnalysisAlias(r)) : null;
  return { ...entry, analysis };
}
