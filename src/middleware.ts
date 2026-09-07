import { defineMiddleware } from 'astro:middleware';
import { validateSession } from './lib/auth/vault';

const PUBLIC_PATHS = [
  '/unlock',
  '/api/auth/',
  '/_astro/',
  '/_image',
  '/favicon.svg',
  '/logo.svg',
];

export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname } = context.url;

  // Allow public paths, static assets, and authentication endpoints
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return next();
  }

  const token = context.cookies.get('diary_session')?.value;
  const isUnlocked = validateSession(token);

  if (!isUnlocked) {
    if (pathname.startsWith('/api/')) {
      return new Response(
        JSON.stringify({ ok: false, error: 'locked', message: 'Vault is locked. Master password required.' }),
        {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }

    const returnTo = encodeURIComponent(pathname + context.url.search);
    return context.redirect(`/unlock?returnTo=${returnTo}`);
  }

  return next();
});
