import type { EntryAnalysisResult, ProviderChatMessage } from '@/types';

/**
 * Provider-agnostic AI interface. The rest of the app depends ONLY on this
 * contract, never on a concrete model. Concrete providers (mock today; local
 * llama.cpp / Ollama / Gemini Nano / OpenAI-compatible later) implement it and
 * are chosen by the factory in ./index.ts based on user settings.
 */
export interface AIProvider {
  readonly id: string;
  readonly label: string;

  /** Non-streaming completion. */
  chat(messages: ProviderChatMessage[]): Promise<string>;

  /**
   * Streaming completion. Providers that cannot stream should emit the whole
   * answer as a single chunk (the mock provider fakes token-by-token streaming).
   */
  chatStream(messages: ProviderChatMessage[]): AsyncIterable<string>;

  /** Extract structured analysis from raw entry text (never mutates the text). */
  analyzeEntry(content: string): Promise<EntryAnalysisResult>;

  /**
   * Distill a conversation into a first-person diary entry the user can save.
   * If baseDraft is provided (e.g. from an existing entry being discussed or edited),
   * the summarizer updates, translates, or refines it accordingly.
   * Must only reflect what the user actually said — no invented events.
   */
  summarizeConversation(messages: ProviderChatMessage[], baseDraft?: string): Promise<string>;

  /** Produce an embedding vector for semantic search (Phase 4). */
  embed(text: string): Promise<number[]>;

  /** Whether this provider performs all inference locally (privacy signal). */
  readonly isLocal: boolean;

  /** Cheap health check for the sidebar status indicator. */
  status(): Promise<{ ok: boolean; detail: string }>;
}
