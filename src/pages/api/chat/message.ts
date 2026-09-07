import type { APIRoute } from 'astro';
import { badRequest, readJson } from '@/lib/api';
import {
  addMessage,
  getConversation,
  getMessages,
  renameConversation,
} from '@/lib/chat/conversations';
import { prepareChat } from '@/lib/chat/service';
import { getProvider } from '@/lib/ai';

export const prerender = false;

/**
 * Streaming chat endpoint (Server-Sent Events).
 * Emits: `citations` (once), `delta` (many), `done` (once) or `error`.
 * The user message is persisted immediately; the assistant message is persisted
 * once the stream completes so a refresh always shows the full conversation.
 */
export const POST: APIRoute = async ({ request }) => {
  const body = await readJson<{ conversationId?: string; content?: string }>(request);
  const conversationId = body.conversationId;
  const content = body.content?.trim();
  if (!conversationId || !content) return badRequest('conversationId and content are required');
  const conv = getConversation(conversationId);
  if (!conv) return badRequest('Unknown conversation');

  // Auto-title from the first user message only if default title.
  const prior = getMessages(conversationId);
  addMessage(conversationId, 'user', content);
  if (conv.title === 'New conversation' && prior.filter((m) => m.role === 'user').length === 0) {
    renameConversation(conversationId, content.slice(0, 60));
  }

  const { providerMessages, citations } = await prepareChat(conversationId, content);
  const provider = getProvider();

  const encoder = new TextEncoder();
  const send = (event: string, data: unknown) =>
    encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let full = '';
      try {
        controller.enqueue(send('citations', citations));
        for await (const chunk of provider.chatStream(providerMessages)) {
          full += chunk;
          controller.enqueue(send('delta', chunk));
        }
        const saved = addMessage(conversationId, 'assistant', full, citations);
        controller.enqueue(send('done', { id: saved.id }));
      } catch (e) {
        const message = (e as Error).message;
        // Persist a best-effort assistant message so history stays coherent.
        if (full) addMessage(conversationId, 'assistant', full, citations);
        controller.enqueue(send('error', { message }));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
};
