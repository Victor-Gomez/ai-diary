import type { APIRoute } from 'astro';
import { lockVault, destroySession } from '../../../lib/auth/vault';
import { json } from '../../../lib/api';

export const prerender = false;

export const POST: APIRoute = async ({ cookies }) => {
  const token = cookies.get('diary_session')?.value;
  destroySession(token);
  lockVault();

  cookies.delete('diary_session', { path: '/' });

  return json({ ok: true });
};
