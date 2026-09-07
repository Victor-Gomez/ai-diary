/** Small helpers for JSON API responses in Astro endpoints. */

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export function badRequest(message: string): Response {
  return json({ error: message }, 400);
}

export function notFound(message = 'Not found'): Response {
  return json({ error: message }, 404);
}

export function serverError(message: string): Response {
  return json({ error: message }, 500);
}

export async function readJson<T>(request: Request): Promise<T> {
  return (await request.json()) as T;
}
