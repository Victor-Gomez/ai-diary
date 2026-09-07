/**
 * Shared domain types for the diary application.
 *
 * These are the canonical shapes used across the DB layer, API routes, AI
 * providers and the UI. Timestamps are stored as ISO-8601 strings so they are
 * portable across SQLite, JSON export/import and eventual Tauri storage.
 */

// ---------------------------------------------------------------------------
// Diary
// ---------------------------------------------------------------------------

export interface DiaryEntry {
  id: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

/** A diary entry joined with its latest analysis (if any). */
export interface DiaryEntryWithAnalysis extends DiaryEntry {
  analysis: EntryAnalysis | null;
}

// ---------------------------------------------------------------------------
// AI analysis
// ---------------------------------------------------------------------------

/**
 * Structured information extracted from an entry by an AI provider.
 * Stored separately from the entry; the original text is never modified.
 * mood / stress / energy are normalized to the range [0, 1].
 */
export interface EntryAnalysis {
  id: string;
  entryId: string;
  summary: string;
  mood: number;
  stress: number;
  energy: number;
  topics: string[];
  people: string[];
  places: string[];
  activities: string[];
  important: boolean;
  createdAt: string;
  updatedAt: string;
}

/** The raw analysis payload a provider returns, before persistence. */
export type EntryAnalysisResult = Omit<
  EntryAnalysis,
  'id' | 'entryId' | 'createdAt' | 'updatedAt'
>;

// ---------------------------------------------------------------------------
// Chat
// ---------------------------------------------------------------------------

export type ChatRole = 'system' | 'user' | 'assistant';

export interface ChatMessage {
  id: string;
  conversationId: string;
  role: ChatRole;
  content: string;
  /** Diary entries cited by an assistant answer (empty for user messages). */
  citations: Citation[];
  createdAt: string;
}

/** A minimal message shape used when talking to an AI provider. */
export interface ProviderChatMessage {
  role: ChatRole;
  content: string;
}

export interface Conversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

/** A reference back to a diary entry used to formulate an answer. */
export interface Citation {
  entryId: string;
  date: string;
  excerpt: string;
}

// ---------------------------------------------------------------------------
// Long-term memory
// ---------------------------------------------------------------------------

export type MemoryType = 'pattern' | 'person' | 'interest' | 'fact' | 'other';

export interface Memory {
  id: string;
  content: string;
  type: MemoryType;
  importance: number; // [0, 1]
  sourceEntryIds: string[];
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

export interface SearchOptions {
  limit?: number;
  from?: string; // ISO date (inclusive)
  to?: string; // ISO date (inclusive)
  topics?: string[];
  people?: string[];
  minMood?: number;
  maxMood?: number;
  minStress?: number;
  maxStress?: number;
}

export interface SearchResult {
  entry: DiaryEntry;
  analysis: EntryAnalysis | null;
  excerpt: string;
  score: number;
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export type AIProviderKind = 'mock' | 'local' | 'gemini-nano' | 'openai-compatible';

export interface AppSettings {
  providerKind: AIProviderKind;
  /** Base URL for openai-compatible / local endpoints. */
  endpoint: string;
  model: string;
  /** Bearer API key for hosted endpoints (stored in the encrypted DB). */
  apiKey: string;
  analysisEnabled: boolean;
  /** Max diary entries pulled into chat context. */
  chatContextEntries: number;
}
