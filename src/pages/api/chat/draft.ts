import type { APIRoute } from 'astro';
import { badRequest, json, serverError, readJson } from '@/lib/api';
import { getConversation, getMessages } from '@/lib/chat/conversations';
import { getEntry } from '@/lib/diary/entries';
import { getProvider } from '@/lib/ai';
import type { ProviderChatMessage } from '@/types';

export const prerender = false;

/**
 * Generate (but do NOT save) the current diary-entry draft for a conversation.
 * Called after each message so the right-hand panel reflects the latest state,
 * including refinement requests the user made ("change X to Y", "make it
 * shorter", etc.). Saving is a separate, explicit action.
 */
export const POST: APIRoute = async ({ request }) => {
  const body = await readJson<{ conversationId?: string }>(request);
  const conversationId = body.conversationId;
  if (!conversationId) return badRequest('conversationId is required');
  if (!getConversation(conversationId)) return badRequest('Unknown conversation');

  const allMessages = getMessages(conversationId);
  const history = allMessages.filter((m) => m.role !== 'system');

  // Find if there is an existing entry linked to this conversation
  const firstCitation = allMessages.flatMap((m) => m.citations || [])[0];
  const baseEntry = firstCitation?.entryId ? getEntry(firstCitation.entryId) : null;
  const baseDraft = baseEntry?.content;

  if (history.filter((m) => m.role === 'user').length === 0) {
    return json({ draft: baseDraft ?? '', entryId: baseEntry?.id ?? null });
  }

  try {
    const providerMessages: ProviderChatMessage[] = history.map((m) => ({
      role: m.role,
      content: m.content,
    }));
    const draft = (await getProvider().summarizeConversation(providerMessages, baseDraft)).trim();
    return json({ draft, entryId: baseEntry?.id ?? null });
  } catch (e) {
    return serverError(`Could not generate draft: ${(e as Error).message}`);
  }
};
