import { getDb } from '../db/client';

/**
 * Turn free user text into a safe FTS5 MATCH expression.
 * We OR prefix-terms for good recall; bm25() then ranks by relevance.
 * Returns null when there is nothing searchable (caller should list instead).
 */
export function toMatchQuery(query: string): string | null {
  const terms = query
    .toLowerCase()
    .match(/[a-z0-9à-ÿ]+/gi)
    ?.filter((t) => t.length >= 2);
  if (!terms || terms.length === 0) return null;
  return terms.map((t) => `"${t}"*`).join(' OR ');
}

export interface FtsHit {
  id: string;
  score: number; // higher = more relevant
}

/** Raw FTS lookup returning entry ids ranked by relevance. */
export function ftsSearchIds(query: string, limit = 50): FtsHit[] {
  const match = toMatchQuery(query);
  if (!match) return [];
  const rows = getDb()
    .prepare<{ id: string; rank: number }>(
      `SELECT e.id AS id, bm25(entries_fts) AS rank
         FROM entries_fts
         JOIN entries e ON e.rowid = entries_fts.rowid
        WHERE entries_fts MATCH ?
        ORDER BY rank
        LIMIT ?`,
    )
    .all(match, limit);
  // bm25 is lower-is-better; convert to a positive descending score.
  return rows.map((r) => ({ id: r.id, score: -r.rank }));
}
