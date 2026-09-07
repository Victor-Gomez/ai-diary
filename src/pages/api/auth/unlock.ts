import type { APIRoute } from 'astro';
import { unlockVault, isVaultSetup } from '../../../lib/auth/vault';
import { json } from '../../../lib/api';

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies }) => {
  if (!isVaultSetup()) {
    return json({ ok: false, error: 'Vault has not been set up yet.' }, 400);
  }

  try {
    const body = await request.json();
    const password = String(body.password ?? '');

    if (!password) {
      return json({ ok: false, error: 'Password is required.' }, 400);
    }

    const res = unlockVault(password);
    if (!res.success || !res.token) {
      return json({ ok: false, error: res.error ?? 'Incorrect master password.' }, 401);
    }

    cookies.set('diary_session', res.token, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24,
    });

    return json({ ok: true });
  } catch {
    return json({ ok: false, error: 'Invalid request format.' }, 400);
  }
};
