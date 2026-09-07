import type { APIRoute } from 'astro';
import { badRequest, json, notFound, readJson } from '@/lib/api';
import { getEntry } from '@/lib/diary/entries';
import { addMessage, createConversation } from '@/lib/chat/conversations';
import { formatLongDate } from '@/lib/utils/date';
import { deriveTitle, excerpt } from '@/lib/utils/text';
import type { Citation } from '@/types';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const body = await readJson<{ entryId?: string }>(request).catch(() => ({}) as { entryId?: string });
  const entryId = body.entryId;
  if (!entryId) return badRequest('entryId is required');

  const entry = getEntry(entryId);
  if (!entry) return notFound('Entry not found');

  const formattedDate = formatLongDate(entry.createdAt);
  const title = deriveTitle(entry.content, formattedDate);
  const convTitle = `About: ${title.length > 50 ? `${title.slice(0, 50)}…` : title}`;

  const conv = createConversation(convTitle);

  const citation: Citation = {
    entryId: entry.id,
    date: formattedDate,
    excerpt: excerpt(entry.content, 140),
  };

  const greeting = `I've opened your entry from **${formattedDate}** (*"${title}"*).\n\nWhat would you like to explore, reflect on, or unpack about this entry?`;

  addMessage(conv.id, 'assistant', greeting, [citation]);

  return json({ conversationId: conv.id }, 201);
};
