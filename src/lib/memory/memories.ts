import { getDb } from '../db/client';
import { newId } from '../utils/id';
import { nowIso } from '../utils/date';
import { getRecentAnalyses } from '../diary/entries';
import type { Memory, MemoryType } from '@/types';

interface MemoryRow {
  id: string;
  content: string;
  type: string;
  importance: number;
  source_entry_ids: string;
  created_at: string;
  updated_at: string;
}

function mapMemory(r: MemoryRow): Memory {
  let sources: string[] = [];
  try {
    const v: unknown = JSON.parse(r.source_entry_ids);
    if (Array.isArray(v)) sources = v.filter((x): x is string => typeof x === 'string');
  } catch {
    /* ignore */
  }
  return {
    id: r.id,
    content: r.content,
    type: r.type as MemoryType,
    importance: r.importance,
    sourceEntryIds: sources,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function listMemories(): Memory[] {
  return getDb()
    .prepare<MemoryRow>(`SELECT * FROM memories ORDER BY importance DESC, updated_at DESC`)
    .all()
    .map(mapMemory);
}

export function upsertMemory(
  content: string,
  type: MemoryType,
  importance: number,
  sourceEntryIds: string[],
): Memory {
  const db = getDb();
  const existing = db
    .prepare<{ id: string; created_at: string }>(
      `SELECT id, created_at FROM memories WHERE content = ?`,
    )
    .get(content);
  const id = existing?.id ?? newId();
  const now = nowIso();
  const createdAt = existing?.created_at ?? now;
  db.prepare(
    `INSERT INTO memories (id, content, type, importance, source_entry_ids, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET importance=excluded.importance,
       source_entry_ids=excluded.source_entry_ids, updated_at=excluded.updated_at`,
  ).run(id, content, type, importance, JSON.stringify(sourceEntryIds), createdAt, now);
  return { id, content, type, importance, sourceEntryIds, createdAt, updatedAt: now };
}

export function deleteMemory(id: string): boolean {
  return getDb().prepare(`DELETE FROM memories WHERE id = ?`).run(id).changes > 0;
}

/** Naive keyword relevance over stored memories (for chat context). */
export function getRelevantMemories(query: string, limit = 4): Memory[] {
  const terms = query.toLowerCase().match(/[a-z]+/g) ?? [];
  if (!terms.length) return [];
  const all = listMemories();
  return all
    .map((m) => {
      const text = m.content.toLowerCase();
      const overlap = terms.filter((t) => text.includes(t)).length;
      return { m, overlap };
    })
    .filter((x) => x.overlap > 0)
    .sort((a, b) => b.overlap - a.overlap || b.m.importance - a.m.importance)
    .slice(0, limit)
    .map((x) => x.m);
}

/**
 * Regenerate derived long-term memories from recent analyses.
 *
 * This is intentionally a simple, transparent aggregation (frequency of topics
 * and people) rather than an LLM summarizer — it is a placeholder that already
 * produces useful memories and can later be replaced by a provider-driven pass.
 * Memories are always DERIVED and never override diary entries.
 */
export function regenerateMemories(): Memory[] {
  const recent = getRecentAnalyses(200);
  if (recent.length < 3) return listMemories();

  const topicCounts = new Map<string, string[]>();
  const personCounts = new Map<string, string[]>();
  let stressTotal = 0;
  let stressCount = 0;

  for (const { entry, analysis } of recent) {
    for (const t of analysis.topics) {
      topicCounts.set(t, [...(topicCounts.get(t) ?? []), entry.id]);
    }
    for (const p of analysis.people) {
      personCounts.set(p, [...(personCounts.get(p) ?? []), entry.id]);
    }
    stressTotal += analysis.stress;
    stressCount += 1;
  }

  const total = recent.length;
  const results: Memory[] = [];

  for (const [topic, ids] of topicCounts) {
    if (ids.length >= Math.max(3, total * 0.3)) {
      const kind: MemoryType = topic === 'creativity' || topic === 'nature' ? 'interest' : 'pattern';
      results.push(
        upsertMemory(
          `${cap(topic)} appears frequently across your entries (${ids.length} of ${total}).`,
          kind,
          Math.min(1, ids.length / total),
          [...new Set(ids)].slice(0, 20),
        ),
      );
    }
  }

  for (const [person, ids] of personCounts) {
    if (ids.length >= 3) {
      results.push(
        upsertMemory(
          `${person} is mentioned often (${ids.length} entries).`,
          'person',
          Math.min(1, ids.length / total),
          [...new Set(ids)].slice(0, 20),
        ),
      );
    }
  }

  if (stressCount > 0 && stressTotal / stressCount > 0.6) {
    results.push(
      upsertMemory(
        'Stress has been elevated across recent entries.',
        'pattern',
        stressTotal / stressCount,
        recent.slice(0, 10).map((r) => r.entry.id),
      ),
    );
  }

  return results.length ? results : listMemories();
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
