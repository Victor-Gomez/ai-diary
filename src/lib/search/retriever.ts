import { searchEntries } from './search';
import type { DiaryEntry, SearchOptions } from '@/types';

/**
 * Retrieval abstraction for RAG. The chat pipeline depends only on this
 * interface, so the current FTS-based implementation can be replaced with vector
 * similarity search (Phase 4) — using the `embedding` columns already in the
 * schema — without any change to the chat service.
 */
export interface RetrievedEntry {
  entry: DiaryEntry;
  excerpt: string;
  score: number;
}

export interface DiaryRetriever {
  readonly kind: string;
  search(query: string, options?: SearchOptions): Promise<RetrievedEntry[]>;
}

/** Keyword/full-text retriever backed by SQLite FTS5. */
export class FtsRetriever implements DiaryRetriever {
  readonly kind = 'fts';

  async search(query: string, options: SearchOptions = {}): Promise<RetrievedEntry[]> {
    const results = searchEntries(query, { limit: 8, ...options });
    return results.map((r) => ({
      entry: r.entry,
      excerpt: r.analysis?.summary?.trim() || r.excerpt,
      score: r.score,
    }));
  }
}

export function createRetriever(): DiaryRetriever {
  // A VectorRetriever implementing the same interface can be selected here later.
  return new FtsRetriever();
}
