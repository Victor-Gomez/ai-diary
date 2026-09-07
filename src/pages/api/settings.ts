import type { APIRoute } from 'astro';
import { getSettings, updateSettings } from '@/lib/settings/settings';
import { createProvider } from '@/lib/ai';
import { json, readJson } from '@/lib/api';
import type { AppSettings } from '@/types';

export const prerender = false;

export const GET: APIRoute = async () => {
  const settings = getSettings();
  const status = await createProvider(settings).status();
  return json({ settings, status });
};

export const PUT: APIRoute = async ({ request }) => {
  const patch = await readJson<Partial<AppSettings>>(request);
  const settings = updateSettings(patch);
  const status = await createProvider(settings).status();
  return json({ settings, status });
};
