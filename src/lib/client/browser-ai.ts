import type { ProviderChatMessage } from '@/types';

/**
 * In-browser inference via Chrome's on-device Gemini Nano (the Prompt API).
 *
 * This is the ONE place that touches `window.LanguageModel`. It supports both
 * the current API (`LanguageModel.availability()` + `create({initialPrompts})`)
 * and the older origin-trial shape (`ai.languageModel.capabilities()` +
 * `create({systemPrompt})`). Inference runs entirely on the user's device — no
 * server, no network — which is why the diary's server code never sees it.
 */

export type Availability = 'available' | 'downloadable' | 'downloading' | 'unavailable' | 'no-api';

interface LanguageModelSession {
  prompt(input: string): Promise<string>;
  promptStreaming?(input: string): AsyncIterable<string>;
  destroy?(): void;
}

interface LanguageModelLike {
  availability?(): Promise<string>;
  capabilities?(): Promise<{ available: string }>;
  create(options?: Record<string, unknown>): Promise<LanguageModelSession>;
}

/** Some Chromium builds expose the API but have no real model and echo input. */
export function isEchoStub(text: string): boolean {
  return /on-device model is not available|just echoing back the input/i.test(text);
}

// Serialize on-device calls — the single local model can't handle concurrency.
let queue: Promise<unknown> = Promise.resolve();
function serialize<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn);
  queue = run.catch(() => undefined);
  return run;
}

function getLM(): LanguageModelLike | null {
  const g = globalThis as unknown as {
    LanguageModel?: LanguageModelLike;
    ai?: { languageModel?: LanguageModelLike };
  };
  return g.LanguageModel ?? g.ai?.languageModel ?? null;
}

/** Whether this build exposes the modern API (governs create() options). */
function isModern(lm: LanguageModelLike): boolean {
  return typeof lm.availability === 'function';
}

export async function browserAIAvailability(): Promise<Availability> {
  const lm = getLM();
  if (!lm) return 'no-api';
  try {
    if (lm.availability) {
      const a = await lm.availability();
      return (['available', 'downloadable', 'downloading', 'unavailable'].includes(a)
        ? a
        : 'unavailable') as Availability;
    }
    if (lm.capabilities) {
      const c = await lm.capabilities();
      // Legacy states: 'readily' | 'after-download' | 'no'.
      if (c.available === 'readily') return 'available';
      if (c.available === 'after-download') return 'downloadable';
      return 'unavailable';
    }
  } catch {
    return 'unavailable';
  }
  return 'unavailable';
}

function splitMessages(messages: ProviderChatMessage[]): { system: string; promptText: string } {
  const system = messages
    .filter((m) => m.role === 'system')
    .map((m) => m.content)
    .join('\n\n');
  const convo = messages.filter((m) => m.role !== 'system');
  const last = convo[convo.length - 1];
  const promptText =
    convo.length <= 1
      ? (last?.content ?? '')
      : convo.map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`).join('\n') +
        '\nAssistant:';
  return { system, promptText };
}

async function createSession(
  lm: LanguageModelLike,
  system: string,
  onDownload?: (pct: number) => void,
): Promise<LanguageModelSession> {
  const opts: Record<string, unknown> = {};
  if (system) {
    if (isModern(lm)) opts.initialPrompts = [{ role: 'system', content: system }];
    else opts.systemPrompt = system;
  }
  if (onDownload && isModern(lm)) {
    opts.monitor = (m: { addEventListener(t: string, cb: (e: { loaded: number }) => void): void }) => {
      m.addEventListener('downloadprogress', (e) => onDownload(Math.round((e.loaded ?? 0) * 100)));
    };
  }
  return lm.create(opts);
}

let modelReady = false;

/**
 * Ensure the on-device model is downloaded and ready. When the model still needs
 * downloading, Chrome requires this to be called within a user gesture, so the
 * caller must invoke it as the first awaited step of a click/keypress handler.
 */
export async function ensureModelReady(onProgress?: (pct: number) => void): Promise<void> {
  if (modelReady) return;
  const lm = getLM();
  if (!lm) throw new Error('no-api');
  const a = await browserAIAvailability();
  if (a === 'available') {
    modelReady = true;
    return;
  }
  if (a !== 'downloadable' && a !== 'downloading') throw new Error('unavailable');
  const session = await createSession(lm, '', onProgress); // resolves once downloaded
  session.destroy?.();
  modelReady = true;
}

/**
 * Run a completion on-device. If `onChunk` is given and streaming is supported,
 * chunks are delivered as deltas (handling both cumulative and delta APIs).
 * Returns the full text.
 */
export async function browserComplete(
  messages: ProviderChatMessage[],
  onChunk?: (delta: string) => void,
  onDownload?: (pct: number) => void,
): Promise<string> {
  const lm = getLM();
  if (!lm) throw new Error('Chrome on-device AI is not available in this browser.');
  const { system, promptText } = splitMessages(messages);
  return serialize(async () => {
    const session = await createSession(lm, system, onDownload);
    try {
      if (onChunk && session.promptStreaming) {
        let prev = '';
        for await (const chunk of session.promptStreaming(promptText)) {
          if (isEchoStub(chunk)) throw new Error('echo-stub');
          // Some builds stream cumulative text, others stream deltas.
          const delta = chunk.startsWith(prev) ? chunk.slice(prev.length) : chunk;
          prev = chunk.startsWith(prev) ? chunk : prev + chunk;
          if (delta) onChunk(delta);
        }
        if (isEchoStub(prev)) throw new Error('echo-stub');
        return prev;
      }
      const out = await session.prompt(promptText);
      if (isEchoStub(out)) throw new Error('echo-stub');
      return out;
    } finally {
      session.destroy?.();
    }
  });
}
