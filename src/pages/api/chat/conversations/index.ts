import type { APIRoute } from 'astro';
import { createConversation, listConversations } from '@/lib/chat/conversations';
import { json, readJson } from '@/lib/api';

export const prerender = false;

export const GET: APIRoute = () => json(listConversations());

export const POST: APIRoute = async ({ request }) => {
  const body = await readJson<{ title?: string }>(request).catch(() => ({}) as { title?: string });
  return json(createConversation(body.title), 201);
};
