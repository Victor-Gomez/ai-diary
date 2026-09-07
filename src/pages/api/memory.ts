import type { APIRoute } from 'astro';
import { listMemories, regenerateMemories, deleteMemory } from '@/lib/memory/memories';
import { json, badRequest } from '@/lib/api';

export const prerender = false;

export const GET: APIRoute = () => json(listMemories());

export const POST: APIRoute = () => json(regenerateMemories());

export const DELETE: APIRoute = ({ url }) => {
  const id = url.searchParams.get('id');
  if (!id) return badRequest('id required');
  return json({ ok: deleteMemory(id) });
};
