import type { APIRoute } from 'astro';
import { badRequest, json, readJson } from '@/lib/api';
import { getConversation, getMessages } from '@/lib/chat/conversations';
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

  const history: ProviderChatMessage[] = getMessages(conversationId)
    .filter((m) => m.role !== 'system')
    .map((m) => ({ role: m.role, content: m.content }));

  if (history.filter((m) => m.role === 'user').length === 0) {
    return json({ messages: [] });
  }
  return json({ messages: buildSummaryMessages(history) });
};
