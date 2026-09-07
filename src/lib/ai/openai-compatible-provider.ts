import type { AIProvider } from './provider';
import { buildSummaryMessages } from '../chat/summarize-prompt';
import type { EntryAnalysisResult, ProviderChatMessage } from '@/types';

/**
 * Talks to any OpenAI-compatible /chat/completions + /embeddings endpoint.
 * This covers Ollama, llama.cpp's server, LM Studio, vLLM and hosted APIs — the
 * user picks "Local model" or "Custom endpoint" in Settings and supplies a base
 * URL + model. No API key is stored by default (local runtimes don't need one);
 * DIARY_AI_KEY can be set for endpoints that require Authorization.
 *
 * IMPORTANT privacy note: when this provider is selected, entry text is sent to
 * the configured endpoint. For localhost endpoints that stays on-device; for a
 * remote endpoint the user is explicitly opting in (surfaced in Settings).
 */
export class OpenAICompatibleProvider implements AIProvider {
  readonly id = 'openai-compatible';
  readonly label: string;
  readonly isLocal: boolean;

  constructor(
    private readonly baseUrl: string,
    private readonly model: string,
    private readonly apiKey = '',
  ) {
    this.label = model ? `${model} @ ${baseUrl}` : baseUrl;
    this.isLocal = /localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]/.test(baseUrl);
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    // Prefer the key configured in Settings; fall back to the env var.
    const key = this.apiKey || process.env.DIARY_AI_KEY;
    if (key) h['Authorization'] = `Bearer ${key}`;
    return h;
  }

  async chat(messages: ProviderChatMessage[]): Promise<string> {
    const res = await fetch(`${this.baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ model: this.model, messages, stream: false }),
    });
    if (!res.ok) throw new Error(`Chat request failed (${res.status}): ${await res.text()}`);
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    return data.choices?.[0]?.message?.content ?? '';
  }

  async *chatStream(messages: ProviderChatMessage[]): AsyncIterable<string> {
    const res = await fetch(`${this.baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ model: this.model, messages, stream: true }),
    });
    if (!res.ok || !res.body) {
      throw new Error(`Chat stream failed (${res.status})`);
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const payload = trimmed.slice(5).trim();
        if (payload === '[DONE]') return;
        try {
          const json = JSON.parse(payload) as {
            choices?: { delta?: { content?: string } }[];
          };
          const delta = json.choices?.[0]?.delta?.content;
          if (delta) yield delta;
        } catch {
          /* ignore keep-alive / partial lines */
        }
      }
    }
  }

  async analyzeEntry(content: string): Promise<EntryAnalysisResult> {
    const system: ProviderChatMessage = {
      role: 'system',
      content:
        'You extract structured metadata from a diary entry. Respond with ONLY ' +
        'a JSON object matching: {summary:string, mood:number(0..1), ' +
        'stress:number(0..1), energy:number(0..1), topics:string[], ' +
        'people:string[], places:string[], activities:string[], ' +
        'important:boolean}. Do not invent facts not present in the text.',
    };
    const raw = await this.chat([system, { role: 'user', content }]);
    return parseAnalysis(raw);
  }

  async summarizeConversation(messages: ProviderChatMessage[]): Promise<string> {
    return this.chat(buildSummaryMessages(messages));
  }

  async embed(text: string): Promise<number[]> {
    const res = await fetch(`${this.baseUrl.replace(/\/$/, '')}/embeddings`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ model: this.model, input: text }),
    });
    if (!res.ok) throw new Error(`Embedding request failed (${res.status})`);
    const data = (await res.json()) as { data?: { embedding?: number[] }[] };
    return data.data?.[0]?.embedding ?? [];
  }

  async status(): Promise<{ ok: boolean; detail: string }> {
    try {
      const res = await fetch(`${this.baseUrl.replace(/\/$/, '')}/models`, {
        headers: this.headers(),
        signal: AbortSignal.timeout(2000),
      });
      return res.ok
        ? { ok: true, detail: `${this.isLocal ? 'Local endpoint' : 'Remote endpoint'} reachable` }
        : { ok: false, detail: `Endpoint returned ${res.status}` };
    } catch (e) {
      return { ok: false, detail: `Unreachable: ${(e as Error).message}` };
    }
  }
}

function clamp01(n: unknown, fallback = 0.5): number {
  const v = typeof n === 'number' ? n : Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.max(0, Math.min(1, v));
}

function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

function parseAnalysis(raw: string): EntryAnalysisResult {
  const match = raw.match(/\{[\s\S]*\}/);
  const json = match ? match[0] : '{}';
  let obj: Record<string, unknown> = {};
  try {
    obj = JSON.parse(json) as Record<string, unknown>;
  } catch {
    /* fall through to defaults */
  }
  return {
    summary: typeof obj.summary === 'string' ? obj.summary : '',
    mood: clamp01(obj.mood),
    stress: clamp01(obj.stress),
    energy: clamp01(obj.energy),
    topics: asStringArray(obj.topics),
    people: asStringArray(obj.people),
    places: asStringArray(obj.places),
    activities: asStringArray(obj.activities),
    important: obj.important === true,
  };
}
