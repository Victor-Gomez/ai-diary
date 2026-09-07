import { createRetriever, type RetrievedEntry } from '../search/retriever';
import { getRelevantMemories } from '../memory/memories';
import { getMessages } from './conversations';
import { getSettings } from '../settings/settings';
import { formatLongDate } from '../utils/date';
import { getEntry } from '../diary/entries';
import type { Citation, ProviderChatMessage } from '@/types';

const SYSTEM_PROMPT = `You are a thoughtful journaling assistant with access to the user's private diary.

Rules you must follow:
- The diary entries provided are the ONLY source of truth. Do not invent events, people, or feelings.
- If the diary does not contain enough information to answer, say so plainly.
- Clearly distinguish facts explicitly written in the diary from your interpretations.
- When you use an entry, refer to it by its date (e.g. "According to your entry from September 3...").
- Be concise, warm, and non-judgmental.`;

export interface PreparedChat {
  providerMessages: ProviderChatMessage[];
  citations: Citation[];
  retrieved: RetrievedEntry[];
}

/**
 * Build the full model context for a question following the RAG pipeline:
 *   recent chat history + retrieved diary entries + relevant long-term memories.
 * The whole diary is never dumped into context — only retrieved entries are.
 */
export async function prepareChat(
  conversationId: string,
  question: string,
): Promise<PreparedChat> {
  const settings = getSettings();
  const retriever = createRetriever();
  const retrieved = await retriever.search(question, { limit: settings.chatContextEntries });
  const memories = getRelevantMemories(question, 4);

  // If this conversation originated from an entry or has prior citations, make sure they are included
  const priorMessages = getMessages(conversationId);
  const existingEntryIds = new Set(retrieved.map((r) => r.entry.id));
  let focusedEntry: ReturnType<typeof getEntry> | null = null;

  for (const m of priorMessages) {
    for (const c of m.citations) {
      const actualEntry = getEntry(c.entryId);
      if (actualEntry && !focusedEntry) {
        focusedEntry = actualEntry;
      }
      if (!existingEntryIds.has(c.entryId)) {
        existingEntryIds.add(c.entryId);
        if (actualEntry) {
          retrieved.unshift({
            entry: actualEntry,
            excerpt: actualEntry.content,
            score: 1.0,
          });
        }
      }
    }
  }

  const focusedBlock = focusedEntry
    ? `\n\nCURRENT FOCUSED ENTRY (The entry currently being discussed / translated / edited, dated ${formatLongDate(focusedEntry.createdAt)}):\n"""\n${focusedEntry.content}\n"""`
    : '';

  const contextLines = retrieved.length
    ? retrieved
        .map((r) => `--- Entry from ${formatLongDate(r.entry.createdAt)} ---\n${r.entry.content}`)
        .join('\n\n')
    : '(no relevant entries found)';

  const memoryBlock = memories.length
    ? `\n\nLONG-TERM MEMORIES (derived, lower priority than entries):\n${memories
        .map((m) => `- ${m.content}`)
        .join('\n')}`
    : '';

  const contextMessage: ProviderChatMessage = {
    role: 'system',
    content: `DIARY CONTEXT (relevant entries for this question):${focusedBlock}\n\n${contextLines}${memoryBlock}`,
  };

  // Recent conversation history (exclude the just-saved question if present).
  const history = getMessages(conversationId)
    .filter((m) => m.role !== 'system')
    .slice(-8)
    .map<ProviderChatMessage>((m) => ({ role: m.role, content: m.content }));

  const providerMessages: ProviderChatMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    contextMessage,
    ...history,
  ];
  // Ensure the current question is the last user turn.
  if (providerMessages[providerMessages.length - 1]?.content !== question) {
    providerMessages.push({ role: 'user', content: question });
  }

  const citations: Citation[] = retrieved.map((r) => ({
    entryId: r.entry.id,
    date: formatLongDate(r.entry.createdAt),
    excerpt: r.entry.content.length > 200 ? `${r.entry.content.slice(0, 200)}…` : r.entry.content,
  }));

  return { providerMessages, citations, retrieved };
}
