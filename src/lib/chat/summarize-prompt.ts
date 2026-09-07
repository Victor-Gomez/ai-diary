import type { ProviderChatMessage } from '@/types';

/**
 * Canonical prompt for turning a conversation into a diary entry. Shared so the
 * server providers and the in-browser (Gemini Nano) path build the exact same
 * messages, giving consistent drafts regardless of where inference runs.
 */
export const SUMMARY_SYSTEM = [
  'You are the diary-writing engine behind a journaling app. You receive the',
  'full conversation between the user (labelled "Me") and their journaling',
  'companion. Your task:',
  '1. Analyse the whole conversation and identify what actually happened, how',
  '   the user felt, and any details worth remembering.',
  "2. Treat the user's messages as BOTH source material AND possible editing",
  '   instructions. If a message is an instruction about the entry itself —',
  '   e.g. "change the walk to a run", "remove the part about work", "make it',
  '   shorter", "rewrite it more upbeat", in ANY language — apply it to the',
  '   entry rather than copying the instruction into it.',
  '3. Produce the CURRENT best version of the diary entry, incorporating every',
  '   instruction so far.',
  '',
  'Rules for the entry: first person ("I"), past tense, warm and natural,',
  "usually 1–3 short paragraphs, in the user's own language. Only include",
  'things the user actually shared — never invent events, people, places, or',
  'emotions. Do not address the reader, mention "the conversation", or add a',
  'title. Output ONLY the diary entry text — no preamble, notes, or quotes.',
].join('\n');

export function buildSummaryMessages(history: ProviderChatMessage[]): ProviderChatMessage[] {
  const transcript = history
    .filter((m) => m.role !== 'system')
    .map((m) => `${m.role === 'user' ? 'Me' : 'Companion'}: ${m.content}`)
    .join('\n');
  return [
    { role: 'system', content: SUMMARY_SYSTEM },
    { role: 'user', content: transcript },
  ];
}
