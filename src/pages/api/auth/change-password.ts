import type { APIRoute } from 'astro';
import { changeMasterPassword, validateSession } from '../../../lib/auth/vault';
import { json } from '../../../lib/api';

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies }) => {
  const token = cookies.get('diary_session')?.value;
  if (!validateSession(token)) {
    return json({ ok: false, error: 'Unauthorized. Vault must be unlocked.' }, 401);
  }

  try {
    const body = await request.json();
    const currentPassword = String(body.currentPassword ?? '');
    const newPassword = String(body.newPassword ?? '');

    if (!currentPassword || !newPassword) {
      return json({ ok: false, error: 'Current and new passwords are required.' }, 400);
    }

    const res = changeMasterPassword(currentPassword, newPassword);
    if (!res.success) {
      return json({ ok: false, error: res.error ?? 'Failed to update password.' }, 400);
    }

    return json({ ok: true });
  } catch {
    return json({ ok: false, error: 'Invalid request format.' }, 400);
  }
};
