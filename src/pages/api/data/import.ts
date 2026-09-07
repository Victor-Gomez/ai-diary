import type { APIRoute } from 'astro';
import { importData, type DiaryExport } from '@/lib/data/manage';
import { json, badRequest, serverError } from '@/lib/api';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  try {
    const data = (await request.json()) as DiaryExport;
    if (!data || typeof data !== 'object' || !Array.isArray(data.entries)) {
      return badRequest('Invalid export file');
    }
    const result = importData(data);
    return json(result);
  } catch (e) {
    return serverError(`Import failed: ${(e as Error).message}`);
  }
};
