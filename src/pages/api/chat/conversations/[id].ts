import type { APIRoute } from 'astro';
import {
  getConversation,
  getMessages,
  deleteConversation,
  renameConversation,
} from '@/lib/chat/conversations';
import { json, badRequest, notFound, readJson } from '@/lib/api';

export const prerender = false;

export const GET: APIRoute = ({ params }) => {
  const id = params.id;
  if (!id) return badRequest('Missing id');
  const conversation = getConversation(id);
  if (!conversation) return notFound('Conversation not found');
  return json({ conversation, messages: getMessages(id) });
};

export const PATCH: APIRoute = async ({ params, request }) => {
  const id = params.id;
  if (!id) return badRequest('Missing id');
  const body = await readJson<{ title?: string }>(request);
  if (!body.title) return badRequest('title required');
  renameConversation(id, body.title);
  return json({ ok: true });
};

export const DELETE: APIRoute = ({ params }) => {
  const id = params.id;
  if (!id) return badRequest('Missing id');
  return deleteConversation(id) ? json({ ok: true }) : notFound('Conversation not found');
};
