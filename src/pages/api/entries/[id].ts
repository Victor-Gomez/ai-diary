import type { APIRoute } from 'astro';
import { getEntryWithAnalysis, updateEntry, deleteEntry } from '@/lib/diary/entries';
import { json, notFound, badRequest, readJson } from '@/lib/api';

export const prerender = false;

export const GET: APIRoute = ({ params }) => {
  const id = params.id;
  if (!id) return badRequest('Missing id');
  const entry = getEntryWithAnalysis(id);
  return entry ? json(entry) : notFound('Entry not found');
};

export const PUT: APIRoute = async ({ params, request }) => {
  const id = params.id;
  if (!id) return badRequest('Missing id');
  const body = await readJson<{ content?: string }>(request);
  if (typeof body.content !== 'string') return badRequest('content is required');
  const entry = updateEntry(id, body.content);
  return entry ? json(entry) : notFound('Entry not found');
};

export const DELETE: APIRoute = ({ params }) => {
  const id = params.id;
  if (!id) return badRequest('Missing id');
  return deleteEntry(id) ? json({ ok: true }) : notFound('Entry not found');
};
