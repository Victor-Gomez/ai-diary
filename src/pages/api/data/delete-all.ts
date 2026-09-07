import type { APIRoute } from 'astro';
import { deleteAllData } from '@/lib/data/manage';
import { json, badRequest, readJson } from '@/lib/api';

export const prerender = false;

/** Destructive: requires an explicit confirmation token in the body. */
export const POST: APIRoute = async ({ request }) => {
  const body = await readJson<{ confirm?: string }>(request).catch(() => ({}) as { confirm?: string });
  if (body.confirm !== 'DELETE') {
    return badRequest('Confirmation required');
  }
  deleteAllData();
  return json({ ok: true });
};
