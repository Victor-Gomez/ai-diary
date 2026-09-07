import type { AIProvider } from './provider';
import { MockAIProvider } from './mock-provider';
import { OpenAICompatibleProvider } from './openai-compatible-provider';
import { getSettings } from '../settings/settings';
import type { AppSettings } from '@/types';

export type { AIProvider } from './provider';

/**
 * Provider factory. This is the ONLY place that knows about concrete providers;
 * everything else depends on the AIProvider interface. Adding llama.cpp / Ollama
 * / Gemini Nano later means adding a case here — no UI or service changes.
 */
export function createProvider(settings: AppSettings = getSettings()): AIProvider {
  switch (settings.providerKind) {
    case 'openai-compatible':
    case 'local': // local runtimes (Ollama, llama.cpp server) expose an OpenAI-compatible API
      return new OpenAICompatibleProvider(settings.endpoint, settings.model, settings.apiKey);
    case 'gemini-nano':
      // Gemini Nano runs client-side in Chrome (see src/lib/client/browser-ai.ts);
      // chat & drafts are generated in the browser. The server-side provider here
      // only backs analysis, which stays on the built-in local heuristic.
      return new MockAIProvider(
        'Gemini Nano · Chrome on-device',
        'Chat & drafts run on-device in Chrome; analysis uses the built-in provider.',
      );
    case 'mock':
    default:
      return new MockAIProvider();
  }
}

export function getProvider(): AIProvider {
  return createProvider();
}
