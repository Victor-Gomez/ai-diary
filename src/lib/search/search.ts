import { getDb } from '../db/client';
import { ftsSearchIds } from './fts';
import { mapAnalysisRow, type AnalysisRow } from '../diary/analysis';
import { highlightExcerpt, excerpt as makeExcerpt } from '../utils/text';
import type { DiaryEntry, EntryAnalysis, SearchOptions, SearchResult } from '@/types';

interface JoinRow {
  id: string;
  content: string;
  created_at: string;
  updated_at: string;
  a_id: string | null;
  summary: string | null;
  mood: number | null;
  stress: number | null;
  energy: number | null;
  topics: string | null;
  people: string | null;
  places: string | null;
  activities: string | null;
  important: number | null;
  a_created_at: string | null;
  a_updated_at: string | null;
}

function toAnalysis(r: JoinRow): EntryAnalysis | null {
  if (!r.a_id) return null;
  const row: AnalysisRow = {
    id: r.a_id,
    entry_id: r.id,
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
  return mapAnalysisRow(row);
}

function toEntry(r: JoinRow): DiaryEntry {
  return { id: r.id, content: r.content, createdAt: r.created_at, updatedAt: r.updated_at };
}

const SELECT = `
  SELECT e.id, e.content, e.created_at, e.updated_at,
         a.id AS a_id, a.summary, a.mood, a.stress, a.energy,
         a.topics, a.people, a.places, a.activities, a.important,
         a.created_at AS a_created_at, a.updated_at AS a_updated_at
    FROM entries e
    LEFT JOIN entry_analysis a ON a.entry_id = e.id`;

/**
 * Search entries by full text plus structured filters (date/topic/people/mood).
 *
 * Text ranking uses FTS5 (bm25); structured filters are applied on the joined
 * analysis. The interface is deliberately identical to how a future vector
 * search would behave, so it can be swapped in without changing callers.
 */
export function searchEntries(query: string, options: SearchOptions = {}): SearchResult[] {
  const db = getDb();
  const limit = options.limit ?? 50;
  const q = query.trim();

  let rows: JoinRow[];
  let scoreById: Map<string, number> | null = null;

  if (q.length > 0) {
    const hits = ftsSearchIds(q, 200);
    if (hits.length === 0) return [];
    scoreById = new Map(hits.map((h) => [h.id, h.score]));
    const placeholders = hits.map(() => '?').join(',');
    rows = db
      .prepare<JoinRow>(`${SELECT} WHERE e.id IN (${placeholders})`)
      .all(...hits.map((h) => h.id));
  } else {
    rows = db.prepare<JoinRow>(`${SELECT} ORDER BY e.created_at DESC LIMIT 500`).all();
  }

  let results = rows.map((r) => {
    const analysis = toAnalysis(r);
    return {
      entry: toEntry(r),
      analysis,
      excerpt: q ? highlightExcerpt(r.content, q) : makeExcerpt(r.content),
      score: scoreById?.get(r.id) ?? 0,
    } satisfies SearchResult;
  });

  results = results.filter((r) => matchesFilters(r, options));

  if (q.length > 0) {
    results.sort((a, b) => b.score - a.score);
  } else {
    results.sort((a, b) => b.entry.createdAt.localeCompare(a.entry.createdAt));
  }

  return results.slice(0, limit);
}

function matchesFilters(r: SearchResult, o: SearchOptions): boolean {
  const dateKey = r.entry.createdAt.slice(0, 10);
  if (o.from && dateKey < o.from) return false;
  if (o.to && dateKey > o.to) return false;

  if (o.topics?.length) {
    const set = new Set(r.analysis?.topics ?? []);
    if (!o.topics.some((t) => set.has(t))) return false;
  }
  if (o.people?.length) {
    const set = new Set(r.analysis?.people ?? []);
    if (!o.people.some((p) => set.has(p))) return false;
  }
  const mood = r.analysis?.mood;
  if (o.minMood !== undefined && (mood === undefined || mood < o.minMood)) return false;
  if (o.maxMood !== undefined && (mood === undefined || mood > o.maxMood)) return false;
  const stress = r.analysis?.stress;
  if (o.minStress !== undefined && (stress === undefined || stress < o.minStress)) return false;
  if (o.maxStress !== undefined && (stress === undefined || stress > o.maxStress)) return false;

  return true;
}
