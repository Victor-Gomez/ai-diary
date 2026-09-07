import type { APIRoute } from 'astro';
import { badRequest, json, serverError, notFound, readJson } from '@/lib/api';
import { createEntry, updateEntry, getEntry } from '@/lib/diary/entries';
import { analyzeEntry } from '@/lib/diary/analyze-service';
import { addMessage, getConversation, getMessages } from '@/lib/chat/conversations';
import { getProvider } from '@/lib/ai';
import { formatLongDate } from '@/lib/utils/date';
import { excerpt } from '@/lib/utils/text';
import type { Citation, ProviderChatMessage } from '@/types';

export const prerender = false;

/**
 * Save the conversation's draft as a diary entry.
 *
 * - If `content` is provided (the draft the user sees), it is saved verbatim so
 *   "what you see is what you save". Otherwise it is generated from the chat.
 * - If `entryId` is provided, that entry is UPDATED (re-saving an evolving draft
 *   doesn't create duplicates); otherwise a new entry is created.
 * A confirmation message linking to the entry is appended to the conversation.
 */
export const POST: APIRoute = async ({ request }) => {
  const body = await readJson<{ conversationId?: string; content?: string; entryId?: string }>(
    request,
  );
  const conversationId = body.conversationId;
  if (!conversationId) return badRequest('conversationId is required');
  if (!getConversation(conversationId)) return badRequest('Unknown conversation');

  try {
    let text = body.content?.trim() ?? '';
    if (!text) {
      const history = getMessages(conversationId).filter((m) => m.role !== 'system');
      if (history.filter((m) => m.role === 'user').length === 0) {
        return badRequest('Say something first — there is nothing to summarize yet.');
      }
      const providerMessages: ProviderChatMessage[] = history.map((m) => ({
        role: m.role,
        content: m.content,
      }));
      text = (await getProvider().summarizeConversation(providerMessages)).trim();
    }
    if (!text) return badRequest('Could not produce an entry from this conversation.');

    let targetEntryId = body.entryId;
    if (!targetEntryId) {
      const prior = getMessages(conversationId);
      const firstCitation = prior.flatMap((m) => m.citations || [])[0];
      if (firstCitation?.entryId && getEntry(firstCitation.entryId)) {
        targetEntryId = firstCitation.entryId;
      }
    }
    const updating = Boolean(targetEntryId && getEntry(targetEntryId));
    const entry = updating ? updateEntry(targetEntryId!, text) : createEntry(text);
    if (!entry) return notFound('Entry not found');

    const analysis = await analyzeEntry(entry.id).catch(() => null);

    const citation: Citation = {
      entryId: entry.id,
      date: formatLongDate(entry.createdAt),
      excerpt: excerpt(text, 140),
    };

    const confirmation = updating
      ? `Updated your entry for **${formatLongDate(entry.createdAt)}** with the latest draft.`
      : `Saved as your entry for **${formatLongDate(entry.createdAt)}**. Open it any time to read or edit.`;

    const assistantMessage = addMessage(conversationId, 'assistant', confirmation, [citation]);

    return json({ entry, analysis, assistantMessage }, 201);
  } catch (e) {
    return serverError(`Could not save entry: ${(e as Error).message}`);
  }
};
