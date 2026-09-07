import type { APIRoute } from 'astro';
import { isVaultSetup, validateSession } from '../../../lib/auth/vault';
import { json } from '../../../lib/api';

export const prerender = false;

export const GET: APIRoute = async ({ cookies }) => {
  const token = cookies.get('diary_session')?.value;
  const isSetup = isVaultSetup();
  const isUnlocked = validateSession(token);

  return json({
    isSetup,
    isUnlocked,
  });
};
