import type { APIRoute } from 'astro';
import { badRequest, json, readJson } from '@/lib/api';
import { addMessage, getConversation } from '@/lib/chat/conversations';
import type { Citation } from '@/types';

export const prerender = false;

/** Persist an assistant message produced by in-browser inference. */
export const POST: APIRoute = async ({ request }) => {
  const body = await readJson<{ conversationId?: string; content?: string; citations?: Citation[] }>(
    request,
  );
  const conversationId = body.conversationId;
  const content = body.content ?? '';
  if (!conversationId || !content.trim()) return badRequest('conversationId and content are required');
  if (!getConversation(conversationId)) return badRequest('Unknown conversation');

  const message = addMessage(conversationId, 'assistant', content, body.citations ?? []);
  return json({ id: message.id });
};
