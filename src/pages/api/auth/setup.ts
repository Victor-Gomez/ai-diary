import type { APIRoute } from 'astro';
import { isVaultSetup, setupVault } from '../../../lib/auth/vault';
import { json } from '../../../lib/api';

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies }) => {
  if (isVaultSetup()) {
    return json({ ok: false, error: 'Vault is already configured.' }, 400);
  }

  try {
    const body = await request.json();
    const password = String(body.password ?? '');

    if (!password || password.length < 6) {
      return json({ ok: false, error: 'Master password must be at least 6 characters.' }, 400);
    }

    const res = setupVault(password);
    if (!res.success || !res.token) {
      return json({ ok: false, error: res.error ?? 'Failed to configure vault.' }, 500);
    }

    cookies.set('diary_session', res.token, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24, // 24 hours
    });

    return json({ ok: true });
  } catch {
    return json({ ok: false, error: 'Invalid request format.' }, 400);
  }
};
