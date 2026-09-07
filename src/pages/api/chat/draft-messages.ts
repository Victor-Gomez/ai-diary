import type { APIRoute } from 'astro';
import { badRequest, json, readJson } from '@/lib/api';
import { getConversation, getMessages } from '@/lib/chat/conversations';
import { getEntry } from '@/lib/diary/entries';
import { buildSummaryMessages } from '@/lib/chat/summarize-prompt';
import type { ProviderChatMessage } from '@/types';

export const prerender = false;

/**
 * Return the summarization messages for a conversation so the in-browser model
 * can generate the draft entry locally. No inference or persistence here.
 */
export const POST: APIRoute = async ({ request }) => {
  const body = await readJson<{ conversationId?: string }>(request);
  const conversationId = body.conversationId;
  if (!conversationId) return badRequest('conversationId is required');
  if (!getConversation(conversationId)) return badRequest('Unknown conversation');

  const allMessages = getMessages(conversationId);
  const history: ProviderChatMessage[] = allMessages
    .filter((m) => m.role !== 'system')
    .map((m) => ({ role: m.role, content: m.content }));

  // Find if there is an existing entry linked to this conversation
  const firstCitation = allMessages.flatMap((m) => m.citations || [])[0];
  const baseEntry = firstCitation?.entryId ? getEntry(firstCitation.entryId) : null;
  const baseDraft = baseEntry?.content;

  if (history.filter((m) => m.role === 'user').length === 0) {
    return json({ messages: [], baseDraft: baseDraft ?? null });
  }
  return json({ messages: buildSummaryMessages(history, baseDraft) });
};
