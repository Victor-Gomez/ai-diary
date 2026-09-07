import type { APIRoute } from 'astro';
import { searchEntries } from '@/lib/search/search';
import { json } from '@/lib/api';
import type { SearchOptions } from '@/types';

export const prerender = false;

export const GET: APIRoute = ({ url }) => {
  const p = url.searchParams;
  const q = p.get('q') ?? '';
  const options: SearchOptions = {
    limit: p.get('limit') ? Number(p.get('limit')) : 50,
  };
  if (p.get('from')) options.from = p.get('from')!;
  if (p.get('to')) options.to = p.get('to')!;
  if (p.get('topics')) options.topics = p.get('topics')!.split(',').filter(Boolean);
  if (p.get('people')) options.people = p.get('people')!.split(',').filter(Boolean);
  if (p.get('minMood')) options.minMood = Number(p.get('minMood'));
  if (p.get('maxMood')) options.maxMood = Number(p.get('maxMood'));
  if (p.get('minStress')) options.minStress = Number(p.get('minStress'));
  if (p.get('maxStress')) options.maxStress = Number(p.get('maxStress'));

  return json(searchEntries(q, options));
};
