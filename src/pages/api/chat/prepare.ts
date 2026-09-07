import type { APIRoute } from 'astro';
import { badRequest, json, readJson } from '@/lib/api';
import { addMessage, getConversation, getMessages, renameConversation } from '@/lib/chat/conversations';
import { prepareChat } from '@/lib/chat/service';

export const prerender = false;

/**
 * Retrieval + context building for the in-browser (Gemini Nano) path.
 * Saves the user's message and returns the provider messages + citations so the
 * client can run inference locally, then persist the answer via save-assistant.
 */
export const POST: APIRoute = async ({ request }) => {
  const body = await readJson<{ conversationId?: string; content?: string }>(request);
  const conversationId = body.conversationId;
  const content = body.content?.trim();
  if (!conversationId || !content) return badRequest('conversationId and content are required');
  const conv = getConversation(conversationId);
  if (!conv) return badRequest('Unknown conversation');

  const prior = getMessages(conversationId);
  addMessage(conversationId, 'user', content);
  if (conv.title === 'New conversation' && prior.filter((m) => m.role === 'user').length === 0) {
    renameConversation(conversationId, content.slice(0, 60));
  }

  const { providerMessages, citations } = await prepareChat(conversationId, content);
  return json({ messages: providerMessages, citations });
};
