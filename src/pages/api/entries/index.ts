import type { APIRoute } from 'astro';
import { createEntry, listEntries } from '@/lib/diary/entries';
import { json, readJson } from '@/lib/api';

export const prerender = false;

export const GET: APIRoute = ({ url }) => {
  const limit = Number(url.searchParams.get('limit') ?? 50);
  const offset = Number(url.searchParams.get('offset') ?? 0);
  return json(listEntries(limit, offset));
};

export const POST: APIRoute = async ({ request }) => {
  const body = await readJson<{ content?: string; createdAt?: string }>(request);
  const content = body.content ?? '';
  const entry = createEntry(content, body.createdAt);
  return json(entry, 201);
};
