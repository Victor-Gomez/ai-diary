import type { ProviderChatMessage } from '@/types';

/**
 * Canonical prompt for turning a conversation into a diary entry. Shared so the
 * server providers and the in-browser (Gemini Nano) path build the exact same
 * messages, giving consistent drafts regardless of where inference runs.
 */
export const SUMMARY_SYSTEM = [
  'You maintain the user\'s diary entry from a journaling conversation. You receive',
  'the conversation (the user is labelled "Me") and, when editing an existing entry,',
  'its current text. Treat the user\'s messages as both source material and edit',
  'instructions, and output the current best version of the entry — applying every',
  'instruction so far, in the language the user is writing or asking for.',
  '',
  'Principles:',
  '- Faithful: include only what the user actually shared; never invent.',
  '- Complete: keep all of the entry\'s existing content; change only what the user asked to change.',
  '- Preserve the entry\'s Markdown formatting; alter formatting only when asked.',
  '- Voice: first person, past tense, natural.',
  '- Output ONLY the entry as raw Markdown — no preamble, title, quotes, or wrapping code fence.',
].join('\n');

export function buildSummaryMessages(
  history: ProviderChatMessage[],
  baseDraft?: string,
): ProviderChatMessage[] {
  const transcript = history
    .filter((m) => m.role !== 'system')
    .map((m) => `${m.role === 'user' ? 'Me' : 'Companion'}: ${m.content}`)
    .join('\n');

  const content = baseDraft
    ? `ORIGINAL ENTRY BEING DISCUSSED / EDITED:\n"""\n${baseDraft}\n"""\n\nCONVERSATION AND EDIT INSTRUCTIONS:\n${transcript}`
    : transcript;

  return [
    { role: 'system', content: SUMMARY_SYSTEM },
    { role: 'user', content },
  ];
}
