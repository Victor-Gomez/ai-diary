import type { APIRoute } from 'astro';
import { exportData } from '@/lib/data/manage';

export const prerender = false;

export const GET: APIRoute = () => {
  const data = exportData();
  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="diary-export-${stamp}.json"`,
    },
  });
};
