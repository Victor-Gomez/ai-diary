import type { APIRoute } from 'astro';
import { analyzeEntry } from '@/lib/diary/analyze-service';
import { json, badRequest, serverError } from '@/lib/api';

export const prerender = false;

export const POST: APIRoute = async ({ params }) => {
  const id = params.id;
  if (!id) return badRequest('Missing id');
  try {
    const analysis = await analyzeEntry(id);
    if (!analysis) return json({ analysis: null, skipped: true });
    return json({ analysis });
  } catch (e) {
    return serverError(`Analysis failed: ${(e as Error).message}`);
  }
};
